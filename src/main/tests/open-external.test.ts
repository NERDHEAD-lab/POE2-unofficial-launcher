import { beforeEach, describe, expect, it, vi } from "vitest";

import { openExternalSafely } from "../utils/open-external";

const mocks = vi.hoisted(() => ({
  clipboardWriteText: vi.fn(),
  dialogShowMessageBox: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  shellOpenExternal: vi.fn(),
}));

vi.mock("electron", () => ({
  clipboard: {
    writeText: mocks.clipboardWriteText,
  },
  dialog: {
    showMessageBox: mocks.dialogShowMessageBox,
  },
  shell: {
    openExternal: mocks.shellOpenExternal,
  },
}));

vi.mock("../utils/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
}));

describe("openExternalSafely", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dialogShowMessageBox.mockResolvedValue({ response: 1 });
    mocks.shellOpenExternal.mockResolvedValue(undefined);
  });

  it("opens the URL without showing recovery UI when a browser is available", async () => {
    await expect(openExternalSafely("https://example.com")).resolves.toBe(true);

    expect(mocks.shellOpenExternal).toHaveBeenCalledWith("https://example.com");
    expect(mocks.dialogShowMessageBox).not.toHaveBeenCalled();
    expect(mocks.clipboardWriteText).not.toHaveBeenCalled();
  });

  it("turns browser launch failures into a non-fatal recovery dialog", async () => {
    const openError = new Error("Failed to open: application not found");
    mocks.shellOpenExternal.mockRejectedValueOnce(openError);

    await expect(openExternalSafely("https://example.com")).resolves.toBe(
      false,
    );

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "[ExternalLink] Failed to open URL in the default browser.",
      openError,
    );
    expect(mocks.dialogShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "기본 브라우저에서 링크를 열지 못했습니다.",
        buttons: ["링크 복사", "확인"],
      }),
    );
  });

  it("attaches the recovery dialog to a live parent window", async () => {
    const parentWindow = {
      isDestroyed: vi.fn(() => false),
    } as unknown as NonNullable<Parameters<typeof openExternalSafely>[1]>;
    mocks.shellOpenExternal.mockRejectedValueOnce(new Error("no browser"));

    await openExternalSafely("https://example.com", parentWindow);

    expect(mocks.dialogShowMessageBox).toHaveBeenCalledWith(
      parentWindow,
      expect.objectContaining({
        message: "기본 브라우저에서 링크를 열지 못했습니다.",
      }),
    );
  });

  it("skips recovery UI when the parent window was destroyed", async () => {
    const parentWindow = {
      isDestroyed: vi.fn(() => true),
    } as unknown as NonNullable<Parameters<typeof openExternalSafely>[1]>;
    mocks.shellOpenExternal.mockRejectedValueOnce(new Error("no browser"));

    await expect(
      openExternalSafely("https://example.com", parentWindow),
    ).resolves.toBe(false);

    expect(mocks.dialogShowMessageBox).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "[ExternalLink] Skipped the recovery dialog because its parent window was destroyed.",
    );
  });

  it("copies the original URL when the user selects link copy", async () => {
    mocks.shellOpenExternal.mockRejectedValueOnce(new Error("no browser"));
    mocks.dialogShowMessageBox.mockResolvedValueOnce({ response: 0 });

    await openExternalSafely("https://example.com/path?q=1");

    expect(mocks.clipboardWriteText).toHaveBeenCalledWith(
      "https://example.com/path?q=1",
    );
  });

  it("does not reject even if the recovery dialog also fails", async () => {
    const dialogError = new Error("dialog unavailable");
    mocks.shellOpenExternal.mockRejectedValueOnce(new Error("no browser"));
    mocks.dialogShowMessageBox.mockRejectedValueOnce(dialogError);

    await expect(openExternalSafely("https://example.com")).resolves.toBe(
      false,
    );

    expect(mocks.loggerError).toHaveBeenCalledWith(
      "[ExternalLink] Failed to show the recovery dialog.",
      dialogError,
    );
  });

  it("does not reject when copying the fallback URL fails", async () => {
    const clipboardError = new Error("clipboard unavailable");
    mocks.shellOpenExternal.mockRejectedValueOnce(new Error("no browser"));
    mocks.dialogShowMessageBox.mockResolvedValueOnce({ response: 0 });
    mocks.clipboardWriteText.mockImplementationOnce(() => {
      throw clipboardError;
    });

    await expect(openExternalSafely("https://example.com")).resolves.toBe(
      false,
    );

    expect(mocks.loggerError).toHaveBeenCalledWith(
      "[ExternalLink] Failed to copy URL to the clipboard.",
      clipboardError,
    );
  });
});
