import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import * as zlib from "node:zlib";

import { app, BrowserWindow, ipcMain } from "electron";

import {
  decodePobBuildCodeXml,
  encodePobBuildCodeXml,
} from "@poe2-launcher/pob-repoe/buildCode";
import { parseItemCopyText } from "@poe2-launcher/pob-repoe/itemCopyParser";
import { loadItemCopyParserData } from "@poe2-launcher/pob-repoe/itemCopyParserData";
import { loadRePoeTranslations } from "@poe2-launcher/pob-repoe/translations";
import { getPobVaultGenerations } from "@poe2-launcher/pob-vault/generations";
import { refreshPobVault } from "@poe2-launcher/pob-vault/refresh";
import { loadDefaultPobSmokeFixture } from "@poe2-launcher/pob-vault/smokeFixture";
import { getPobVaultStatus } from "@poe2-launcher/pob-vault/status";
import { PobVaultContractValidator } from "@poe2-launcher/pob-vault/validator";
import type { PobVaultSmokeSession } from "@poe2-launcher/pob-vault/validator";
import { PoBVault, pobVault } from "@poe2-launcher/pob-vault/vault";
import {
  DEFAULT_POB_SETTINGS,
  normalizePobVaultGenerationLimit,
} from "@poe2-launcher/shared/pobSettings";
import {
  PobBuildSummary,
  PobCalcsAction,
  PobCalcsBreakdown,
  PobCalcsBreakdownResult,
  PobCalcsSnapshot,
  PobCalcsSnapshotResult,
  PobConfigAction,
  PobConfigSnapshot,
  PobConfigSnapshotResult,
  PobExportBuildCodeResult,
  PobGame,
  PobItemCopyLocale,
  PobItemsAction,
  PobItemsDbKey,
  PobItemsDbList,
  PobItemsDbListResult,
  PobItemsParseAndAddRequest,
  PobItemsParseAndAddResult,
  PobItemsParseCopyTextRequest,
  PobItemsParseCopyTextResult,
  PobItemsSnapshot,
  PobItemsSnapshotResult,
  PobLoadBuildResult,
  PobRepoeLocale,
  PobRepoeTranslationsResult,
  PobSaveBuildResult,
  PobSessionResult,
  PobSkillsAction,
  PobSkillsSnapshot,
  PobSkillsSnapshotResult,
  PobTreeResult,
  PobTreeSnapshot,
  PobVaultGenerationsResult,
  PobVaultRefreshRequest,
  PobVaultRefreshResult,
  PobVaultStatusResult,
} from "@poe2-launcher/shared/types";

import { resolvePobInstallLocation, type PobInstallLocator } from "./locator";
import { logger } from "./logger";

const LUA_PATH =
  ".\\?.lua;.\\?\\init.lua;.\\lua\\?.lua;.\\lua\\?\\init.lua;.\\runtime\\lua\\?.lua;.\\runtime\\lua\\?\\init.lua;..\\runtime\\lua\\?.lua;..\\runtime\\lua\\?\\init.lua";
const LUA_CPATH = ".\\?.dll;.\\runtime\\?.dll;..\\runtime\\?.dll";
const READY_TIMEOUT_MS = 10_000;
const RPC_TIMEOUT_MS = 30_000;
const MAX_RESPAWN_ATTEMPTS = 3;

type RpcId = number | string;

interface RpcErrorPayload {
  code: number;
  message: string;
}

