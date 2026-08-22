import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("game install path register IPC contract", () => {
  it("keeps shared, preload, and main on the dedicated typed register channel", () => {
    const sharedTypes = fs.readFileSync(
      path.join(process.cwd(), "src/shared/types.ts"),
      "utf8",
    );
    const preload = fs.readFileSync(
      path.join(process.cwd(), "src/main/preload.ts"),
      "utf8",
    );
    const main = fs.readFileSync(
      path.join(process.cwd(), "src/main/main.ts"),
      "utf8",
    );

    expect(sharedTypes).toContain("registerGameInstallPath: (");
    expect(sharedTypes).toContain("request: GameInstallPathRegisterRequest");
    expect(preload).toContain('"game-install-path:register"');
    expect(preload).toContain("request: GameInstallPathRegisterRequest");
    expect(main).toContain('ipcMain.handle(\n  "game-install-path:register"');
    expect(main).toContain(
      "() => registerGameInstallPath(serviceId, gameId, request)",
    );
  });
});
