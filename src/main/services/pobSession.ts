import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import * as zlib from "node:zlib";

import { app, BrowserWindow, ipcMain } from "electron";

import { PoBVault, pobVault } from "./pobVault";
import {
  PobBuildSummary,
  PobGame,
  PobLoadBuildResult,
  PobSaveBuildResult,
  PobSessionResult,
} from "../../shared/types";
import { logger } from "../utils/logger";
import { getPobInstallPath } from "../utils/registry";

const LUA_PATH =
  ".\\?.lua;.\\?\\init.lua;.\\lua\\?.lua;.\\lua\\?\\init.lua;.\\runtime\\lua\\?.lua;.\\runtime\\lua\\?\\init.lua";
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

export interface PoBSessionOptions {
  game?: PobGame;
  installLocation?: string;
  resourceRoot?: string;
  vault?: PoBVault;
}

const resolveDefaultResourceRoot = (): string => {
  if (app.isPackaged) return path.join(process.resourcesPath, "lua");
  return path.join(app.getAppPath(), "resources", "lua");
};

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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

  newBuild(name = "New build"): Promise<PobLoadBuildXmlResult> {
    return this.call<PobLoadBuildXmlResult>("pob.newBuild", { name });
  }

  exportBuildXml(): Promise<PobExportBuildXmlResult> {
    return this.call<PobExportBuildXmlResult>("pob.exportBuildXml");
  }

  saveBuildXml(): Promise<PobExportBuildXmlResult> {
    return this.call<PobExportBuildXmlResult>("pob.saveBuildXml");
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
        PATH: `${this.resourceRoot};${active.vaultPath};${process.env.PATH ?? ""}`,
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
    const detected = await getPobInstallPath(this.game);
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

const sessions = new Map<PobGame, PoBSession>();

const getGameFromSender = (event: Electron.IpcMainInvokeEvent): PobGame => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const url = win?.webContents.getURL() ?? "";
  return url.includes("game=POE1") ? "POE1" : "POE2";
};

export const getPobSession = (game: PobGame): PoBSession => {
  const existing = sessions.get(game);
  if (existing) return existing;
  const session = new PoBSession({ game });
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

export function registerPobSessionHandlers(): void {
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
}
