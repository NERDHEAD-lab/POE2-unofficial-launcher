import { beforeEach, describe, expect, it, vi } from "vitest";

import { SETTINGS_CONFIG } from "./settings-config";
import { SettingChangeContext } from "./types";

const LOGS_PATH = "C:\\Users\\tester\\AppData\\Roaming\\launcher\\logs";

const logDirectoryItem = SETTINGS_CONFIG.flatMap((category) =>
  category.sections.flatMap((section) => section.items),
).find((item) => item.id === "btn_copy_logs");

if (!logDirectoryItem || logDirectoryItem.type !== "button") {
  throw new Error("btn_copy_logs button setting is missing.");
}

const createContext = (): SettingChangeContext => ({
  showToast: vi.fn(),
  addDescription: vi.fn(),
  resetDescription: vi.fn(),
  setLabel: vi.fn(),
  setDisabled: vi.fn(),
  setVisible: vi.fn(),
  showConfirm: vi.fn(),
  setValue: vi.fn(),
  setButtonText: vi.fn(),
  setVariant: vi.fn(),
  setOptions: vi.fn(),
  getButtonText: vi.fn(() => ""),
  getVariant: vi.fn((): "default" => "default"),
});

describe("로그 폴더 경로 설정", () => {
  const getPath = vi.fn<(name: string) => Promise<string>>();
  const openPath = vi.fn<(path: string) => Promise<void>>();
  const writeText = vi.fn<(text: string) => Promise<void>>();
  const sendDebugLog = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getPath.mockResolvedValue(LOGS_PATH);
    openPath.mockResolvedValue();
    writeText.mockResolvedValue();

    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPath,
        openPath,
        sendDebugLog,
      } as unknown as Window["electronAPI"],
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("초기화 시 canonical 로그 경로를 info 설명으로 표시한다", async () => {
    const context = createContext();

    await logDirectoryItem.onInit?.(context);

    expect(getPath).toHaveBeenCalledWith("logs");
    expect(context.resetDescription).toHaveBeenCalledOnce();
    expect(context.addDescription).toHaveBeenCalledWith(LOGS_PATH, "info");
    expect(openPath).not.toHaveBeenCalled();
  });

  it("경로 조회 실패 시 error 설명과 오류 로그를 남긴다", async () => {
    const context = createContext();
    getPath.mockRejectedValueOnce(new Error("path unavailable"));

    await logDirectoryItem.onInit?.(context);

    expect(context.resetDescription).toHaveBeenCalledOnce();
    expect(context.addDescription).toHaveBeenCalledWith(
      "로그 폴더 경로를 불러오지 못했습니다.",
      "error",
    );
    expect(sendDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(
          "[Settings] Failed to load log directory path:",
        ),
        isError: true,
      }),
    );
    expect(openPath).not.toHaveBeenCalled();
  });

  it("경로 복사 시 canonical 로그 경로와 success 토스트를 사용한다", async () => {
    const context = createContext();

    await logDirectoryItem.onClickListener?.(context);

    expect(getPath).toHaveBeenCalledWith("logs");
    expect(writeText).toHaveBeenCalledWith(LOGS_PATH);
    expect(context.showToast).toHaveBeenCalledWith(
      "로그 폴더 경로가 복사되었습니다.",
      "success",
    );
    expect(openPath).not.toHaveBeenCalled();
  });

  it("클립보드 복사 실패 시 error 토스트와 오류 로그를 남긴다", async () => {
    const context = createContext();
    writeText.mockRejectedValueOnce(new Error("clipboard unavailable"));

    await logDirectoryItem.onClickListener?.(context);

    expect(context.showToast).toHaveBeenCalledWith(
      "로그 폴더 경로 복사에 실패했습니다.",
      "error",
    );
    expect(sendDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(
          "[Settings] Failed to copy log directory path:",
        ),
        isError: true,
      }),
    );
    expect(openPath).not.toHaveBeenCalled();
  });
});
