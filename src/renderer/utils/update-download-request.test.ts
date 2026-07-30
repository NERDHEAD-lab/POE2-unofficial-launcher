import { describe, expect, it, vi } from "vitest";

import {
  beginUpdateDownloadRequest,
  syncUpdateDownloadRequestLock,
} from "./update-download-request";
import { UPDATE_DOWNLOAD_FAILURE_MESSAGE } from "../../shared/types";

describe("update download request", () => {
  it("enters requesting immediately and ignores repeated clicks", () => {
    const lock = { current: false };
    const setStatus = vi.fn();
    const downloadUpdate = vi.fn();
    const available = {
      state: "available" as const,
      version: "1.6.1",
    };

    expect(
      beginUpdateDownloadRequest(available, lock, setStatus, downloadUpdate),
    ).toBe(true);
    expect(setStatus).toHaveBeenCalledWith({
      state: "requesting",
      progress: 0,
      version: "1.6.1",
    });

    expect(
      beginUpdateDownloadRequest(available, lock, setStatus, downloadUpdate),
    ).toBe(false);
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("unlocks on failure and allows a retry", () => {
    const lock = { current: true };
    const setStatus = vi.fn();
    const downloadUpdate = vi.fn();
    const failure = {
      state: "error" as const,
      message: UPDATE_DOWNLOAD_FAILURE_MESSAGE,
      version: "1.6.1",
    };

    syncUpdateDownloadRequestLock(lock, failure);
    expect(lock.current).toBe(false);

    expect(
      beginUpdateDownloadRequest(failure, lock, setStatus, downloadUpdate),
    ).toBe(true);
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("keeps the lock when a weaker update-check status arrives", () => {
    const lock = { current: true };

    expect(syncUpdateDownloadRequestLock(lock, { state: "checking" })).toBe(
      false,
    );
    expect(lock.current).toBe(true);
  });

  it("keeps terminal download state from being downgraded", () => {
    const lock = { current: true };

    expect(
      syncUpdateDownloadRequestLock(lock, {
        state: "downloaded",
        version: "1.6.1",
      }),
    ).toBe(true);
    expect(lock).toEqual({ current: false, terminal: true });

    expect(
      syncUpdateDownloadRequestLock(lock, {
        state: "available",
        version: "1.6.1",
      }),
    ).toBe(false);
    expect(lock).toEqual({ current: false, terminal: true });
  });
});
