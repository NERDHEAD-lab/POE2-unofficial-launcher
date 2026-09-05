// @vitest-environment node
import { session } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KakaoChallengeGate } from "../kakao/cloudflare-challenge";
import { initKakaoSession } from "../kakao/session";

vi.mock("electron", () => ({ session: { fromPartition: vi.fn() } }));
vi.mock("../security/permissions", () => ({ setupSessionSecurity: vi.fn() }));

describe("Kakao request failure diagnostics", () => {
  const webRequest = {
    onSendHeaders: vi.fn(),
    onResponseStarted: vi.fn(),
    onErrorOccurred: vi.fn(),
    onBeforeRequest: vi.fn(),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(session.fromPartition).mockReturnValue({
      webRequest,
    } as unknown as Electron.Session);
  });
  it("distinguishes a failure before request headers, an old request and a restored document", () => {
    const gate = new KakaoChallengeGate(vi.fn());
    const log = vi.fn();
    initKakaoSession(gate, log);
    const sent = webRequest.onSendHeaders.mock.calls[0][0];
    const failed = webRequest.onErrorOccurred.mock.calls[0][0];
    gate.setTrigger(1, "GAME_START_POE2");
    gate.commit(1, "https://security-center.kakaogames.com/auth");
    const doc = gate.pageState(1).documentId;
    gate.beginNavigation(1);
    failed({
      id: 11,
      webContentsId: 1,
      resourceType: "mainFrame",
      url: "kakaogamestarter://private",
      error: "net::ERR_ABORTED",
    });
    expect(log).toHaveBeenLastCalledWith(
      1,
      "request.failed",
      expect.objectContaining({
        reason: "no-request",
        eventRequestId: 11,
        gateDocumentId: null,
      }),
    );
    sent({
      id: 12,
      webContentsId: 1,
      resourceType: "mainFrame",
      url: "https://security-center.kakaogames.com/auth",
    });
    failed({ id: 11, webContentsId: 1, resourceType: "mainFrame" });
    expect(log).toHaveBeenLastCalledWith(
      1,
      "request.failed",
      expect.objectContaining({ reason: "request-mismatch" }),
    );
    failed({ id: 12, webContentsId: 1, resourceType: "mainFrame" });
    expect(log).toHaveBeenLastCalledWith(
      1,
      "request.failed",
      expect.objectContaining({ reason: "restored", gateDocumentId: doc }),
    );
    expect(gate.accepts(1, doc)).toBe(true);
    expect(webRequest.onSendHeaders).toHaveBeenCalledOnce();
    expect(webRequest.onBeforeRequest).toHaveBeenCalledOnce();
  });
});
