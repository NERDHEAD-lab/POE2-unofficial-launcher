import { LogEntry } from "./types";

const MAX_MERGE_LINES = 3;

export const getHash = (s: string) => {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
};

export const isSameLog = (a: LogEntry, b: LogEntry) =>
  (a.contentHash || getHash(a.content + a.type + a.isError)) ===
  (b.contentHash || getHash(b.content + b.type + b.isError));

export const mergeLog = (prevArray: LogEntry[], log: LogEntry): LogEntry[] => {
  const hash = getHash(log.content + log.type + log.isError);
  const newEntry: LogEntry = { ...log, count: 1, contentHash: hash };
  if (prevArray.length === 0) return [newEntry];

  const lastLog = prevArray[prevArray.length - 1];
  if (isSameLog(lastLog, newEntry)) {
    const updatedLastLog = {
      ...lastLog,
      count: (lastLog.count || 1) + 1,
      timestamp: newEntry.timestamp,
    };
    return [...prevArray.slice(0, -1), updatedLastLog];
  }

  for (let n = MAX_MERGE_LINES; n >= 2; n--) {
    if (prevArray.length >= 2 * n - 1) {
      const tailSize = n - 1;
      const currentIncomingSet = [...prevArray.slice(-tailSize), newEntry];
      const previousStableSet = prevArray.slice(-(n + tailSize), -tailSize);

      let isMatch = true;
      for (let i = 0; i < n; i++) {
        if (!isSameLog(previousStableSet[i], currentIncomingSet[i])) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) {
        const firstType = previousStableSet[0].type;
        const isSameType = previousStableSet.every(
          (it) => it.type === firstType,
        );
        if (isSameType) {
          const groupId = getHash(
            previousStableSet.map((it) => it.contentHash || "").join("|"),
          );
          const updatedSlice = previousStableSet.map((it, idx) => ({
            ...it,
            count: (it.count || 1) + 1,
            timestamp: currentIncomingSet[idx].timestamp,
            mergeGroupId: groupId,
            mergeGroupSize: n,
          }));
          return [...prevArray.slice(0, -(n + tailSize)), ...updatedSlice];
        }
      }
    }
  }
  const updatedPrev = [...prevArray, newEntry];
  return updatedPrev.length > 2000 ? updatedPrev.slice(-2000) : updatedPrev;
};
