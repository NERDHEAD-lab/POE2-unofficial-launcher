import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KakaoChallengeGate } from "../kakao/cloudflare-challenge";

const url = "https://poe.kakaogames.com/#validateLogin";

function response(
  gate: KakaoChallengeGate,
  requestId: number,
  id = 1,
  challenge = true,
) {
  const request = {
    id: requestId,
    webContentsId: id,
    url,
    resourceType: "mainFrame",
  };
  gate.requestStarted(request);
  gate.responseStarted({
    ...request,
    statusCode: challenge ? 403 : 200,
    responseHeaders: challenge ? { "cf-mitigated": ["challenge"] } : {},
  });
}

function setup(trigger = "ACCOUNT_VALIDATION") {
  const paused = vi.fn();
  const resumed = vi.fn();
  const reveal = vi.fn();
  const gate = new KakaoChallengeGate(paused, resumed, vi.fn(), reveal);
  gate.setTrigger(1, trigger);
  return { gate, paused, resumed, reveal };
}

describe("Cloudflare reveal grace period", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each([
    "ACCOUNT_VALIDATION",
    "ACCOUNT_MANUAL_LOGIN",
    "GAME_START_POE1",
    "GAME_START_POE2",
  ])("pauses %s immediately but reveals only after five seconds", (trigger) => {
    const { gate, paused, reveal } = setup(trigger);
    response(gate, 1);
    gate.commit(1, url);
    expect(paused).toHaveBeenCalledExactlyOnceWith(1);
    expect(gate.pageState(1).blocked).toBe(true);
    expect(gate.taskBlocked(1)).toBe(true);
    expect(gate.isVisible(1)).toBe(false);
    vi.advanceTimersByTime(4999);
    expect(reveal).not.toHaveBeenCalled();
    expect(gate.isVisible(1)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(gate.isVisible(1)).toBe(true);
    expect(reveal).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("never reveals the observed 4.748-second automatic verification", () => {
    const { gate, reveal, resumed } = setup();
    response(gate, 1);
    gate.commit(1, url);
    vi.advanceTimersByTime(4748);
    expect(gate.isVisible(1)).toBe(false);
    gate.beginNavigation(1);
    response(gate, 2, 1, false);
    gate.commit(1, url);
    vi.advanceTimersByTime(6000);
    expect(reveal).not.toHaveBeenCalled();
    expect(gate.isVisible(1)).toBe(false);
    expect(gate.pageState(1).blocked).toBe(false);
    expect(resumed).toHaveBeenCalledExactlyOnceWith([1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the original deadline across challenge reloads and redirects", () => {
    const { gate, reveal, paused } = setup();
    response(gate, 1);
    gate.commit(1, url);
    vi.advanceTimersByTime(3000);
    gate.beginNavigation(1);
    response(gate, 2);
    gate.responseStarted({
      id: 2,
      webContentsId: 1,
      url,
      resourceType: "mainFrame",
      statusCode: 302,
    });
    gate.commit(1, url);
    vi.advanceTimersByTime(2000);
    expect(paused).toHaveBeenCalledOnce();
    expect(reveal).toHaveBeenCalledExactlyOnceWith(1);
    vi.advanceTimersByTime(5000);
    expect(reveal).toHaveBeenCalledOnce();
  });

  it("cancels a first challenge response when navigation fails", () => {
    const { gate, reveal } = setup();
    response(gate, 1, 1, false);
    gate.commit(1, url);
    const documentId = gate.pageState(1).documentId;
    gate.beginNavigation(1);
    response(gate, 2);
    vi.advanceTimersByTime(4000);
    gate.requestFailed({ id: 2, webContentsId: 1 });
    vi.advanceTimersByTime(5000);
    expect(reveal).not.toHaveBeenCalled();
    expect(gate.accepts(1, documentId)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a committed challenge's deadline and visibility when replacement fails", () => {
    const { gate, reveal } = setup();
    response(gate, 1);
    gate.commit(1, url);
    vi.advanceTimersByTime(3000);
    gate.beginNavigation(1);
    response(gate, 2, 1, false);
    gate.requestFailed({ id: 2, webContentsId: 1 });
    vi.advanceTimersByTime(2000);
    expect(reveal).toHaveBeenCalledExactlyOnceWith(1);
    gate.beginNavigation(1);
    response(gate, 3, 1, false);
    gate.requestFailed({ id: 3, webContentsId: 1 });
    expect(gate.isVisible(1)).toBe(true);
    expect(gate.taskBlocked(1)).toBe(true);
  });

  it.each(["close", "replace-task", "replace-child"])(
    "cancels stale timers on %s",
    (action) => {
      const { gate, reveal } = setup();
      gate.setTrigger(2, "ACCOUNT_VALIDATION", 1);
      response(gate, 1, 2);
      gate.commit(2, url);
      vi.advanceTimersByTime(4000);
      if (action === "close") gate.remove(2);
      else if (action === "replace-task") gate.setTrigger(1, "GAME_START_POE2");
      else gate.setTrigger(2, "GAME_START_POE2", 1);
      vi.advanceTimersByTime(5000);
      expect(reveal).not.toHaveBeenCalled();
      expect(gate.isVisible(2)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("starts a new grace period after normal navigation resolves a shown challenge", () => {
    const { gate, reveal } = setup();
    response(gate, 1);
    gate.commit(1, url);
    vi.advanceTimersByTime(5000);
    response(gate, 2, 1, false);
    expect(gate.isVisible(1)).toBe(true);
    gate.commit(1, url);
    expect(gate.isVisible(1)).toBe(false);
    response(gate, 3);
    vi.advanceTimersByTime(4999);
    expect(gate.isVisible(1)).toBe(false);
    expect(reveal).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(reveal).toHaveBeenCalledTimes(2);
  });

  it("cancels only the resolved sibling and resumes after the last challenge", () => {
    const { gate, reveal, resumed } = setup();
    gate.setTrigger(2, "ACCOUNT_VALIDATION", 1);
    gate.setTrigger(3, "GAME_START_POE2");
    response(gate, 1);
    gate.commit(1, url);
    vi.advanceTimersByTime(1000);
    response(gate, 2, 2);
    gate.commit(2, url);
    response(gate, 3, 3, false);
    gate.commit(3, url);
    vi.advanceTimersByTime(3000);
    response(gate, 4, 1, false);
    gate.commit(1, url);
    expect(gate.taskBlocked(1)).toBe(true);
    expect(gate.taskBlocked(3)).toBe(false);
    expect(resumed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(reveal).toHaveBeenCalledExactlyOnceWith(2);
    gate.remove(2);
    expect(resumed).toHaveBeenCalledExactlyOnceWith([1]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
