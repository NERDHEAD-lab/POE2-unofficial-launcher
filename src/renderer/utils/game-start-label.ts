import { RunStatus } from "../../shared/types";

const UPDATE_LABEL_SUPPRESSED_STATUSES: RunStatus[] = [
  "preparing",
  "processing",
  "authenticating",
  "ready",
  "running",
];

export const shouldShowUpdateLabel = (
  status: RunStatus,
  isUpdateNeeded: boolean,
) => {
  return (
    isUpdateNeeded &&
    status !== "uninstalled" &&
    !UPDATE_LABEL_SUPPRESSED_STATUSES.includes(status)
  );
};

export const getGameStartButtonLabel = (
  status: RunStatus,
  isUpdateNeeded: boolean,
) => {
  if (status === "uninstalled") return "설치하기";
  if (shouldShowUpdateLabel(status, isUpdateNeeded)) return "업데이트";
  return "게임 시작";
};
