import type { BuildTarget } from "./views/folderTree";

export interface UnsavedBuildGuard {
  saveName: string;
  isDraft: boolean;
}

export const getUnsavedBuildGuard = (
  dirty: boolean,
  target: BuildTarget,
  draftName: string,
): UnsavedBuildGuard | null => {
  if (!dirty) return null;
  if (target.fileName) {
    return { saveName: target.fileName, isDraft: false };
  }
  return { saveName: draftName, isDraft: true };
};