interface RpcMessage<T = unknown> {
  jsonrpc: "2.0";
  id?: RpcId;
  method?: string;
  params?: unknown;
  result?: T;
  error?: RpcErrorPayload;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

interface ReadyWaiter {
  resolve: () => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

export interface PobPingResult {
  pong: boolean;
  pobVersion: string;
}

export type PobLoadBuildXmlResult = PobBuildSummary;

export interface PobExportBuildXmlResult {
  xml: string;
}

export interface PobExportBuildCodeSessionResult {
  code: string;
}

export interface PoBSessionOptions {
  game?: PobGame;
  installLocation?: string;
  installLocator?: PobInstallLocator;
  resourceRoot?: string;
  vault?: PoBVault;
}

const resolveDefaultResourceRoot = (): string => {
  if (app.isPackaged) return path.join(process.resourcesPath, "lua");
  return path.join(
    app.getAppPath(),
    "packages",
    "pob-headless-glue",
    "resources",
    "lua",
  );
};

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPobRepoeLocale = (value: unknown): value is PobRepoeLocale =>
  value === "en" || value === "ko";

const isPobItemCopyLocale = (value: unknown): value is PobItemCopyLocale =>
  value === "en" || value === "ko";

export const inflateRawBase64 = (data: string): string =>
  zlib.inflateRawSync(Buffer.from(data, "base64")).toString("base64");

export const deflateRawBase64 = (data: string): string =>
  zlib.deflateRawSync(Buffer.from(data, "base64")).toString("base64");

const readBase64Param = (params: unknown): string => {
  if (!isRecord(params) || typeof params.data !== "string") {
    throw new Error("internal zlib RPC requires params.data");
  }
  return params.data;
};

export const handlePobInternalRpc = (
  method: string,
  params: unknown,
): { data: string } => {
  const data = readBase64Param(params);
  if (method === "_internal.inflate") return { data: inflateRawBase64(data) };
  if (method === "_internal.deflate") return { data: deflateRawBase64(data) };
  throw new Error(`Unknown internal PoB RPC: ${method}`);
};

export class PoBSession {
  private readonly game: PobGame;
  private readonly installLocation?: string;
  private readonly installLocator?: PobInstallLocator;
  private readonly resourceRoot: string;
  private readonly vault: PoBVault;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private spawnPromise: Promise<void> | null = null;
  private stdoutBuffer = "";
  private nextId = 1;
  private readyWaiter: ReadyWaiter | null = null;
  private readonly pending = new Map<number, PendingCall>();
  private rpcQueue: Promise<void> = Promise.resolve();

  constructor(options: PoBSessionOptions = {}) {
    this.game = options.game ?? "POE2";
    this.installLocation = options.installLocation;
    this.installLocator = options.installLocator;
    this.resourceRoot = options.resourceRoot ?? resolveDefaultResourceRoot();
    this.vault = options.vault ?? pobVault;
  }

  isAlive(): boolean {
    return !!this.proc && this.proc.exitCode === null && !this.proc.killed;
  }

  async spawn(): Promise<void> {
    await this.ensureSpawned();
  }

  async ensureSpawned(): Promise<void> {
    if (this.isAlive()) return;
    if (this.spawnPromise) return this.spawnPromise;

    this.spawnPromise = this.spawnOnce().finally(() => {
      this.spawnPromise = null;
    });
    return this.spawnPromise;
  }

  async getVaultPath(): Promise<string> {
    const active = await this.resolveActiveVault();
    return active.vaultPath;
  }

