import type { PobMainSkillSummarySnapshot } from "@poe2-launcher/shared/types";

export const MAIN_SKILL_SUMMARY_MIN_HEIGHT = 120;
export const MAIN_SKILL_SUMMARY_DEFAULT_HEIGHT = 220;
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
  if (!Number.isFinite(height)) return MAIN_SKILL_SUMMARY_DEFAULT_HEIGHT;
  return Math.min(
    maxHeight,
    Math.max(MAIN_SKILL_SUMMARY_MIN_HEIGHT, Math.round(height)),
  );
}
