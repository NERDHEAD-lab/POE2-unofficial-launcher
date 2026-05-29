import fs from "node:fs";
import path from "node:path";

export const POB_INSTALL_LOCATION_ENV = "POB_INSTALL_LOCATION";
export const POB_SOURCE_REQUIRED_ENV = "POB_SOURCE_REQUIRED";
export const POB_SOURCE_SENTINEL = path.join("Modules", "Build.lua");

const LEGACY_POB_SOURCE_ROOT = "D:\\project_poe2\\PathOfBuilding-PoE2-KR\\src";

export interface PobTestSourceResolution {
  sourceRoot: string;
  sentinelPath: string;
  sourceAvailable: boolean;
  sourceRequired: boolean;
  searchedRoots: readonly string[];
}

interface PobTestSourceOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  cacheSourceRoot?: string;
  legacySourceRoot?: string;
  exists?: (targetPath: string) => boolean;
}

const isEnabled = (value: string | undefined) =>
  value === "1" || value?.toLowerCase() === "true";

const compact = (values: readonly (string | undefined)[]) =>
  values.filter((value): value is string => Boolean(value));

export const resolvePobTestSource = (
  options: PobTestSourceOptions = {},
): PobTestSourceResolution => {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const exists = options.exists ?? fs.existsSync;
  const cacheSourceRoot =
    options.cacheSourceRoot ?? path.resolve(cwd, ".cache", "pob-source", "src");
  const legacySourceRoot = options.legacySourceRoot ?? LEGACY_POB_SOURCE_ROOT;
  const searchedRoots = compact([
    env[POB_INSTALL_LOCATION_ENV],
    cacheSourceRoot,
    legacySourceRoot,
  ]);

  const sourceRoot =
    searchedRoots.find((candidate) =>
      exists(path.join(candidate, POB_SOURCE_SENTINEL)),
    ) ?? cacheSourceRoot;
  const sentinelPath = path.join(sourceRoot, POB_SOURCE_SENTINEL);

  return {
    sourceRoot,
    sentinelPath,
    sourceAvailable: exists(sentinelPath),
    sourceRequired: isEnabled(env[POB_SOURCE_REQUIRED_ENV]),
    searchedRoots,
  };
};

export const shouldRunPobSourceTest = (source: PobTestSourceResolution) =>
  source.sourceAvailable || source.sourceRequired;

export function assertPobTestSourceAvailable(
  source: PobTestSourceResolution,
): asserts source is PobTestSourceResolution & { sourceAvailable: true } {
  if (source.sourceAvailable) {
    return;
  }

  throw new Error(
    [
      "PoB source is required but Modules/Build.lua was not found.",
      `Checked: ${source.searchedRoots.join(", ")}`,
      "Run `npm run pob:source:prepare` or set POB_INSTALL_LOCATION to a PoB source `src` directory.",
    ].join("\n"),
  );
}
