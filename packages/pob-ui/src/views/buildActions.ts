export const POB_BUILD_ACTIONS = ["importExport", "configuration"] as const;

export type BuildAction = (typeof POB_BUILD_ACTIONS)[number];

export const POB_BUILD_HEADER_ACTIONS = [
  {
    id: "importBuild",
    buildAction: "importExport",
    icon: "file_download",
    labelKey: "buildEdit.actions.importBuild",
    iconOnly: false,
  },
  {
    id: "exportBuild",
    buildAction: "importExport",
    icon: "ios_share",
    labelKey: "buildEdit.actions.exportBuild",
    iconOnly: false,
  },
  {
    id: "configuration",
    buildAction: "configuration",
    icon: "settings",
    labelKey: "buildEdit.actions.configuration",
    iconOnly: true,
  },
] as const satisfies readonly {
  id: string;
  buildAction: BuildAction;
  icon: string;
  labelKey: string;
  iconOnly?: boolean;
}[];

export type BuildHeaderAction = (typeof POB_BUILD_HEADER_ACTIONS)[number];