  async call<T>(method: string, params: object = {}): Promise<T> {
    const run = () => this.callWithRetry<T>(method, params, 0);
    const result = this.rpcQueue.then(run, run);
    this.rpcQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  ping(): Promise<PobPingResult> {
    return this.call<PobPingResult>("pob.ping");
  }

  loadBuildXml(
    xml: string,
    name = "RPC build",
  ): Promise<PobLoadBuildXmlResult> {
    return this.call<PobLoadBuildXmlResult>("pob.loadBuildXml", { xml, name });
  }

  loadBuildCode(
    code: string,
    name = "Imported build code",
  ): Promise<PobLoadBuildXmlResult> {
    return this.loadBuildXml(decodePobBuildCodeXml(code), name);
  }

  newBuild(name = "New build"): Promise<PobLoadBuildXmlResult> {
    return this.call<PobLoadBuildXmlResult>("pob.newBuild", { name });
  }

  exportBuildXml(): Promise<PobExportBuildXmlResult> {
    return this.call<PobExportBuildXmlResult>("pob.exportBuildXml");
  }

  async exportBuildCode(): Promise<PobExportBuildCodeSessionResult> {
    const result = await this.exportBuildXml();
    return { code: encodePobBuildCodeXml(result.xml) };
  }

  saveBuildXml(): Promise<PobExportBuildXmlResult> {
    return this.call<PobExportBuildXmlResult>("pob.saveBuildXml");
  }

  treeSnapshot(): Promise<PobTreeSnapshot> {
    return this.call<PobTreeSnapshot>("pob.tree.snapshot");
  }

  treeAllocate(nodeId: number): Promise<PobTreeSnapshot> {
    return this.call<PobTreeSnapshot>("pob.tree.allocate", { nodeId });
  }

  treeDeallocate(nodeId: number): Promise<PobTreeSnapshot> {
    return this.call<PobTreeSnapshot>("pob.tree.deallocate", { nodeId });
  }

  itemsSnapshot(): Promise<PobItemsSnapshot> {
    return this.call<PobItemsSnapshot>("pob.items.snapshot");
  }

  itemsDbList(db: PobItemsDbKey): Promise<PobItemsDbList> {
    return this.call<PobItemsDbList>("pob.items.dbList", { db });
  }

  itemsAction(action: PobItemsAction): Promise<PobItemsSnapshot> {
    return this.call<PobItemsSnapshot>("pob.items.action", action);
  }

  itemsParseAndAdd(
    englishText: string,
    equip = false,
  ): Promise<PobItemsSnapshot> {
    return this.itemsAction({ type: "createCustom", raw: englishText, equip });
  }

  skillsSnapshot(): Promise<PobSkillsSnapshot> {
    return this.call<PobSkillsSnapshot>("pob.skills.snapshot");
  }

  skillsAction(action: PobSkillsAction): Promise<PobSkillsSnapshot> {
    return this.call<PobSkillsSnapshot>("pob.skills.action", action);
  }

  calcsSnapshot(): Promise<PobCalcsSnapshot> {
    return this.call<PobCalcsSnapshot>("pob.calcs.snapshot");
  }

  calcsBreakdown(key: string): Promise<PobCalcsBreakdown> {
    return this.call<PobCalcsBreakdown>("pob.calcs.breakdown", { key });
  }

  calcsAction(action: PobCalcsAction): Promise<PobCalcsSnapshot> {
    return this.call<PobCalcsSnapshot>("pob.calcs.action", action);
  }

  configSnapshot(): Promise<PobConfigSnapshot> {
    return this.call<PobConfigSnapshot>("pob.config.snapshot");
  }

  configAction(action: PobConfigAction): Promise<PobConfigSnapshot> {
    return this.call<PobConfigSnapshot>("pob.config.action", action);
  }

  async dispose(): Promise<void> {
    const proc = this.proc;
    this.proc = null;
    this.spawnPromise = null;
    this.rejectReady(new Error("PoBSession disposed"));
    this.rejectPending(new Error("PoBSession disposed"));

    if (!proc || proc.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2_000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      proc.kill();
    });
  }

