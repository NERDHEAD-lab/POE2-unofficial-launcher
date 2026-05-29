import type { BuildMode } from "./buildModes";

export const POB_UI_MODES = ["renewed", "legacy"] as const;

export type PobUiMode = (typeof POB_UI_MODES)[number];

export const DEFAULT_POB_UI_MODE: PobUiMode = "renewed";

export const POB_UI_MODE_SWITCH_ORDER = ["legacy", "renewed"] as const;

export const getNextPobUiMode = (mode: PobUiMode): PobUiMode =>
  mode === "renewed" ? "legacy" : "renewed";

export interface PobUiModePolicy {
  mode: BuildMode;
  legacyParityRequired: readonly string[];
  renewedLayoutAllowed: readonly string[];
}

export const POB_UI_MODE_POLICIES: readonly PobUiModePolicy[] = [
  {
    mode: "tree",
    legacyParityRequired: ["node ids", "alloc state", "tooltip payload"],
    renewedLayoutAllowed: ["canvas viewport", "search and pan controls"],
  },
  {
    mode: "skills",
    legacyParityRequired: ["socket group ids", "gem ids", "sort options"],
    renewedLayoutAllowed: ["group cards", "catalog filtering"],
  },
  {
    mode: "items",
    legacyParityRequired: ["item ids", "slot names", "raw item text"],
    renewedLayoutAllowed: ["detail panels", "favorites", "database layout"],
  },
  {
    mode: "calcs",
    legacyParityRequired: ["section ids", "row labels", "breakdown keys"],
    renewedLayoutAllowed: ["section columns", "summary cards"],
  },
  {
    mode: "party",
    legacyParityRequired: ["section keys", "import destinations", "buff text"],
    renewedLayoutAllowed: ["two-column editor", "action grouping"],
  },
  {
    mode: "notes",
    legacyParityRequired: ["raw text", "colour codes", "dirty flag"],
    renewedLayoutAllowed: ["Markdown preview", "template management"],
  },
];

export interface PobSnapshotProjection<TSnapshot> {
  uiMode: PobUiMode;
  buildMode: BuildMode;
  source: "pob-original";
  snapshot: TSnapshot;
}

export const createPobSnapshotProjection = <TSnapshot>(
  uiMode: PobUiMode,
  buildMode: BuildMode,
  snapshot: TSnapshot,
): PobSnapshotProjection<TSnapshot> => ({
  uiMode,
  buildMode,
  source: "pob-original",
  snapshot,
});

export const preservePobActionPayload = <TAction>(action: TAction): TAction =>
  action;
