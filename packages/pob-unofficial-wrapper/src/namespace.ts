export const POB_WRAPPER_PACKAGE_NAME = "pob-unofficial-wrapper";
export const POB_WRAPPER_PRODUCT_NAME = "PoB 2 Unofficial Wrapper";

export const POB_WRAPPER_USER_DATA_DIRS = {
  standalone: "PoB 2 Unofficial Wrapper",
  launcher: "POE2 Unofficial Launcher - PoB Wrapper",
} as const;

export type PobWrapperHostMode = keyof typeof POB_WRAPPER_USER_DATA_DIRS;

export const resolvePobWrapperUserDataPath = (
  appDataPath: string,
  mode: PobWrapperHostMode,
): string => {
  const normalized = appDataPath.replace(/[\\/]+$/g, "");
  return normalized
    ? `${normalized}\\${POB_WRAPPER_USER_DATA_DIRS[mode]}`
    : POB_WRAPPER_USER_DATA_DIRS[mode];
};
