import fs from "node:fs/promises";
import path from "node:path";

import { PobGame } from "../../shared/types";

const POB_EXE_BY_GAME: Record<PobGame, string> = {
  POE2: "Path of Building-PoE2.exe",
  // PoE1 PoB Community 본체 exe 이름 — 백로그 §5.8 에서 실증 후 갱신.
  POE1: "Path of Building.exe",
};

// PoC 에서 확인한 헤드리스 부팅에 필요한 lua 코어 + native 의존성.
const REQUIRED_DLLS = [
  "lua51.dll",
  "lua-utf8.dll",
  "lcurl.dll",
  "socket.dll",
  "lzip.dll",
  "zlib1.dll",
];

const REQUIRED_LUA_FILES = ["Modules/Build.lua"];

const fileExists = async (target: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(target);
    return stat.isFile();
  } catch {
    return false;
  }
};

export interface VerifyResult {
  ok: boolean;
  missing: string[];
}

export const verifyPobInstallation = async (
  installLocation: string,
  game: PobGame = "POE2",
): Promise<VerifyResult> => {
  const required = [
    POB_EXE_BY_GAME[game],
    ...REQUIRED_DLLS,
    ...REQUIRED_LUA_FILES,
  ];

  const missing: string[] = [];
  for (const rel of required) {
    const full = path.join(installLocation, rel);
    if (!(await fileExists(full))) {
      missing.push(rel);
    }
  }

  return { ok: missing.length === 0, missing };
};
