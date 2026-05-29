export const POB_UNIMPLEMENTED_CONTROL_CLASS = "pob-control-unimplemented";

export const POB_UNIMPLEMENTED_REASON_CODES = [
  "not-implemented",
  "parity-deferred",
  "external-service",
] as const;

export type PobUnimplementedReason =
  (typeof POB_UNIMPLEMENTED_REASON_CODES)[number];

export const POB_UNIMPLEMENTED_CONTROLS = [
  {
    id: "ui-mode.switch",
    reason: "parity-deferred",
    messageKey: "uiMode.disabled",
  },
  {
    id: "import-export.share-url",
    reason: "external-service",
    messageKey: "buildEdit.importExport.error.shareUnsupported",
  },
  {
    id: "import-export.character-auth",
    reason: "external-service",
    messageKey: "buildEdit.importExport.error.characterUnsupported",
  },
  {
    id: "import-export.character-tree",
    reason: "external-service",
    messageKey: "buildEdit.importExport.error.characterUnsupported",
  },
  {
    id: "import-export.character-items",
    reason: "external-service",
    messageKey: "buildEdit.importExport.error.characterUnsupported",
  },
  {
    id: "tree.find-timeless-jewel",
    reason: "parity-deferred",
    messageKey: "buildEdit.tree.findTimelessJewelDisabled",
  },
  {
    id: "items.set-manage",
    reason: "parity-deferred",
    messageKey: "buildEdit.items.setManageDisabled",
  },
  {
    id: "items.price-check",
    reason: "external-service",
    messageKey: "buildEdit.items.priceCheckDisabled",
  },
  {
    id: "items.craft",
    reason: "parity-deferred",
    messageKey: "buildEdit.items.craftDisabled",
  },
  {
    id: "calcs.spectre-library",
    reason: "parity-deferred",
    messageKey: "buildEdit.calcs.skillSelect.spectreLibraryDisabled",
  },
  {
    id: "calcs.beast-library",
    reason: "parity-deferred",
    messageKey: "buildEdit.calcs.skillSelect.beastLibraryDisabled",
  },
] as const;

export type PobUnimplementedControlId =
  (typeof POB_UNIMPLEMENTED_CONTROLS)[number]["id"];

export interface PobUnimplementedControlDefinition {
  id: PobUnimplementedControlId;
  reason: PobUnimplementedReason;
  messageKey: string;
}

export const getPobUnimplementedControlDefinition = (
  id: PobUnimplementedControlId,
): PobUnimplementedControlDefinition => {
  const definition = POB_UNIMPLEMENTED_CONTROLS.find(
    (control) => control.id === id,
  );
  if (!definition) {
    throw new Error(`Unknown PoB unimplemented control: ${id}`);
  }
  return definition;
};

export const buildPobUnimplementedClassName = (className?: string): string =>
  [className, POB_UNIMPLEMENTED_CONTROL_CLASS].filter(Boolean).join(" ");

export const getPobUnimplementedControlAttributes = (
  id: PobUnimplementedControlId,
) => {
  const definition = getPobUnimplementedControlDefinition(id);
  return {
    "aria-disabled": true,
    "data-pob-unimplemented": definition.id,
    "data-pob-disabled-reason": definition.reason,
  } as const;
};
