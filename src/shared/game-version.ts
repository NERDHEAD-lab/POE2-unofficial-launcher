import type {
  AppConfig,
  GameVersionContext,
  LocalGameVersion,
  RemoteWebRootPayload,
} from "./types";

/** Versions from game patch servers are opaque identities, not semver. */
export const gameVersionKey = (
  context: Pick<GameVersionContext, "gameId" | "serviceId">,
) => `${context.gameId}_${context.serviceId}`;

export const normalizeInstallPath = (installPath: string) => {
  const value = installPath.replace(/\//g, "\\").toLowerCase();
  return /^[a-z]:\\+$/.test(value)
    ? value.slice(0, 2) + "\\"
    : value.replace(/\\+$/, "");
};

export const gameVersionContextKey = (context: GameVersionContext) =>
  JSON.stringify([
    context.gameId,
    context.serviceId,
    normalizeInstallPath(context.installPath),
  ]);

export const sameVersionContext = (
  left: GameVersionContext,
  right: GameVersionContext,
) =>
  left.gameId === right.gameId &&
  left.serviceId === right.serviceId &&
  normalizeInstallPath(left.installPath) ===
    normalizeInstallPath(right.installPath);

export const versionContextFromConfig = (
  config: AppConfig,
  gameId = config.activeGame,
  serviceId = config.serviceChannel,
): GameVersionContext => ({
  gameId,
  serviceId,
  installPath: config.gameInstallPaths?.[serviceId]?.[gameId] || "",
});

export const isKnownGameVersion = (version?: string) =>
  !!version && version.toLowerCase() !== "unknown";

export function getServerTarget(
  remote: RemoteWebRootPayload | null | undefined,
  context: GameVersionContext,
): RemoteWebRootPayload | null {
  return !!context.installPath &&
    remote?.status === "ok" &&
    remote.source === "master-socket" &&
    sameVersionContext(remote, context) &&
    isKnownGameVersion(remote.version)
    ? remote
    : null;
}

export type GameVersionAssessment =
  "current" | "changed" | "unknown" | "unavailable" | "mismatch";

export function assessGameVersion(
  context: GameVersionContext,
  remote: RemoteWebRootPayload | null | undefined,
  local: LocalGameVersion | undefined,
): GameVersionAssessment {
  if (!remote || remote.status === "unavailable") return "unavailable";
  if (!sameVersionContext(remote, context) || remote.status === "mismatch")
    return "mismatch";
  const target = getServerTarget(remote, context);
  if (!target) return "unknown";
  if (
    !context.installPath ||
    !local?.installPath ||
    normalizeInstallPath(local.installPath) !==
      normalizeInstallPath(context.installPath)
  )
    return "unknown";
  if (isKnownGameVersion(local.version) && local.version !== target.version)
    return "changed";
  const completed = local.completed;
  if (
    completed &&
    !completed.invalidatedAt &&
    normalizeInstallPath(completed.installPath) ===
      normalizeInstallPath(context.installPath) &&
    completed.version === target.version &&
    completed.webRoot === target.webRoot
  )
    return "current";
  if (
    completed &&
    !completed.invalidatedAt &&
    normalizeInstallPath(completed.installPath) ===
      normalizeInstallPath(context.installPath) &&
    isKnownGameVersion(completed.version) &&
    completed.version !== target.version
  )
    return "changed";
  return "unknown";
}