  private async spawnOnce(): Promise<void> {
    const active = await this.resolveActiveVault();
    const runtimePath = path.join(active.vaultPath, "runtime");
    const parentRuntimePath = path.join(active.vaultPath, "..", "runtime");
    const luaExe = path.join(this.resourceRoot, "luajit.exe");
    const bridgePath = path.join(this.resourceRoot, "ipc_bridge.lua");
    const wrapperPath = path.join(this.resourceRoot, "HeadlessWrapper.lua");

    this.stdoutBuffer = "";
    logger.log(`[PoBSession] spawning luajit (cwd=${active.vaultPath})`);
    this.proc = spawn(luaExe, [bridgePath, wrapperPath], {
      cwd: active.vaultPath,
      windowsHide: true,
      env: {
        ...process.env,
        LUA_PATH,
        LUA_CPATH,
        PATH: `${this.resourceRoot};${runtimePath};${parentRuntimePath};${active.vaultPath};${process.env.PATH ?? ""}`,
      },
    });

    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.handleStdout(chunk.toString("utf8"));
    });
    this.proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) logger.warn(`[PoBSession] ${text}`);
    });
    this.proc.on("error", (err) => {
      this.rejectReady(err);
      this.rejectPending(err);
    });
    this.proc.on("exit", (code, signal) => {
      const err = new Error(`PoBSession exited code=${code} signal=${signal}`);
      this.proc = null;
      this.rejectReady(err);
      this.rejectPending(err);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.readyWaiter = null;
          reject(new Error("PoBSession READY timeout"));
        }, READY_TIMEOUT_MS);
        this.readyWaiter = {
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
          timer,
        };
      });
    } catch (err) {
      await this.dispose();
      throw err;
    }
  }

  private async callWithRetry<T>(
    method: string,
    params: object,
    attempt: number,
  ): Promise<T> {
    try {
      return await this.sendCall<T>(method, params);
    } catch (err) {
      if (!this.isAlive() && attempt < MAX_RESPAWN_ATTEMPTS) {
        logger.warn(
          `[PoBSession] RPC ${method} failed after child exit; respawning (${attempt + 1}/${MAX_RESPAWN_ATTEMPTS})`,
        );
        await this.ensureSpawned();
        return this.callWithRetry<T>(method, params, attempt + 1);
      }
      throw err;
    }
  }

  private async sendCall<T>(method: string, params: object): Promise<T> {
    await this.ensureSpawned();
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error("PoBSession stdin is not writable");
    }

    const id = this.nextId++;
    const result = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`PoBSession RPC timeout: ${method}`));
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
    });
    this.sendRpcMessage({ jsonrpc: "2.0", id, method, params });
    return result;
  }

  private async resolveActiveVault() {
    const active = await this.vault.getActive();
    if (active) return active;

    const installLocation =
      this.installLocation ?? (await this.detectInstall());
    return this.vault.ensureSnapshot(installLocation);
  }

  private async detectInstall(): Promise<string> {
    const detected = await resolvePobInstallLocation(
      this.game,
      this.installLocator,
    );
    if (!detected.installLocation) {
      throw new Error(`PoB install location not found for ${this.game}`);
    }
    return detected.installLocation;
  }

  private handleStdout(text: string): void {
    this.stdoutBuffer += text;
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.handleLine(trimmed);
    }
  }

  private handleLine(line: string): void {
    if (!line.startsWith("{")) {
      logger.log(`[PoBSession] ${line}`);
      return;
    }

    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      logger.warn(`[PoBSession] non-json stdout: ${line}`);
      return;
    }

    if (message.method === "_ready") {
      logger.log("[PoBSession] READY");
      this.resolveReady();
      return;
    }

    if (message.method && message.id !== undefined) {
      this.handleChildRequest(message);
      return;
    }

    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(
        new Error(
          `PoBSession RPC error ${message.error.code}: ${message.error.message}`,
        ),
      );
      return;
    }
    pending.resolve(message.result);
  }

  private handleChildRequest(message: RpcMessage): void {
    if (message.id === undefined || !message.method) return;
    try {
      const result = handlePobInternalRpc(message.method, message.params);
      this.sendRpcMessage({ jsonrpc: "2.0", id: message.id, result });
    } catch (err) {
      this.sendRpcMessage({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32603, message: errorMessage(err) },
      });
    }
  }

  private sendRpcMessage(message: RpcMessage): void {
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error("PoBSession stdin is not writable");
    }
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private resolveReady(): void {
    if (!this.readyWaiter) return;
    clearTimeout(this.readyWaiter.timer);
    this.readyWaiter.resolve();
    this.readyWaiter = null;
  }

  private rejectReady(err: Error): void {
    if (!this.readyWaiter) return;
    clearTimeout(this.readyWaiter.timer);
    this.readyWaiter.reject(err);
    this.readyWaiter = null;
  }

  private rejectPending(err: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.pending.delete(id);
    }
  }
}

