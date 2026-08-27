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

  it("uses only the opaque selection picker and removes the legacy immediate-save bridge", () => {
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

    expect(sharedTypes).toContain("pickGameInstallPathTargets: (");
    expect(sharedTypes).toContain("applyGameInstallPathTargets: (");
    expect(sharedTypes).toContain("selectionId: string");
    expect(sharedTypes).toContain(
      "targetIds: readonly GameInstallPathTargetId[]",
    );
    expect(preload).toContain('"game-install-path:pick-targets"');
    expect(preload).toContain('"game-install-path:apply-targets"');
    expect(main).toContain(
      'ipcMain.handle(\n  "game-install-path:pick-targets"',
    );
    expect(main).toContain(
      'ipcMain.handle(\n  "game-install-path:apply-targets"',
    );

    expect(sharedTypes).not.toContain("pickGameInstallPath: (");
    expect(preload).not.toContain('"game-install-path:pick"');
    expect(main).not.toContain('ipcMain.handle(\n  "game-install-path:pick"');
  });

  it("keeps registry delete authority to targetId and expectedPath only", () => {
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
    const app = fs.readFileSync(
      path.join(process.cwd(), "src/renderer/App.tsx"),
      "utf8",
    );
    const requestMatch = sharedTypes.match(
      /export interface GameInstallPathRegistryTargetDeleteRequest \{([\s\S]*?)\n\}/,
    );

    expect(requestMatch?.[1]).toContain(
      "readonly targetId: GameInstallPathRegistryTargetId",
    );
    expect(requestMatch?.[1]).toContain("readonly expectedPath: string");
    expect(requestMatch?.[1]).not.toMatch(/registryPath|registryValueName/);
    expect(sharedTypes).toContain("deleteGameInstallPathRegistryTarget: (");
    expect(preload).toContain('"game-install-path:delete-registry-target"');
    expect(preload).not.toContain(
      "registryTarget?: GameInstallPathRegistryTarget",
    );
    expect(main).toContain("gameInstallPathRegistryDeleteHandler");
    expect(app).toContain("deleteGameInstallPathRegistryTarget(");
    expect(app).not.toContain("pickGameInstallPath(");
  });

  it("keeps conflict mutation authority to an allowlisted targetId without raw registry identity", () => {
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
    const app = fs.readFileSync(
      path.join(process.cwd(), "src/renderer/App.tsx"),
      "utf8",
    );
    const requestMatch = sharedTypes.match(
      /export interface GameInstallPathConflictTarget \{([\s\S]*?)\n\}/,
    );

    expect(requestMatch?.[1]).toContain(
      "readonly targetId: GameInstallPathRegistryTargetId",
    );
    expect(requestMatch?.[1]).toContain("readonly expectedPath: string");
    expect(requestMatch?.[1]).toContain("readonly expectedConfigPath: string");
    expect(requestMatch?.[1]).not.toMatch(/registryPath|registryValueName/);
    expect(preload).toContain("registryTarget: GameInstallPathConflictTarget");
    expect(preload).not.toMatch(
      /resolveGameInstallPathConflict:[\s\S]*?registry(Path|ValueName)/,
    );
    expect(main).toContain("resolveGameInstallPathConflict(");
    expect(app).not.toContain("getRegistryMutationTarget");
  });

  it("narrows the renderer clear bridge to config only", () => {
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

    expect(preload).toContain('"game-install-path:clear-config"');
    expect(preload).not.toContain('"game-install-path:clear"');
    expect(main).toContain(
      'ipcMain.handle(\n  "game-install-path:clear-config"',
    );
    expect(sharedTypes).not.toContain(
      "registryTarget?: GameInstallPathRegistryTarget",
    );
  });

  it("keeps apply authority to selectionId and targetIds only", () => {
    const sharedTypes = fs.readFileSync(
      path.join(process.cwd(), "src/shared/types.ts"),
      "utf8",
    );
    const preload = fs.readFileSync(
      path.join(process.cwd(), "src/main/preload.ts"),
      "utf8",
    );
    const handlers = fs.readFileSync(
      path.join(process.cwd(), "src/main/game/GameInstallPathIpcHandlers.ts"),
      "utf8",
    );
    const requestMatch = sharedTypes.match(
      /export interface GameInstallPathSelectionApplyRequest \{([\s\S]*?)\n\}/,
    );
    expect(requestMatch?.[1]).toBeDefined();
    expect(requestMatch?.[1]).toContain("readonly selectionId: string");
    expect(requestMatch?.[1]).toContain(
      "readonly targetIds: readonly GameInstallPathTargetId[]",
    );
    expect(requestMatch?.[1]).not.toMatch(
      /readonly\s+(serviceId|gameId|path|registryPath|registryValueName)\s*:/,
    );

    expect(preload).toMatch(
      /"game-install-path:apply-targets",\s*\{\s*selectionId,\s*targetIds,?\s*\}/,
    );
    expect(handlers).toContain("request: GameInstallPathSelectionApplyRequest");
    expect(handlers).toContain("const ownerWebContentsId = event.sender.id");
    expect(handlers).toContain("request?.selectionId");
  });

  it("passes an optional defaultPath and cleans each owner up once", () => {
    const handlers = fs.readFileSync(
      path.join(process.cwd(), "src/main/game/GameInstallPathIpcHandlers.ts"),
      "utf8",
    );

    expect(handlers).toContain(
      "const defaultPath = await dependencies.selectionService.getDefaultPath",
    );
    expect(handlers).toContain("...(defaultPath ? { defaultPath } : {})");
    expect(handlers).toContain('sender.once("destroyed"');
    expect(handlers).toContain(
      "dependencies.selectionService.disposeOwner(sender.id)",
    );
    expect(handlers).toContain("cleanupOwners.has(sender.id)");
  });

  it("resolves the owner-bound context and wraps a successful batch exactly once", () => {
    const handlers = fs.readFileSync(
      path.join(process.cwd(), "src/main/game/GameInstallPathIpcHandlers.ts"),
      "utf8",
    );
    const handlerStart = handlers.indexOf("const applyGameInstallPathTargets");
    const handlerEnd = handlers.indexOf(
      "return { pickGameInstallPathTargets, applyGameInstallPathTargets }",
      handlerStart,
    );
    const handler = handlers.slice(handlerStart, handlerEnd);

    expect(handler).toContain("event.sender.id");
    expect(handler).toContain(
      "dependencies.selectionService.resolveSelectionContext",
    );
    expect(handler).toContain("resolved.context");
    expect(handler.match(/dependencies\.runManualAction/g)).toHaveLength(1);
    expect(
      handler.match(/dependencies\.selectionService\.applySelection/g),
    ).toHaveLength(1);
  });

  it("connects the production channels through the behavior-tested handler factory", () => {
    const main = fs.readFileSync(
      path.join(process.cwd(), "src/main/main.ts"),
      "utf8",
    );

    expect(main).toContain("createGameInstallPathIpcHandlers");
    expect(main).toContain(
      "gameInstallPathIpcHandlers.pickGameInstallPathTargets",
    );
    expect(main).toContain(
      "gameInstallPathIpcHandlers.applyGameInstallPathTargets",
    );
  });

  it("wires modal generations and synchronous operation tokens through every async mutation flow", () => {
    const app = fs.readFileSync(
      path.join(process.cwd(), "src/renderer/App.tsx"),
      "utf8",
    );
    const stateHelper = fs.readFileSync(
      path.join(process.cwd(), "src/renderer/utils/game-path-modal-state.ts"),
      "utf8",
    );

    expect(app).toContain("gamePathModalGenerationRef");
    expect(app).toContain("gamePathModalOperationTrackerRef");
    for (const operation of [
      "diagnostics",
      "picker",
      "apply",
      "delete",
      "config-clear",
      "conflict",
      "register",
    ]) {
      expect(app).toContain(`"${operation}"`);
    }
    expect(stateHelper).toContain("createGamePathModalOperationTracker");
    expect(stateHelper).toContain("selectionId");
    expect(stateHelper).toContain("generation");
  });
});
