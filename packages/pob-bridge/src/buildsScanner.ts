import fs from "node:fs/promises";
import path from "node:path";

import { app, BrowserWindow, ipcMain } from "electron";

import {
  BuildEntry,
  BuildsListResult,
  BuildsMutationResult,
  BuildXmlReadResult,
  PobGame,
} from "@poe2-launcher/shared/types";

import { logger } from "./logger";

const POB_DIR_BY_GAME: Record<PobGame, string> = {
  POE2: "Path of Building (PoE2)",
  POE1: "Path of Building Community",
};

const HEADER_READ_BYTES = 4096;
const STUB_BUILD_XML = "<PathOfBuilding2 />\n";

const decodeAttr = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

const extractBuildAttrs = (
  header: string,
): { level?: number; className?: string; ascendClassName?: string } => {
  const buildTag = /<Build\b([^>]*)>/i.exec(header);
  if (!buildTag) return {};
  const attrs = buildTag[1];
  const grab = (name: string): string | undefined => {
    const m = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(attrs);
    return m ? decodeAttr(m[1]) : undefined;
  };
  const levelStr = grab("level");
  const level = levelStr ? parseInt(levelStr, 10) : undefined;
  return {
    level: Number.isFinite(level) ? level : undefined,
    className: grab("className"),
    ascendClassName: grab("ascendClassName"),
  };
};

const readXmlHeader = async (file: string): Promise<string> => {
  const fh = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(HEADER_READ_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEADER_READ_BYTES, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await fh.close();
  }
};

const resolveBuildsRoot = (game: PobGame): string => {
  // Electron app.getPath('documents') honors OneDrive Documents redirect.
  const documents = app.getPath("documents");
  return path.join(documents, POB_DIR_BY_GAME[game], "Builds");
};

const normalizeSubPath = (subPath: string): string => {
  const trimmed = subPath.replace(/^[\\/]+|[\\/]+$/g, "");
  if (trimmed === "") return "";
  const parts = trimmed.split(/[\\/]+/);
  for (const p of parts) {
    if (p === "..") throw new Error("invalid subPath");
  }
  return parts.join(path.sep);
};

const resolveFolder = (game: PobGame, subPath: string): string => {
  const root = resolveBuildsRoot(game);
  const norm = normalizeSubPath(subPath);
  return norm ? path.join(root, norm) : root;
};

const scanFolder = async (
  game: PobGame,
  subPath: string,
): Promise<BuildEntry[]> => {
  const dir = resolveFolder(game, subPath);
  await fs.mkdir(dir, { recursive: true }).catch(() => undefined);

  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const entries: BuildEntry[] = [];

  for (const d of dirents) {
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) {
      const st = await fs.stat(abs).catch(() => null);
      if (st) {
        entries.push({
          kind: "folder",
          name: d.name,
          mtime: st.mtimeMs,
          size: 0,
        });
      }
      continue;
    }
    if (!d.isFile() || !d.name.toLowerCase().endsWith(".xml")) continue;
    try {
      const st = await fs.stat(abs);
      const header = await readXmlHeader(abs);
      const { level, className, ascendClassName } = extractBuildAttrs(header);
      entries.push({
        kind: "file",
        name: d.name.replace(/\.xml$/i, ""),
        mtime: st.mtimeMs,
        size: st.size,
        level,
        className,
        ascendClassName,
      });
    } catch (err) {
      logger.warn(`[Builds] failed to parse ${abs}:`, err);
    }
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "ko");
  });

  return entries;
};

const getGameFromSender = (event: Electron.IpcMainInvokeEvent): PobGame => {
  // The PoB BrowserWindow is created with hash `#game=POE2` (see main.ts).
  const win = BrowserWindow.fromWebContents(event.sender);
  const url = win?.webContents.getURL() ?? "";
  return url.includes("game=POE1") ? "POE1" : "POE2";
};

const ensureXml = (name: string): string =>
  name.toLowerCase().endsWith(".xml") ? name : `${name}.xml`;

const itemDiskName = (name: string, kind: "file" | "folder"): string =>
  kind === "file" ? ensureXml(name) : name;

const assertSafeBuildName = (name: string): void => {
  const trimmed = name.trim();
  if (
    !trimmed ||
    trimmed === "." ||
    trimmed === ".." ||
    /[\\/]/.test(trimmed)
  ) {
    throw new Error("invalid fileName");
  }
};

