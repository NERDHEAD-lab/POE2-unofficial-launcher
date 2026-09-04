import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isReady: vi.fn(),
  quit: vi.fn(),
  on: vi.fn(),
  fromPartition: vi.fn(),
  flush: vi.fn(),
  discard: vi.fn(),
  stop: vi.fn(),
  cleanup: vi.fn(),
  showErrorBox: vi.fn(),
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("electron", () => ({
  app: { isReady: mocks.isReady, quit: mocks.quit, on: mocks.on },
  session: { fromPartition: mocks.fromPartition },
  dialog: { showErrorBox: mocks.showErrorBox },
}));
vi.mock("../kakao/automation-page-dump", () => ({
  discardAutomationDumpSession: mocks.discard,
}));
vi.mock("../services/ServiceManager", () => ({
  serviceManager: { stopAll: mocks.stop },
}));
vi.mock("../utils/powershell", () => ({
  PowerShellManager: { getInstance: () => ({ cleanup: mocks.cleanup }) },
}));
vi.mock("../utils/logger", () => ({ logger: mocks.logger }));

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("application shutdown", () => {
  let events: EventEmitter;
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.useFakeTimers();
    events = new EventEmitter();
    mocks.on.mockImplementation((event, listener) =>
      events.on(event, listener),
    );
    mocks.isReady.mockReturnValue(true);
    mocks.fromPartition.mockReturnValue({
      cookies: { flushStore: mocks.flush },
    });
    mocks.flush.mockResolvedValue(undefined);
    mocks.discard.mockResolvedValue(undefined);
    mocks.stop.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("shares preparation and waits for cookie persistence before irreversible cleanup", async () => {
    const storage = deferred();
    const services = deferred();
    mocks.flush.mockReturnValueOnce(storage.promise);
    mocks.stop.mockReturnValueOnce(services.promise);
    const { prepareForShutdown } = await import("../app-shutdown");
    const first = prepareForShutdown();
    const second = prepareForShutdown();
    expect(mocks.fromPartition).toHaveBeenCalledWith("persist:kakao_game");
    expect(mocks.flush).toHaveBeenCalledTimes(1);
    expect(mocks.stop).not.toHaveBeenCalled();
    storage.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    services.resolve();
    await Promise.all([first, second]);
    await prepareForShutdown();
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
    expect(mocks.flush).toHaveBeenCalledTimes(1);
  });

  it("permits retry after a failed cookie write without destroying services", async () => {
    mocks.flush.mockRejectedValueOnce(new Error("disk failure"));
    const { prepareForShutdown } = await import("../app-shutdown");
    await expect(prepareForShutdown()).rejects.toThrow("disk failure");
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
    await prepareForShutdown();
    expect(mocks.flush).toHaveBeenCalledTimes(2);
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  });

  it("aborts after 10 seconds if cookie persistence never completes", async () => {
    mocks.flush.mockReturnValueOnce(new Promise(() => {}));
    const { prepareForShutdown } = await import("../app-shutdown");
    const result = expect(prepareForShutdown()).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    expect(mocks.stop).not.toHaveBeenCalled();
    await prepareForShutdown();
    expect(mocks.flush).toHaveBeenCalledTimes(2);
  });

  it("bounds service shutdown but still cleans up PowerShell before quitting", async () => {
    mocks.stop.mockReturnValueOnce(new Promise(() => {}));
    const { prepareForShutdown } = await import("../app-shutdown");
    const result = prepareForShutdown();
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    expect(mocks.logger.warn).toHaveBeenCalled();
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  });

  it("delays repeated before-quit events and re-enters quit only once after saving", async () => {
    const storage = deferred();
    mocks.flush.mockReturnValueOnce(storage.promise);
    const { registerShutdownHandlers } = await import("../app-shutdown");
    const setQuitting = vi.fn();
    registerShutdownHandlers(setQuitting);
    const first = { preventDefault: vi.fn() };
    const second = { preventDefault: vi.fn() };
    events.emit("before-quit", first);
    events.emit("before-quit", second);
    expect(first.preventDefault).toHaveBeenCalledTimes(1);
    expect(second.preventDefault).toHaveBeenCalledTimes(1);
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(setQuitting).not.toHaveBeenCalledWith(true);
    storage.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.quit).toHaveBeenCalledTimes(1);
    const resumed = { preventDefault: vi.fn() };
    events.emit("before-quit", resumed);
    expect(setQuitting).toHaveBeenCalledWith(true);
    expect(resumed.preventDefault).not.toHaveBeenCalled();
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  });

  it("cancels quit on storage failure and allows a later quit request", async () => {
    mocks.flush.mockRejectedValueOnce(new Error("disk failure"));
    const { registerShutdownHandlers } = await import("../app-shutdown");
    const setQuitting = vi.fn();
    registerShutdownHandlers(setQuitting);
    events.emit("before-quit", { preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(setQuitting).toHaveBeenLastCalledWith(false);
    expect(mocks.showErrorBox).toHaveBeenCalledTimes(1);
    events.emit("before-quit", { preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.quit).toHaveBeenCalledTimes(1);
  });

  it("does not create an Electron session during early bootstrap quit", async () => {
    mocks.isReady.mockReturnValue(false);
    const { registerShutdownHandlers } = await import("../app-shutdown");
    registerShutdownHandlers(vi.fn());
    const event = { preventDefault: vi.fn() };
    events.emit("before-quit", event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mocks.fromPartition).not.toHaveBeenCalled();
  });
});
