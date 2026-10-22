import {
  gameVersionContextKey,
  getServerTarget,
} from "../../shared/game-version";

import type {
  GameVersionContext,
  RemoteWebRootPayload,
} from "../../shared/types";

export type RemoteVersions = Record<string, RemoteWebRootPayload>;

export class VersionService {
  public static applySnapshot(
    versions: RemoteVersions | null,
    entry: RemoteWebRootPayload,
  ): RemoteVersions {
    const key = gameVersionContextKey(entry);
    if ((versions?.[key]?.revision ?? -1) > entry.revision) return versions!;
    return { ...versions, [key]: entry };
  }
  public static getRemoteVersionForGame(
    versions: RemoteVersions | null,
    context: GameVersionContext,
  ): RemoteWebRootPayload | null {
    return getServerTarget(versions?.[gameVersionContextKey(context)], context);
  }
}
