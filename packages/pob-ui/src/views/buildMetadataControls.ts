import type {
  PobBuildMetadataAscendancyOption,
  PobBuildMetadataSnapshot,
} from "@poe2-launcher/shared/types";

export const sanitizeBuildLevelInput = (value: string): string =>
  value.replace(/\D/g, "").slice(0, 3);

export const buildLevelActionValue = (value: string): number => {
  const parsed = Number(sanitizeBuildLevelInput(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
};

export const resolveBuildMetadataAscendancies = (
  snapshot: PobBuildMetadataSnapshot | null,
): PobBuildMetadataAscendancyOption[] => {
  if (!snapshot) return [];
  const selectedClass = snapshot.classes.find(
    (classOption) => classOption.id === snapshot.classId,
  );
  return selectedClass?.ascendancies ?? [];
};