class StaticPobSmokeVault extends PoBVault {
  constructor(private readonly vaultPath: string) {
    super({ root: path.dirname(vaultPath) });
  }

  override async getActive() {
    return {
      version: path.basename(this.vaultPath),
      vaultPath: this.vaultPath,
    };
  }

  override async ensureSnapshot() {
    return {
      version: path.basename(this.vaultPath),
      vaultPath: this.vaultPath,
    };
  }
}

const createPobVaultSmokeSession = (vaultPath: string): PobVaultSmokeSession =>
  new PoBSession({ vault: new StaticPobSmokeVault(vaultPath) });

const createPobSessionBackedVaultValidator =
  async (): Promise<PobVaultContractValidator> =>
    new PobVaultContractValidator({
      fixture: await loadDefaultPobSmokeFixture(),
      sessionFactory: createPobVaultSmokeSession,
    });

const sessions = new Map<PobGame, PoBSession>();
let sessionInstallLocator: PobInstallLocator | undefined;

const getGameFromSender = (event: Electron.IpcMainInvokeEvent): PobGame => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const url = win?.webContents.getURL() ?? "";
  return url.includes("game=POE1") ? "POE1" : "POE2";
};

export const getPobSession = (game: PobGame): PoBSession => {
  const existing = sessions.get(game);
  if (existing) return existing;
  const session = new PoBSession({
    game,
    installLocator: sessionInstallLocator,
  });
  sessions.set(game, session);
  return session;
};

export const disposePobSession = async (game?: PobGame): Promise<void> => {
  if (game) {
    const session = sessions.get(game);
    sessions.delete(game);
    await session?.dispose();
    return;
  }

  const activeSessions = [...sessions.values()];
  sessions.clear();
  await Promise.all(activeSessions.map((session) => session.dispose()));
};

const toSessionError = (err: unknown): { status: "error"; reason: string } => ({
  status: "error",
  reason: errorMessage(err),
});

const readItemCopyParseRequest = (
  request: unknown,
): PobItemsParseCopyTextRequest => {
  if (!isRecord(request) || typeof request.rawText !== "string") {
    throw new Error("item copy parser requires rawText");
  }
  if (
    request.localeHint !== undefined &&
    !isPobItemCopyLocale(request.localeHint)
  ) {
    throw new Error("item copy parser requires localeHint = en|ko");
  }
  return {
    rawText: request.rawText,
    localeHint: request.localeHint,
  };
};

const readItemCopyParseAndAddRequest = (
  request: unknown,
): PobItemsParseAndAddRequest => {
  const parseRequest = readItemCopyParseRequest(request);
  return {
    ...parseRequest,
    equip: isRecord(request) && request.equip === true,
  };
};

const readPobVaultRefreshRequest = (
  request: unknown,
): Required<PobVaultRefreshRequest> => ({
  autoUpdate:
    isRecord(request) && typeof request.autoUpdate === "boolean"
      ? request.autoUpdate
      : DEFAULT_POB_SETTINGS.autoVaultUpdate,
  generationLimit: normalizePobVaultGenerationLimit(
    isRecord(request) ? request.generationLimit : undefined,
  ),
  force: isRecord(request) && request.force === true,
});

export interface RegisterPobSessionHandlersOptions {
  installLocator?: PobInstallLocator;
}

