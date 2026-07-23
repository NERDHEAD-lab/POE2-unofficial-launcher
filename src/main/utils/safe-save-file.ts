import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function assertSaveDestinationOutsideManagedDirectory(
  managedDirectory: string,
  destinationPath: string,
): Promise<void> {
  const [realManagedDirectory, realDestinationParent] = await Promise.all([
    fs.realpath(managedDirectory),
    fs.realpath(path.dirname(destinationPath)),
  ]);

  if (isPathInsideDirectory(realManagedDirectory, realDestinationParent)) {
    throw new Error("Save destination is inside the managed log directory");
  }
}

export async function writeFileWithAtomicReplacement(
  managedDirectory: string,
  destinationPath: string,
  content: Buffer,
): Promise<void> {
  await assertSaveDestinationOutsideManagedDirectory(
    managedDirectory,
    destinationPath,
  );

  const temporaryPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.${randomUUID()}.tmp`,
  );

  try {
    await fs.writeFile(temporaryPath, content, {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temporaryPath, destinationPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

function isPathInsideDirectory(directory: string, targetPath: string): boolean {
  const relative = path.relative(
    path.resolve(directory),
    path.resolve(targetPath),
  );
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
