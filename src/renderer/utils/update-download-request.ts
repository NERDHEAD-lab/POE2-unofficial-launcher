import {
  UPDATE_DOWNLOAD_FAILURE_MESSAGE,
  UpdateStatus,
} from "../../shared/types";

export interface UpdateDownloadRequestLock {
  current: boolean;
  terminal?: boolean;
}

export const syncUpdateDownloadRequestLock = (
  lock: UpdateDownloadRequestLock,
  status: UpdateStatus,
): boolean => {
  if (
    (lock.current || lock.terminal) &&
    status.state !== "requesting" &&
    status.state !== "downloading" &&
    status.state !== "downloaded" &&
    status.state !== "error"
  ) {
    return false;
  }

  lock.current =
    status.state === "requesting" || status.state === "downloading";
  lock.terminal = status.state === "downloaded" || status.state === "error";
  return true;
};

export const beginUpdateDownloadRequest = (
  status: UpdateStatus,
  lock: UpdateDownloadRequestLock,
  setStatus: (status: UpdateStatus) => void,
  downloadUpdate: () => void,
): boolean => {
  if (
    lock.current ||
    (status.state !== "available" && status.state !== "error")
  ) {
    return false;
  }

  const version = status.version;
  lock.current = true;
  lock.terminal = false;
  setStatus({
    state: "requesting",
    progress: 0,
    version,
  });

  try {
    downloadUpdate();
    return true;
  } catch {
    lock.current = false;
    lock.terminal = true;
    setStatus({
      state: "error",
      message: UPDATE_DOWNLOAD_FAILURE_MESSAGE,
      version,
    });
    return false;
  }
};