const tryMutation = async (
  label: string,
  fn: () => Promise<void>,
): Promise<BuildsMutationResult> => {
  try {
    await fn();
    return { status: "ok" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn(`[Builds] ${label} failed:`, reason);
    return { status: "error", reason };
  }
};

const tryReadXml = async (
  label: string,
  fn: () => Promise<string>,
): Promise<BuildXmlReadResult> => {
  try {
    return { status: "ok", xml: await fn() };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn(`[Builds] ${label} failed:`, reason);
    return { status: "error", reason };
  }
};

export const registerBuildsHandlers = (): void => {
  ipcMain.handle(
    "builds:list",
    async (event, subPath: string): Promise<BuildsListResult> => {
      const game = getGameFromSender(event);
      const entries = await scanFolder(game, subPath ?? "");
      return { subPath: subPath ?? "", entries };
    },
  );

  ipcMain.handle("builds:new-folder", (event, subPath: string, name: string) =>
    tryMutation("new-folder", async () => {
      const game = getGameFromSender(event);
      const target = path.join(resolveFolder(game, subPath), name);
      await fs.mkdir(target, { recursive: false });
    }),
  );

  ipcMain.handle(
    "builds:rename",
    (event, subPath: string, oldName: string, newName: string) =>
      tryMutation("rename", async () => {
        const game = getGameFromSender(event);
        const dir = resolveFolder(game, subPath);
        const oldAbsXml = path.join(dir, ensureXml(oldName));
        if (
          await fs.stat(oldAbsXml).then(
            () => true,
            () => false,
          )
        ) {
          await fs.rename(oldAbsXml, path.join(dir, ensureXml(newName)));
          return;
        }
        await fs.rename(path.join(dir, oldName), path.join(dir, newName));
      }),
  );

  ipcMain.handle(
    "builds:delete",
    (event, subPath: string, name: string, kind: "file" | "folder") =>
      tryMutation("delete", async () => {
        const game = getGameFromSender(event);
        const dir = resolveFolder(game, subPath);
        if (kind === "folder") {
          await fs.rm(path.join(dir, name), { recursive: true, force: false });
        } else {
          await fs.unlink(path.join(dir, ensureXml(name)));
        }
      }),
  );

  ipcMain.handle(
    "builds:copy",
    (
      event,
      srcSubPath: string,
      srcName: string,
      dstSubPath: string,
      dstName: string,
    ) =>
      tryMutation("copy", async () => {
        const game = getGameFromSender(event);
        const srcAbs = path.join(
          resolveFolder(game, srcSubPath),
          ensureXml(srcName),
        );
        const dstDir = resolveFolder(game, dstSubPath);
        await fs.mkdir(dstDir, { recursive: true });
        await fs.copyFile(srcAbs, path.join(dstDir, ensureXml(dstName)));
      }),
  );

  ipcMain.handle(
    "builds:move",
    (
      event,
      srcSubPath: string,
      name: string,
      kind: "file" | "folder",
      dstSubPath: string,
    ) =>
      tryMutation("move", async () => {
        assertSafeBuildName(name);
        const game = getGameFromSender(event);
        const srcDir = resolveFolder(game, srcSubPath);
        const dstDir = resolveFolder(game, dstSubPath);
        const srcAbs = path.join(srcDir, itemDiskName(name, kind));
        const dstAbs = path.join(dstDir, itemDiskName(name, kind));
        if (srcAbs === dstAbs) return;
        if (kind === "folder") {
          const relative = path.relative(srcAbs, dstDir);
          if (
            !relative ||
            (!relative.startsWith("..") && !path.isAbsolute(relative))
          ) {
            throw new Error("cannot move a folder into itself");
          }
        }
        await fs.mkdir(dstDir, { recursive: true });
        await fs.rename(srcAbs, dstAbs);
      }),
  );

  ipcMain.handle(
    "builds:save-stub",
    (event, subPath: string, fileName: string) =>
      tryMutation("save-stub", async () => {
        assertSafeBuildName(fileName);
        const game = getGameFromSender(event);
        const dir = resolveFolder(game, subPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
          path.join(dir, ensureXml(fileName)),
          STUB_BUILD_XML,
          {
            flag: "wx",
          },
        );
      }),
  );

  ipcMain.handle(
    "builds:read-xml",
    (event, subPath: string, fileName: string) =>
      tryReadXml("read-xml", async () => {
        assertSafeBuildName(fileName);
        const game = getGameFromSender(event);
        return fs.readFile(
          path.join(resolveFolder(game, subPath), ensureXml(fileName)),
          "utf8",
        );
      }),
  );

  ipcMain.handle(
    "builds:save-xml",
    (event, subPath: string, fileName: string, xml: string) =>
      tryMutation("save-xml", async () => {
        assertSafeBuildName(fileName);
        if (typeof xml !== "string") throw new Error("invalid xml");
        const game = getGameFromSender(event);
        const dir = resolveFolder(game, subPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, ensureXml(fileName)), xml, {
          flag: "wx",
        });
      }),
  );
};
