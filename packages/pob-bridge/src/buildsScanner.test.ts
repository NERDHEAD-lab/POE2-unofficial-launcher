import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeBuildXmlFile } from "./buildsScanner";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => ""),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

let tempRoot: string;

describe("buildsScanner save XML writes", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pob-build-save-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("keeps create-only saves exclusive when the file already exists", async () => {
    await writeBuildXmlFile(tempRoot, "Existing", "<old />");

    await expect(
      writeBuildXmlFile(tempRoot, "Existing", "<new />"),
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(
      fs.readFile(path.join(tempRoot, "Existing.xml"), "utf8"),
    ).resolves.toBe("<old />");
  });

  it("overwrites an existing current build when requested", async () => {
    await writeBuildXmlFile(tempRoot, "Existing", "<old />");

    await writeBuildXmlFile(tempRoot, "Existing", "<new />", {
      overwrite: true,
    });

    await expect(
      fs.readFile(path.join(tempRoot, "Existing.xml"), "utf8"),
    ).resolves.toBe("<new />");
  });
});