export function registerPobSessionHandlers(
  options: RegisterPobSessionHandlersOptions = {},
): void {
  sessionInstallLocator = options.installLocator;

  ipcMain.handle(
    "pob:session-ensure",
    async (event): Promise<PobSessionResult> => {
      try {
        await getPobSession(getGameFromSender(event)).ensureSpawned();
        return { status: "ok" };
      } catch (err) {
        logger.warn("[PoBSession] ensure failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:vault-status",
    async (event): Promise<PobVaultStatusResult> => {
      try {
        const game = getGameFromSender(event);
        const detected = await resolvePobInstallLocation(
          game,
          sessionInstallLocator,
        );
        const snapshot = await getPobVaultStatus({
          vault: pobVault,
          installLocation: detected.installLocation,
        });
        return { status: "ok", snapshot };
      } catch (err) {
        logger.warn("[PoBSession] vault-status failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:vault-generations",
    async (): Promise<PobVaultGenerationsResult> => {
      try {
        const generations = await getPobVaultGenerations(pobVault);
        return { status: "ok", generations };
      } catch (err) {
        logger.warn("[PoBSession] vault-generations failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:vault-refresh",
    async (event, request: unknown): Promise<PobVaultRefreshResult> => {
      try {
        const game = getGameFromSender(event);
        const detected = await resolvePobInstallLocation(
          game,
          sessionInstallLocator,
        );
        const refreshRequest = readPobVaultRefreshRequest(request);
        const result = await refreshPobVault({
          installLocation: detected.installLocation,
          settings: {
            autoVaultUpdate: refreshRequest.autoUpdate,
            vaultGenerationLimit: refreshRequest.generationLimit,
          },
          force: refreshRequest.force,
          vault: pobVault,
          validator: await createPobSessionBackedVaultValidator(),
        });
        if (result.status === "promoted") {
          await disposePobSession(game);
        }
        return { status: "ok", result };
      } catch (err) {
        logger.warn("[PoBSession] vault-refresh failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:load-build",
    async (event, request: unknown): Promise<PobLoadBuildResult> => {
      try {
        if (!isRecord(request) || typeof request.xml !== "string") {
          throw new Error("pob:load-build requires xml");
        }
        const summary = await getPobSession(
          getGameFromSender(event),
        ).loadBuildXml(
          request.xml,
          typeof request.name === "string" ? request.name : "RPC build",
        );
        return { status: "ok", summary };
      } catch (err) {
        logger.warn("[PoBSession] load-build failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:load-build-code",
    async (event, request: unknown): Promise<PobLoadBuildResult> => {
      try {
        if (!isRecord(request) || typeof request.code !== "string") {
          throw new Error("pob:load-build-code requires code");
        }
        const summary = await getPobSession(
          getGameFromSender(event),
        ).loadBuildCode(
          request.code,
          typeof request.name === "string"
            ? request.name
            : "Imported build code",
        );
        return { status: "ok", summary };
      } catch (err) {
        logger.warn("[PoBSession] load-build-code failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:new-build",
    async (event, name: unknown): Promise<PobLoadBuildResult> => {
      try {
        const summary = await getPobSession(getGameFromSender(event)).newBuild(
          typeof name === "string" ? name : "New build",
        );
        return { status: "ok", summary };
      } catch (err) {
        logger.warn("[PoBSession] new-build failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:save-build-xml",
    async (event): Promise<PobSaveBuildResult> => {
      try {
        const result = await getPobSession(
          getGameFromSender(event),
        ).saveBuildXml();
        return { status: "ok", xml: result.xml };
      } catch (err) {
        logger.warn("[PoBSession] save-build-xml failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:export-build-code",
    async (event): Promise<PobExportBuildCodeResult> => {
      try {
        const result = await getPobSession(
          getGameFromSender(event),
        ).exportBuildCode();
        return { status: "ok", code: result.code };
      } catch (err) {
        logger.warn("[PoBSession] export-build-code failed:", err);
        return toSessionError(err);
      }
    },
  );

  const callTree = async (
    event: Electron.IpcMainInvokeEvent,
    op: "snapshot" | "allocate" | "deallocate",
    nodeId?: unknown,
  ): Promise<PobTreeResult> => {
    try {
      const session = getPobSession(getGameFromSender(event));
      let snapshot: PobTreeSnapshot;
      if (op === "snapshot") {
        snapshot = await session.treeSnapshot();
      } else {
        if (typeof nodeId !== "number") {
          throw new Error(`pob:tree-${op} requires numeric nodeId`);
        }
        snapshot =
          op === "allocate"
            ? await session.treeAllocate(nodeId)
            : await session.treeDeallocate(nodeId);
      }
      return { status: "ok", snapshot };
    } catch (err) {
      logger.warn(`[PoBSession] tree-${op} failed:`, err);
      return toSessionError(err);
    }
  };

  ipcMain.handle("pob:tree-snapshot", async (event) =>
    callTree(event, "snapshot"),
  );
  ipcMain.handle("pob:tree-allocate", async (event, nodeId: unknown) =>
    callTree(event, "allocate", nodeId),
  );
  ipcMain.handle("pob:tree-deallocate", async (event, nodeId: unknown) =>
    callTree(event, "deallocate", nodeId),
  );

  ipcMain.handle("pob:tree-metadata", async (event) => {
    try {
      const session = getPobSession(getGameFromSender(event));
      const metadata = await session.call<unknown>("pob.tree.metadata");
      const vaultPath = await session.getVaultPath();
      return { status: "ok", metadata, vaultPath };
    } catch (err) {
      logger.warn(`[PoBSession] tree-metadata failed:`, err);
      return toSessionError(err);
    }
  });

  ipcMain.handle(
    "pob:repoe-translations",
    async (_event, locale: unknown): Promise<PobRepoeTranslationsResult> => {
      try {
        if (!isPobRepoeLocale(locale)) {
          throw new Error("pob:repoe-translations requires locale = en|ko");
        }
        return { status: "ok", snapshot: await loadRePoeTranslations(locale) };
      } catch (err) {
        logger.warn("[PoBSession] repoe-translations failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:items-snapshot",
    async (event): Promise<PobItemsSnapshotResult> => {
      try {
        const snapshot = await getPobSession(
          getGameFromSender(event),
        ).itemsSnapshot();
        return { status: "ok", snapshot };
      } catch (err) {
        logger.warn("[PoBSession] items-snapshot failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:items-db-list",
    async (event, db: unknown): Promise<PobItemsDbListResult> => {
      try {
        if (db !== "uniqueDB" && db !== "rareDB") {
          throw new Error("pob:items-db-list requires db = uniqueDB|rareDB");
        }
        const list = await getPobSession(getGameFromSender(event)).itemsDbList(
          db,
        );
        return { status: "ok", list };
      } catch (err) {
        logger.warn("[PoBSession] items-db-list failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:items-action",
    async (event, action: unknown): Promise<PobItemsSnapshotResult> => {
      try {
        if (!isRecord(action) || typeof action.type !== "string") {
          throw new Error("pob:items-action requires action.type");
        }
        const snapshot = await getPobSession(
          getGameFromSender(event),
        ).itemsAction(action as PobItemsAction);
        return { status: "ok", snapshot };
      } catch (err) {
        logger.warn("[PoBSession] items-action failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:items-parse-copy-text",
    async (_event, request: unknown): Promise<PobItemsParseCopyTextResult> => {
      try {
        const parseRequest = readItemCopyParseRequest(request);
        const data = await loadItemCopyParserData();
        return parseItemCopyText({ ...parseRequest, data });
      } catch (err) {
        logger.warn("[PoBSession] items-parse-copy-text failed:", err);
        return {
          status: "error",
          locale: "en",
          reason: errorMessage(err),
          originalText: isRecord(request) ? String(request.rawText ?? "") : "",
        };
      }
    },
  );

  ipcMain.handle(
    "pob:items-parse-and-add",
    async (event, request: unknown): Promise<PobItemsParseAndAddResult> => {
      try {
        const parseRequest = readItemCopyParseAndAddRequest(request);
        const data = await loadItemCopyParserData();
        const parsed = parseItemCopyText({ ...parseRequest, data });
        if (parsed.status === "error") {
          return parsed;
        }
        const snapshot = await getPobSession(
          getGameFromSender(event),
        ).itemsParseAndAdd(parsed.englishText, parseRequest.equip);
        return { ...parsed, status: "ok", snapshot };
      } catch (err) {
        logger.warn("[PoBSession] items-parse-and-add failed:", err);
        return {
          status: "error",
          locale: "en",
          reason: errorMessage(err),
          originalText: isRecord(request) ? String(request.rawText ?? "") : "",
        };
      }
    },
  );

  ipcMain.handle(
    "pob:skills-snapshot",
    async (event): Promise<PobSkillsSnapshotResult> => {
      try {
        const snapshot = await getPobSession(
          getGameFromSender(event),
        ).skillsSnapshot();
        return { status: "ok", snapshot };
      } catch (err) {
        logger.warn("[PoBSession] skills-snapshot failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:skills-action",
    async (event, action: unknown): Promise<PobSkillsSnapshotResult> => {
      try {
        if (!isRecord(action) || typeof action.type !== "string") {
          throw new Error("pob:skills-action requires action.type");
        }
        const snapshot = await getPobSession(
          getGameFromSender(event),
        ).skillsAction(action as PobSkillsAction);
        return { status: "ok", snapshot };
      } catch (err) {
        logger.warn("[PoBSession] skills-action failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:calcs-snapshot",
    async (event): Promise<PobCalcsSnapshotResult> => {
      try {
        const snapshot = await getPobSession(
          getGameFromSender(event),
        ).calcsSnapshot();
        return { status: "ok", snapshot };
      } catch (err) {
        logger.warn("[PoBSession] calcs-snapshot failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:calcs-breakdown",
    async (event, key: unknown): Promise<PobCalcsBreakdownResult> => {
      try {
        if (typeof key !== "string" || key === "") {
          throw new Error("pob:calcs-breakdown requires string key");
        }
        const breakdown = await getPobSession(
          getGameFromSender(event),
        ).calcsBreakdown(key);
        return { status: "ok", breakdown };
      } catch (err) {
        logger.warn("[PoBSession] calcs-breakdown failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:calcs-action",
    async (event, action: unknown): Promise<PobCalcsSnapshotResult> => {
      try {
        if (!isRecord(action) || typeof action.type !== "string") {
          throw new Error("pob:calcs-action requires action.type");
        }
        const snapshot = await getPobSession(
          getGameFromSender(event),
        ).calcsAction(action as PobCalcsAction);
        return { status: "ok", snapshot };
      } catch (err) {
        logger.warn("[PoBSession] calcs-action failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:config-snapshot",
    async (event): Promise<PobConfigSnapshotResult> => {
      try {
        const snapshot = await getPobSession(
          getGameFromSender(event),
        ).configSnapshot();
        return { status: "ok", snapshot };
      } catch (err) {
        logger.warn("[PoBSession] config-snapshot failed:", err);
        return toSessionError(err);
      }
    },
  );

  ipcMain.handle(
    "pob:config-action",
    async (event, action: unknown): Promise<PobConfigSnapshotResult> => {
      try {
        if (!isRecord(action) || typeof action.type !== "string") {
          throw new Error("pob:config-action requires action.type");
        }
        const snapshot = await getPobSession(
          getGameFromSender(event),
        ).configAction(action as PobConfigAction);
        return { status: "ok", snapshot };
      } catch (err) {
        logger.warn("[PoBSession] config-action failed:", err);
        return toSessionError(err);
      }
    },
  );
}
