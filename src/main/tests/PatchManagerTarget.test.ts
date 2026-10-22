import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GAME_SERVICE_PROFILES } from "../config/GameServiceProfiles";
import { PatchManager } from "../services/PatchManager";
import { getGameInstallPath } from "../utils/registry";
import { RemoteVersionResolver } from "../utils/RemoteVersionResolver";

import type { AppConfig } from "../../shared/types";
import type { AppContext } from "../events/types";

vi.mock("axios", () => ({ default: vi.fn() }));
vi.mock("../utils/registry", () => ({ getGameInstallPath: vi.fn() }));
vi.mock("../events/EventBus", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("../utils/config-utils", () => ({ setConfigWithEvent: vi.fn() }));
vi.mock("../utils/logger", () => ({
  Logger: class {
    log = vi.fn();
    error = vi.fn();
    warn = vi.fn();
  },
}));

describe("patch repair target selection", () => {
  let installPath: string;
  let manager: PatchManager;
  const service = "Kakao Games";
  const serverUrl = "https://changed-cdn.example/production/patch/0.5.5.4.2/";
  const oldUrl = "https://old.example/production/patch/4.5.5.3/";
  const profile = GAME_SERVICE_PROFILES[service];
  beforeEach(() => {
    vi.clearAllMocks();
    RemoteVersionResolver.__reset();
    installPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "poe2-version-target-test-"),
    );
    fs.mkdirSync(path.join(installPath, "logs"));
    fs.writeFileSync(
      path.join(installPath, "logs", profile.logFileName),
      `Web root: ${oldUrl}\n`,
    );
    for (const file of profile.essentialExecutables)
      fs.writeFileSync(path.join(installPath, file), "old");
    vi.mocked(getGameInstallPath).mockResolvedValue(installPath);
    vi.mocked(axios).mockImplementation(
      async () =>
        ({
          data: Readable.from([Buffer.from("server")]),
          headers: { "content-length": "6" },
        }) as never,
    );
    const config = {
      knownGameVersions: {},
      backupPatchFiles: false,
    } as AppConfig;
    manager = new PatchManager({
      getConfig: (key?: keyof AppConfig) => (key ? config[key] : config),
    } as AppContext);
  });
  afterEach(() => {
    RemoteVersionResolver.__reset();
    const resolved = path.resolve(installPath);
    if (
      path.dirname(resolved) === path.resolve(os.tmpdir()) &&
      path.basename(resolved).startsWith("poe2-version-target-test-")
    )
      fs.rmSync(resolved, { recursive: true, force: true });
  });

  it("downloads from the direct 0.x server target despite an older 4.x log or caller observation", async () => {
    RemoteVersionResolver.__setAdapters({
      master: vi.fn().mockResolvedValue({ webRoot: serverUrl }),
    });
    expect(
      await manager.startSelfDiagnosis(installPath, service, "POE2", {
        webRoot: oldUrl,
        backupWebRoot: oldUrl,
      }),
    ).toBe(true);
    expect(
      vi
        .mocked(axios)
        .mock.calls.map(
          ([options]) => (options as unknown as { url: string }).url,
        ),
    ).toEqual(profile.essentialExecutables.map((file) => serverUrl + file));
    expect(
      fs.readFileSync(
        path.join(installPath, profile.essentialExecutables[0]),
        "utf8",
      ),
    ).toBe("server");
  });

  it("does not write game files using a cached fallback after the server lookup fails", async () => {
    RemoteVersionResolver.__setAdapters({
      master: vi.fn().mockRejectedValue(new Error("offline")),
      ghPages: vi.fn().mockResolvedValue({
        webRoot: oldUrl,
        version: "4.5.5.3",
        timestamp: 1,
      }),
    });
    expect(await manager.startSelfDiagnosis(installPath, service, "POE2")).toBe(
      false,
    );
    expect(axios).not.toHaveBeenCalled();
    expect(
      fs.readFileSync(
        path.join(installPath, profile.essentialExecutables[0]),
        "utf8",
      ),
    ).toBe("old");
  });

  it("stops before file writes when the install path changes during target lookup", async () => {
    RemoteVersionResolver.__setAdapters({
      master: vi.fn().mockImplementation(async () => {
        vi.mocked(getGameInstallPath).mockResolvedValue(
          "E:\\Other installation",
        );
        return { webRoot: serverUrl };
      }),
    });
    expect(await manager.startSelfDiagnosis(installPath, service, "POE2")).toBe(
      false,
    );
    expect(axios).not.toHaveBeenCalled();
    expect(
      fs.readFileSync(
        path.join(installPath, profile.essentialExecutables[0]),
        "utf8",
      ),
    ).toBe("old");
  });
});
