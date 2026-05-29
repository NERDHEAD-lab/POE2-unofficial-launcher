import type {
  PobBuildMetadataAscendancyOption,
  PobBuildMetadataSnapshot,
  PobPassivePointBudget,
  PobPassivePointBudgetBucket,
} from "@poe2-launcher/shared/types";

export type PassivePointBudgetDisplayId =
  | "normal"
  | "weaponSet1"
  | "weaponSet2"
  | "ascendancy";

export type PassivePointBudgetTone = "default" | "negative" | "positive";

export interface PassivePointBudgetDisplayItem {
  id: PassivePointBudgetDisplayId;
  bucket: PobPassivePointBudgetBucket;
  tone: PassivePointBudgetTone;
}

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

export const buildPassivePointBudgetDisplayItems = (
  budget: PobPassivePointBudget,
): PassivePointBudgetDisplayItem[] => [
  {
    id: "normal",
    bucket: budget.normal,
    tone: budget.normal.exceeded ? "negative" : "default",
  },
  {
    id: "weaponSet1",
    bucket: budget.weaponSet1,
    tone: "negative",
  },
  {
    id: "weaponSet2",
    bucket: budget.weaponSet2,
    tone: "positive",
  },
  {
    id: "ascendancy",
    bucket: budget.ascendancy,
    tone: budget.ascendancy.exceeded ? "negative" : "default",
  },
];
