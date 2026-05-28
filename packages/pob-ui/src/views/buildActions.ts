import type { PobUiMode } from "./uiMode";

export const POB_BUILD_ACTIONS = ["importExport", "configuration"] as const;

export type BuildAction = (typeof POB_BUILD_ACTIONS)[number];
export type ImportExportIntent = "import" | "export";

export const POB_BUILD_HEADER_ACTIONS = [
  {
    id: "importBuild",
    buildAction: "importExport",
    intent: "import",
    icon: "file_download",
    labelKey: "buildEdit.actions.importBuild",
    iconOnly: false,
  },
  {
    id: "exportBuild",
    buildAction: "importExport",
    intent: "export",
    icon: "ios_share",
    labelKey: "buildEdit.actions.exportBuild",
    iconOnly: false,
  },
  {
    id: "configuration",
    buildAction: "configuration",
    intent: null,
    icon: "settings",
    labelKey: "buildEdit.actions.configuration",
    iconOnly: true,
  },
] as const satisfies readonly {
  id: string;
  buildAction: BuildAction;
  intent: ImportExportIntent | null;
  icon: string;
  labelKey: string;
  iconOnly?: boolean;
}[];

export interface ImportExportPanelVisibility {
  exportPanel: boolean;
  importPanel: boolean;
  characterImportPanel: boolean;
}

export function resolveImportExportPanelVisibility(
  uiMode: PobUiMode,
  intent: ImportExportIntent,
): ImportExportPanelVisibility {
  if (uiMode === "legacy") {
    return {
      exportPanel: true,
      importPanel: true,
      characterImportPanel: true,
    };
  }

  return {
    exportPanel: intent === "export",
    importPanel: intent === "import",
    characterImportPanel: intent === "import",
  };
}

export type BuildHeaderAction = (typeof POB_BUILD_HEADER_ACTIONS)[number];
