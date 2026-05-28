import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const resourceRoot = path.join(packageRoot, "resources", "lua");

describe("pob-headless-glue resources", () => {
  it("keeps the LuaJIT host files inside the package resource boundary", () => {
    expect(new Set(fs.readdirSync(resourceRoot))).toEqual(
      new Set([
        "HeadlessWrapper.lua",
        "LICENSE-LuaJIT.txt",
        "ipc_bridge.lua",
        "lua51.dll",
        "luajit.exe",
      ]),
    );
  });
});
