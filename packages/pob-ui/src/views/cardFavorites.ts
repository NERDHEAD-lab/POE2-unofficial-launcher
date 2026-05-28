export function readFavoriteIds(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(isString) : []);
  } catch {
    return new Set();
  }
}

export function writeFavoriteIds(
  storageKey: string,
  favoriteIds: ReadonlySet<string>,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify([...favoriteIds]));
}

export function toggleFavoriteId(
  favoriteIds: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(favoriteIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function sortSectionsByFavorites<T extends { id: string }>(
  sections: T[],
  favoriteIds: ReadonlySet<string>,
): T[] {
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => {
      const aFavorite = favoriteIds.has(a.section.id);
      const bFavorite = favoriteIds.has(b.section.id);
      if (aFavorite !== bFavorite) return aFavorite ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.section);
}

const isString = (value: unknown): value is string => typeof value === "string";
