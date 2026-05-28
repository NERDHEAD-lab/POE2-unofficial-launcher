import type { PobMainSkillSummarySnapshot } from "@poe2-launcher/shared/types";

export const MAIN_SKILL_SUMMARY_MIN_HEIGHT = 120;
export const MAIN_SKILL_SUMMARY_DEFAULT_RATIO = 0.5;
export const MAIN_SKILL_SUMMARY_MAX_HEIGHT = 960;
export const MAIN_SKILL_SUMMARY_RESERVED_HEIGHT = 260;

export type MainSkillSummaryPanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: PobMainSkillSummarySnapshot }
  | { status: "error"; reason: string };

export interface MainSkillSummaryDisplayRow {
  id: string;
  kind: "stat" | "text" | "spacer";
  label: string;
  value: string;
  text: string;
}

const present = (value: string | null): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "-";
};

export function getMainSkillSummaryTitle(
  snapshot: PobMainSkillSummarySnapshot,
  fallback: string,
): string {
  const mainSkill = snapshot.mainSkillLabel?.trim();
  if (mainSkill) return mainSkill;
  const socketGroup = snapshot.socketGroupLabel?.trim();
  return socketGroup || fallback;
}

export function buildMainSkillSummaryRows(
  snapshot: PobMainSkillSummarySnapshot,
): MainSkillSummaryDisplayRow[] {
  return snapshot.rows.map((row, index) => ({
    id: `${row.kind}-${index}`,
    kind: row.kind,
    label: present(row.label),
    value: present(row.value),
    text: present(row.text),
  }));
}

export function getMainSkillSummaryMaxHeight(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight)) return MAIN_SKILL_SUMMARY_MAX_HEIGHT;
  return Math.max(
    MAIN_SKILL_SUMMARY_MIN_HEIGHT,
    Math.min(
      MAIN_SKILL_SUMMARY_MAX_HEIGHT,
      Math.round(viewportHeight - MAIN_SKILL_SUMMARY_RESERVED_HEIGHT),
    ),
  );
}

export function clampMainSkillSummaryHeight(
  height: number,
  maxHeight = MAIN_SKILL_SUMMARY_MAX_HEIGHT,
): number {
  if (!Number.isFinite(height)) {
    return Math.round(
      MAIN_SKILL_SUMMARY_MIN_HEIGHT / MAIN_SKILL_SUMMARY_DEFAULT_RATIO,
    );
  }
  return Math.min(
    maxHeight,
    Math.max(MAIN_SKILL_SUMMARY_MIN_HEIGHT, Math.round(height)),
  );
}

export function getMainSkillSummaryHeightForRatio(
  ratio: number,
  maxHeight: number,
): number {
  const safeRatio = Number.isFinite(ratio)
    ? Math.min(1, Math.max(0, ratio))
    : MAIN_SKILL_SUMMARY_DEFAULT_RATIO;
  return clampMainSkillSummaryHeight(maxHeight * safeRatio, maxHeight);
}

export function getMainSkillSummaryDefaultHeight(
  viewportHeight: number,
): number {
  const maxHeight = getMainSkillSummaryMaxHeight(viewportHeight);
  return getMainSkillSummaryHeightForRatio(
    MAIN_SKILL_SUMMARY_DEFAULT_RATIO,
    maxHeight,
  );
}

export function getMainSkillSummaryHeightRatio(
  height: number,
  maxHeight: number,
): number {
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(maxHeight) ||
    maxHeight <= 0
  ) {
    return MAIN_SKILL_SUMMARY_DEFAULT_RATIO;
  }
  return Math.min(1, Math.max(0, height / maxHeight));
}
