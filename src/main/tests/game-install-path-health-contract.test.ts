import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("game install path health integration contract", () => {
  it("uses the existing status event channel and wires startup, show, and focus reconciliation", () => {
    const main = readSource("src/main/main.ts");
    const reconciler = readSource(
      "src/main/game/GameInstallStatusReconciler.ts",
    );

    expect(main).toContain("reconcileAllGameInstallStatuses(appContext");
    expect(main).toContain(
      'refreshCurrentGameInstallStatusIfStale("window-show")',
    );
    expect(main).toContain(
      'refreshCurrentGameInstallStatusIfStale("window-focus")',
    );
    expect(reconciler).toContain("EventType.GAME_STATUS_CHANGE");
    expect(reconciler).not.toContain("setInterval(");
  });

  it("derives renderer warnings from active status without a diagnostics warning hook", () => {
    const app = readSource("src/renderer/App.tsx");
    const hooksDirectory = path.join(process.cwd(), "src/renderer/hooks");

    expect(app).toContain("createGamePathRegistryWarning(activeGameStatus");
    expect(app).not.toContain("useGamePathRegistryWarning");
    expect(
      fs.existsSync(path.join(hooksDirectory, "useGamePathRegistryWarning.ts")),
    ).toBe(false);
  });

  it("keeps the existing game-status preload listener leak-free", () => {
    const preload = readSource("src/main/preload.ts");
    const sharedTypes = readSource("src/shared/types.ts");

    expect(preload).toContain(
      'return () => ipcRenderer.off("game-status-update", handler)',
    );
    expect(sharedTypes).toContain(
      "callback: (status: GameStatusState) => void,\n  ) => () => void;",
    );
  });
});
