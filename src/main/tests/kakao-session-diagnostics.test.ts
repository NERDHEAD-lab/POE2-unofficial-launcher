// @vitest-environment node
import { session } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatKakaoDiagnostic,
  parseKakaoDiagnostic,
} from "../../shared/kakao-diagnostics";
import { KakaoChallengeGate } from "../kakao/cloudflare-challenge";
import { createKakaoPageFilter, initKakaoSession } from "../kakao/session";

vi.mock("electron", () => ({ session: { fromPartition: vi.fn() } }));
vi.mock("../security/permissions", () => ({ setupSessionSecurity: vi.fn() }));

describe("Kakao request failure diagnostics", () => {
  const webRequest = {
    onSendHeaders: vi.fn(),
    onResponseStarted: vi.fn(),
    onErrorOccurred: vi.fn(),
    onBeforeRequest: vi.fn(),
  };
  const cookies = { on: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(session.fromPartition).mockReturnValue({
      webRequest,
      cookies,
    } as unknown as Electron.Session);
  });
  it("observes one partition through window recreation and samples safe cumulative counts per cookie class", () => {
    const log = vi.fn();
    const gate = new KakaoChallengeGate(vi.fn());
    initKakaoSession(gate, log);
    initKakaoSession(gate, log);
    expect(cookies.on).toHaveBeenCalledOnce();
    const changed = cookies.on.mock.calls[0][1];
    const account = {
      domain: ".SECRET.kakao.com",
      name: "SECRET_NAME",
      value: "SECRET_VALUE",
      path: "/SECRET",
      expirationDate: 123456789,
      session: false,
    };
    const daum = { ...account, domain: "logins.daum.net", session: true };
    changed({}, { ...account, domain: "notkakao.com" }, "inserted", false);
    for (let i = 0; i < 4; i++) {
      changed({}, account, "inserted", false);
      changed({}, daum, "expired", true);
    }
    expect(
      log.mock.calls.map(([id, event, fields]) => [
        id,
        event,
        parseKakaoDiagnostic(formatKakaoDiagnostic(event, fields)),
      ]),
    ).toEqual(
      [1, 2, 4].flatMap((cookieCount) => [
        [
          null,
          "session.cookie",
          {
            v: 1,
            event: "session.cookie",
            cookieGroup: "kakao.com",
            cookieLife: "persistent",
            cookieCause: "inserted",
            removed: false,
            cookieCount,
          },
        ],
        [
          null,
          "session.cookie",
          {
            v: 1,
            event: "session.cookie",
            cookieGroup: "daum.net",
            cookieLife: "session",
            cookieCause: "expired",
            removed: true,
            cookieCount,
          },
        ],
      ]),
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/SECRET|123456789/);
  });

  it("distinguishes accepted account confirmation from redirect signals and ignores stale results", () => {
    const log = vi.fn();
    const gate = new KakaoChallengeGate(vi.fn());
    const filter = createKakaoPageFilter(gate, log);
    const mainFrame = {};
    const event = {
      sender: {
        id: 5,
        mainFrame,
        session: session.fromPartition("persist:kakao_game"),
      },
      senderFrame: mainFrame,
    } as unknown as Electron.IpcMainEvent;
    expect(filter(event, null, "kakao:account-id-fetched")).toBe(true);
    gate.setTrigger(5, "ACCOUNT_VALIDATION");
    gate.commit(5, "https://poe.kakaogames.com/");
    const doc = gate.pageState(5).documentId;
    expect(filter(event, doc, "kakao:account-id-fetched")).toBe(true);
    for (const url of [
      "https://accounts.kakao.com/login?SECRET#SECRET",
      "https://poe.kakaogames.com/login?SECRET",
      "https://SECRET.invalid/",
    ]) {
      filter(event, doc, "kakao:login-required", url);
    }
    gate.beginNavigation(5);
    expect(filter(event, doc, "kakao:account-id-fetched")).toBe(false);
    const results = log.mock.calls
      .filter(([, event]) => event === "account.result")
      .map(
        ([, event, fields]) =>
          parseKakaoDiagnostic(formatKakaoDiagnostic(event, fields))
            ?.accountResult,
      );
    expect(results).toEqual([
      "account-confirmed",
      "kakao-login-url",
      "daum-redirect-stalled",
      "login-required-unknown",
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    gate.commit(5, "https://poe.kakaogames.com/");
    log.mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(
      filter(event, gate.pageState(5).documentId, "kakao:account-id-fetched"),
    ).toBe(true);
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
