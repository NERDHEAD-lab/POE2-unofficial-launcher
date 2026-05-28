import type { BuildEntry } from "../../shared/types";

export type SortKey = "name" | "class" | "lastEdited" | "level";

export const SORT_KEYS: SortKey[] = ["name", "class", "lastEdited", "level"];

export interface BuildTarget {
  subPath: string;
  fileName: string | null;
}

export interface SidebarItemRef {
  kind: "file" | "folder";
  subPath: string;
  name: string;
}

export const ROOT_SUBPATH = "";

export const joinSubPath = (parent: string, name: string): string =>
  parent ? `${parent}/${name}` : name;

export const getParentSubPath = (subPath: string): string => {
  const parts = subPath.split(/[\\/]+/).filter(Boolean);
  parts.pop();
  return parts.join("/");
};

export const getFolderName = (subPath: string, rootLabel: string): string => {
  if (!subPath) return rootLabel;
  const parts = subPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? rootLabel;
};

export const getFolderAncestors = (subPath: string): string[] => {
  const parts = subPath.split(/[\\/]+/).filter(Boolean);
  const ancestors = [ROOT_SUBPATH];
  let acc = "";
  for (const part of parts) {
    acc = joinSubPath(acc, part);
    ancestors.push(acc);
  }
  return ancestors;
};

export const normalizeBuildName = (name: string): string =>
  name.replace(/\.xml$/i, "");

const compareText = (a: string, b: string): number => a.localeCompare(b, "ko");

export const sortBuildEntries = (
  entries: BuildEntry[],
  sortKey: SortKey,
): BuildEntry[] => {
  const folders = entries.filter((entry) => entry.kind === "folder");
  const files = entries.filter((entry) => entry.kind === "file");
  const compareFiles = (a: BuildEntry, b: BuildEntry): number => {
    switch (sortKey) {
      case "name":
        return compareText(a.name, b.name);
      case "class":
        return compareText(a.className ?? "", b.className ?? "");
      case "lastEdited":
        return b.mtime - a.mtime;
      case "level":
        return (b.level ?? 0) - (a.level ?? 0);
    }
  };

  folders.sort((a, b) => compareText(a.name, b.name));
  files.sort(compareFiles);
  return [...folders, ...files];
};

export const filterBuildEntries = (
  entries: BuildEntry[],
  search: string,
): BuildEntry[] => {
  const q = search.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(q) ||
      (entry.className ?? "").toLowerCase().includes(q) ||
      (entry.ascendClassName ?? "").toLowerCase().includes(q),
  );
};

export const getFileEntries = (entries: BuildEntry[]): BuildEntry[] =>
  entries.filter((entry) => entry.kind === "file");

export const getFolderEntries = (entries: BuildEntry[]): BuildEntry[] =>
  entries.filter((entry) => entry.kind === "folder");

export const getNextUnnamedBuildName = (
  entries: BuildEntry[],
  baseName: string,
): string => {
  const names = new Set(
    entries
      .filter((entry) => entry.kind === "file")
      .map((entry) => normalizeBuildName(entry.name).toLowerCase()),
  );

  if (!names.has(baseName.toLowerCase())) return baseName;

  for (let index = 2; index < Number.MAX_SAFE_INTEGER; index += 1) {
    const candidate = `${baseName} (${index})`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }

  return `${baseName} (${Date.now()})`;
};

export const isSameTarget = (a: BuildTarget, b: BuildTarget): boolean =>
  a.subPath === b.subPath && a.fileName === b.fileName;

export const canMoveItemToFolder = (
  item: SidebarItemRef,
  dstSubPath: string,
): boolean => {
  if (item.kind === "file") return item.subPath !== dstSubPath;

  const srcPath = joinSubPath(item.subPath, item.name);
  return dstSubPath !== srcPath && !dstSubPath.startsWith(`${srcPath}/`);
};
