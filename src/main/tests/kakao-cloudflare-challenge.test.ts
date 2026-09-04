import { describe, expect, it, vi } from "vitest";

import { KakaoChallengeGate } from "../kakao/cloudflare-challenge";

const url = "https://poe.kakaogames.com/#validateLogin";
const challenge = { "Cf-Mitigated": ["challenge"] };

function setup(trigger = "ACCOUNT_VALIDATION") {
  const onChallenge = vi.fn();
  const gate = new KakaoChallengeGate(onChallenge);
  gate.setTrigger(1, trigger);
  return { gate, onChallenge };
}

function respond(
  gate: KakaoChallengeGate,
  id: number,
  headers: Record<string, string[]> = challenge,
  webContentsId = 1,
  target = url,
) {
  gate.requestStarted({
    id,
    webContentsId,
    url: target,
    resourceType: "mainFrame",
  });
  gate.responseStarted({
    id,
    webContentsId,
    url: target,
    resourceType: "mainFrame",
    statusCode: 403,
    responseHeaders: headers,
  });
}

describe("Kakao Cloudflare challenge gate", () => {
  it("resumes a waiting sibling when the last challenge in its task finishes", () => {
    const resumed = vi.fn();
    const gate = new KakaoChallengeGate(vi.fn(), resumed);
    gate.setTrigger(1, "GAME_START_POE1");
    respond(gate, 1, {});
    gate.commit(1, url);
    gate.setTrigger(2, "GAME_START_POE1", 1);
    respond(gate, 2, challenge, 2);
    gate.commit(2, url);
    expect(gate.pageState(1).blocked).toBe(true);
    gate.beginNavigation(2);
    respond(gate, 3, {}, 2);
    gate.commit(2, url);
    expect(resumed).toHaveBeenCalledExactlyOnceWith([1, 2]);
    expect(gate.pageState(1).blocked).toBe(false);
  });

  it("retires the previous task's popups when a new task takes over", () => {
    const { gate } = setup();
    gate.setTrigger(2, "ACCOUNT_VALIDATION", 1);
    respond(gate, 1, {}, 2);
    gate.commit(2, url);
    const oldDocument = gate.pageState(2).documentId;
    gate.setTrigger(3, "ACCOUNT_VALIDATION", 1);
    respond(gate, 2, challenge, 3);
    gate.setTrigger(1, "GAME_START_POE2");
    expect(gate.hasChallenge("ACCOUNT_VALIDATION")).toBe(false);
    expect(gate.accepts(2, oldDocument)).toBe(false);
    expect(gate.pageState(2).blocked).toBe(true);
    expect(gate.taskBlocked(3)).toBe(false);
  });

  it("restores the committed normal document if the first challenge response is cancelled", () => {
    const { gate } = setup();
    respond(gate, 1, {});
    gate.commit(1, url);
    const documentId = gate.pageState(1).documentId;
    gate.beginNavigation(1);
    respond(gate, 2);
    gate.requestFailed({ id: 2, webContentsId: 1 });
    expect(gate.taskBlocked(1)).toBe(false);
    expect(gate.accepts(1, documentId)).toBe(true);
  });
  it("blocks a challenge before page handlers and notifies only once", () => {
    const { gate, onChallenge } = setup();
    respond(gate, 10);
    gate.commit(1, url);
    expect(gate.pageState(1).blocked).toBe(true);
    expect(gate.taskBlocked(1)).toBe(true);
    respond(gate, 11);
    expect(onChallenge).toHaveBeenCalledExactlyOnceWith(1);
  });

  it.each(["GAME_START_POE1", "GAME_START_POE2", "ACCOUNT_MANUAL_LOGIN"])(
    "covers %s",
    (trigger) => {
      const { gate } = setup(trigger);
      respond(
        gate,
        1,
        challenge,
        1,
        "https://pathofexile2.kakaogames.com/main#autoStart",
      );
      expect(gate.taskBlocked(1)).toBe(true);
    },
  );

  it("does not treat a plain 403 or a title as a challenge", () => {
    const { gate } = setup();
    respond(gate, 1, { server: ["cloudflare"], title: ["Just a moment..."] });
    gate.commit(1, url);
    expect(gate.taskBlocked(1)).toBe(false);
    expect(gate.pageState(1).blocked).toBe(false);
  });

  it.each(["subFrame", "xhr"])("ignores %s challenges", (resourceType) => {
    const { gate } = setup();
    gate.requestStarted({ id: 1, webContentsId: 1, url, resourceType });
    gate.responseStarted({
      id: 1,
      webContentsId: 1,
      url,
      resourceType,
      statusCode: 403,
      responseHeaders: challenge,
    });
    expect(gate.taskBlocked(1)).toBe(false);
  });

  it.each([
    "https://unrelated.example/",
    "https://poe.kakaogames.com.evil.example/",
    "http://poe.kakaogames.com/",
  ])("ignores unapproved host/protocol %s", (target) => {
    const { gate } = setup();
    respond(gate, 1, challenge, 1, target);
    expect(gate.taskBlocked(1)).toBe(false);
  });

  it("does not reveal a window without an automation trigger", () => {
    const gate = new KakaoChallengeGate(vi.fn());
    respond(gate, 1);
    expect(gate.taskBlocked(1)).toBe(false);
  });

  it("keeps the challenge through navigation, redirects and headers until normal document commit", () => {
    const { gate } = setup();
    respond(gate, 1);
    gate.commit(1, url);
    gate.beginNavigation(1);
    gate.requestStarted({
      id: 2,
      webContentsId: 1,
      url,
      resourceType: "mainFrame",
    });
    gate.responseStarted({
      id: 2,
      webContentsId: 1,
      url,
      resourceType: "mainFrame",
      statusCode: 302,
      responseHeaders: {},
    });
    gate.commit(1, url);
    expect(gate.taskBlocked(1)).toBe(true);
    respond(gate, 2, {});
    expect(gate.taskBlocked(1)).toBe(true);
    gate.commit(1, url);
    expect(gate.taskBlocked(1)).toBe(false);
    expect(gate.pageState(1).blocked).toBe(false);
  });

  it("ignores late responses and document messages from an older navigation or task", () => {
    const { gate } = setup();
    respond(gate, 1, {});
    gate.commit(1, url);
    const oldDocument = gate.pageState(1).documentId;
    expect(gate.accepts(1, oldDocument)).toBe(true);
    gate.beginNavigation(1);
    respond(gate, 2);
    gate.responseStarted({
      id: 1,
      webContentsId: 1,
      url,
      resourceType: "mainFrame",
      statusCode: 200,
      responseHeaders: {},
    });
    gate.commit(1, url);
    expect(gate.taskBlocked(1)).toBe(true);
    expect(gate.accepts(1, oldDocument)).toBe(false);
    gate.setTrigger(1, "GAME_START_POE2");
    gate.responseStarted({
      id: 2,
      webContentsId: 1,
      url,
      resourceType: "mainFrame",
      statusCode: 403,
      responseHeaders: challenge,
    });
    expect(gate.taskBlocked(1)).toBe(false);
    expect(gate.accepts(1, oldDocument)).toBe(false);
  });

  it("pauses a popup's task without affecting another task and cleans up closed windows", () => {
    const { gate } = setup();
    gate.setTrigger(2, "ACCOUNT_VALIDATION", 1);
    gate.setTrigger(3, "GAME_START_POE2");
    respond(gate, 10, challenge, 2);
    expect(gate.taskBlocked(1)).toBe(true);
    expect(gate.taskBlocked(3)).toBe(false);
    expect(gate.hasChallenge("ACCOUNT_VALIDATION")).toBe(true);
    gate.remove(2);
    expect(gate.taskBlocked(1)).toBe(false);
    expect(gate.hasChallenge("ACCOUNT_VALIDATION")).toBe(false);
  });

  it("preserves a committed challenge when a replacement request is cancelled", () => {
    const { gate } = setup();
    respond(gate, 1);
    gate.commit(1, url);
    gate.beginNavigation(1);
    respond(gate, 2, {});
    gate.requestFailed({ id: 2, webContentsId: 1 });
    gate.commit(1, url);
    expect(gate.taskBlocked(1)).toBe(true);
  });
});
