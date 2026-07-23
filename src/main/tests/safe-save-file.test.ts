import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertSaveDestinationOutsideManagedDirectory,
  writeFileWithAtomicReplacement,
} from "../utils/safe-save-file";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "safe-log-save-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("safe log archive save", () => {
  it("writes a new destination outside the managed directory", async () => {
    const root = createTemporaryDirectory();
    const managedDirectory = path.join(root, "logs");
    const exportDirectory = path.join(root, "exports");
    const destinationPath = path.join(exportDirectory, "logs.zip");
    mkdirSync(managedDirectory);
    mkdirSync(exportDirectory);

    await writeFileWithAtomicReplacement(
      managedDirectory,
      destinationPath,
      Buffer.from("archive"),
    );

    expect(readFileSync(destinationPath, "utf8")).toBe("archive");
  });

  it("rejects existing and non-existing destinations under the managed real path", async () => {
    const root = createTemporaryDirectory();
    const managedDirectory = path.join(root, "logs");
    mkdirSync(managedDirectory);
    const existingPath = path.join(managedDirectory, "existing.zip");
    writeFileSync(existingPath, "existing");

    await expect(
      assertSaveDestinationOutsideManagedDirectory(
        managedDirectory,
        existingPath,
      ),
    ).rejects.toThrow("managed log directory");
    await expect(
      assertSaveDestinationOutsideManagedDirectory(
        managedDirectory,
        path.join(managedDirectory, "new.zip"),
      ),
    ).rejects.toThrow("managed log directory");
  });

  it("rejects a junction parent that resolves into the managed directory", async () => {
    const root = createTemporaryDirectory();
    const managedDirectory = path.join(root, "logs");
    const aliasDirectory = path.join(root, "logs-alias");
    mkdirSync(managedDirectory);

    try {
      symlinkSync(managedDirectory, aliasDirectory, "junction");
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code;
      if (errorCode === "EPERM" || errorCode === "EACCES") return;
      throw error;
    }

    await expect(
      assertSaveDestinationOutsideManagedDirectory(
        managedDirectory,
        path.join(aliasDirectory, "new.zip"),
      ),
    ).rejects.toThrow("managed log directory");
  });

  it("atomically replaces a hard-link alias without truncating the managed inode", async () => {
    const root = createTemporaryDirectory();
    const managedDirectory = path.join(root, "logs");
    const exportDirectory = path.join(root, "exports");
    mkdirSync(managedDirectory);
    mkdirSync(exportDirectory);
    const managedSegment = path.join(
      managedDirectory,
      "launcher-2026-07-24.000.log",
    );
    const destinationPath = path.join(exportDirectory, "logs.zip");
    writeFileSync(managedSegment, "original log");
    linkSync(managedSegment, destinationPath);
    const managedInode = statSync(managedSegment).ino;

    await writeFileWithAtomicReplacement(
      managedDirectory,
      destinationPath,
      Buffer.from("archive"),
    );

    expect(readFileSync(managedSegment, "utf8")).toBe("original log");
    expect(statSync(managedSegment).ino).toBe(managedInode);
    expect(readFileSync(destinationPath, "utf8")).toBe("archive");
    expect(statSync(destinationPath).ino).not.toBe(managedInode);
  });
});
