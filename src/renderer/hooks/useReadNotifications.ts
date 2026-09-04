import { useEffect, useState } from "react";

const STORAGE_KEY = "poe-launcher:read-notifications";
const MAX_READ_IDS = 500;

// Browser-window session only: reloads retain read state; app restarts reset it.
export function useReadNotifications() {
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored: unknown = JSON.parse(
        window.sessionStorage.getItem(STORAGE_KEY) ?? "[]",
      );
      return new Set(
        Array.isArray(stored)
          ? stored
              .filter((id): id is string => typeof id === "string")
              .slice(-MAX_READ_IDS)
          : [],
      );
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...readIds]));
    } catch {
      // Reading an alert still works when browser storage is unavailable.
    }
  }, [readIds]);

  const markRead = (id: string) => {
    setReadIds((prev) =>
      prev.has(id) ? prev : new Set([...prev, id].slice(-MAX_READ_IDS)),
    );
  };

  return { readIds, markRead };
}
