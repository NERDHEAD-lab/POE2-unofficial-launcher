import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

import { app } from "electron";

import { PoBVault, pobVault } from "./pobVault";
import { PobGame } from "../../shared/types";
import { logger } from "../utils/logger";
import { getPobInstallPath } from "../utils/registry";

const LUA_PATH = ".\\?.lua;.\\?\\init.lua;.\\lua\\?.lua;.\\lua\\?\\init.lua";
const READY_TIMEOUT_MS = 10_000;
const RPC_TIMEOUT_MS = 30_000;

interface RpcErrorPayload {
  code: number;
  message: string;
}

interface RpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id?: number;
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

export interface PobLoadBuildXmlResult {
  ok: boolean;
  className: string;
  ascendClassName: string;
  level: number;
}

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

export class PoBSession {
  private readonly game: PobGame;
  private readonly installLocation?: string;
  private readonly resourceRoot: string;
  private readonly vault: PoBVault;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = "";
  private nextId = 1;
  private readyWaiter: ReadyWaiter | null = null;
  private readonly pending = new Map<number, PendingCall>();

  constructor(options: PoBSessionOptions = {}) {
    this.game = options.game ?? "POE2";
    this.installLocation = options.installLocation;
    this.resourceRoot = options.resourceRoot ?? resolveDefaultResourceRoot();
    this.vault = options.vault ?? pobVault;
  }

  async spawn(): Promise<void> {
    if (this.proc && this.proc.exitCode === null) return;

    const active = await this.resolveActiveVault();
    const luaExe = path.join(this.resourceRoot, "luajit.exe");
    const bridgePath = path.join(this.resourceRoot, "ipc_bridge.lua");
    const wrapperPath = path.join(this.resourceRoot, "HeadlessWrapper.lua");

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

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
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
  }

  async call<T>(method: string, params: object = {}): Promise<T> {
    if (!this.proc || this.proc.exitCode !== null) await this.spawn();
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error("PoBSession stdin is not writable");
    }

    const id = this.nextId++;
    const request = JSON.stringify({ jsonrpc: "2.0", id, method, params });
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
    this.proc.stdin.write(`${request}\n`);
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

  exportBuildXml(): Promise<PobExportBuildXmlResult> {
    return this.call<PobExportBuildXmlResult>("pob.exportBuildXml");
  }

  async dispose(): Promise<void> {
    const proc = this.proc;
    if (!proc) return;
    this.proc = null;

    if (proc.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2_000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      proc.kill();
    });
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

    let message: RpcResponse;
    try {
      message = JSON.parse(line) as RpcResponse;
    } catch {
      logger.warn(`[PoBSession] non-json stdout: ${line}`);
      return;
    }

    if (message.method === "_ready") {
      logger.log("[PoBSession] READY");
      this.resolveReady();
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
