import { describe, expect, it } from "vitest";

import { VersionService } from "../../renderer/services/VersionService";
import { assessGameVersion, getServerTarget } from "../../shared/game-version";
import { LogParser } from "../utils/LogParser";

import type {
  GameVersionContext,
  LocalGameVersion,
  RemoteWebRootPayload,
} from "../../shared/types";

const context: GameVersionContext = {
  gameId: "POE2",
  serviceId: "Kakao Games",
  installPath: "D:\\Games\\POE2",
};
const target: RemoteWebRootPayload = {
  ...context,
  status: "ok",
  source: "master-socket",
  version: "0.5.5.4.2",
  webRoot: "https://server.example/patch/0.5.5.4.2/",
  fetchedAt: 100,
  sourceTimestamp: null,
  revision: 1,
};
const observed: LocalGameVersion = {
  version: "4.5.5.3",
  webRoot: "https://old.example/patch/4.5.5.3/",
  timestamp: 10,
  installPath: context.installPath,
};

describe("server target identity policy", () => {
  it("keeps path B's actionable UI target after path A pushes a later revision", () => {
    const pathB = { ...context, installPath: "E:\\New installation" };
    const current = { ...target, ...pathB, revision: 1 };
    const late = { ...target, version: "4.5.5.3", revision: 2 };
    const snapshots = VersionService.applySnapshot(
      VersionService.applySnapshot(null, current),
      late,
    );
    expect(VersionService.getRemoteVersionForGame(snapshots, pathB)).toBe(
      current,
    );
    expect(
      assessGameVersion(
        pathB,
        VersionService.getRemoteVersionForGame(snapshots, pathB),
        { ...observed, installPath: pathB.installPath },
      ),
    ).toBe("changed");
    const failed = VersionService.applySnapshot(snapshots, {
      ...current,
      revision: 3,
      status: "unavailable",
      source: null,
    });
    expect(VersionService.getRemoteVersionForGame(failed, pathB)).toBeNull();
  });

  it("replaces the complete opaque version segment literally for a manual operation", () => {
    expect(
      LogParser.replaceVersion("https://server/patch/release-a/", "release-b"),
    ).toBe("https://server/patch/release-b/");
    expect(
      LogParser.replaceVersion(
        "https://server/patch/0.5.5.4.2-hotfix/",
        "release-$1",
      ),
    ).toBe("https://server/patch/release-$1/");
  });
  it("offers the direct server target when a numerically larger version was observed locally", () => {
    expect(assessGameVersion(context, target, observed)).toBe("changed");
    expect(getServerTarget(target, context)?.webRoot).toBe(
      "https://server.example/patch/0.5.5.4.2/",
    );
  });

  it("requires completion proof to conclude no update, and invalidates that conclusion after a file mutation", () => {
    const local: LocalGameVersion = {
      ...observed,
      version: target.version,
      webRoot: target.webRoot,
    };
    expect(assessGameVersion(context, target, local)).toBe("unknown");
    local.completed = {
      version: target.version,
      webRoot: target.webRoot,
      installPath: context.installPath,
      timestamp: 90,
      runId: "completed-run",
      evidence: "game-startup",
    };
    expect(assessGameVersion(context, target, local)).toBe("current");
    local.completed!.invalidatedAt = 101;
    expect(assessGameVersion(context, target, local)).toBe("unknown");
  });

  it("does not reuse legacy or other installation evidence, nor a fallback as an actionable target", () => {
    expect(
      assessGameVersion(context, target, {
        ...observed,
        installPath: undefined,
      }),
    ).toBe("unknown");
    expect(
      assessGameVersion(context, target, {
        ...observed,
        installPath: "E:\\Other",
      }),
    ).toBe("unknown");
    expect(
      assessGameVersion(context, { ...target, serviceId: "GGG" }, observed),
    ).toBe("mismatch");
    expect(
      getServerTarget(
        {
          ...target,
          status: "unavailable",
          source: "gh-pages",
          sourceTimestamp: 1,
        },
        context,
      ),
    ).toBeNull();
    expect(
      assessGameVersion(
        context,
        { ...target, status: "unavailable" },
        observed,
      ),
    ).toBe("unavailable");
  });
});
