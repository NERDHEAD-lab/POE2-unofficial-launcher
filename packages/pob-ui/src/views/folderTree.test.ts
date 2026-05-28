import { describe, expect, it } from "vitest";

import type { BuildEntry } from "@poe2-launcher/shared/types";

import {
  canMoveItemToFolder,
  getFolderAncestors,
  getNextUnnamedBuildName,
  joinSubPath,
} from "./folderTree";

const file = (name: string): BuildEntry => ({
  kind: "file",
  name,
  mtime: 0,
  size: 0,
});

describe("folderTree", () => {
  it("joins root and nested sub paths without leading separators", () => {
    expect(joinSubPath("", "Showcases")).toBe("Showcases");
    expect(joinSubPath("Builds", "Showcases")).toBe("Builds/Showcases");
  });

  it("returns root-to-leaf folder ancestors", () => {
    expect(getFolderAncestors("PvP/Showcases")).toEqual([
      "",
      "PvP",
      "PvP/Showcases",
    ]);
  });

  it("uses the bare unnamed build first, then PoB-style numeric suffixes", () => {
    expect(getNextUnnamedBuildName([], "Unnamed build")).toBe("Unnamed build");
    expect(
      getNextUnnamedBuildName([file("Unnamed build")], "Unnamed build"),
    ).toBe("Unnamed build (2)");
    expect(
      getNextUnnamedBuildName(
        [file("Unnamed build"), file("Unnamed build (2).xml")],
        "Unnamed build",
      ),
    ).toBe("Unnamed build (3)");
  });

  it("allows drag-moving files and blocks folders moving into themselves", () => {
    expect(
      canMoveItemToFolder(
        { kind: "file", subPath: "Showcases", name: "Imported Build" },
        "PvP",
      ),
    ).toBe(true);
    expect(
      canMoveItemToFolder(
        { kind: "file", subPath: "Showcases", name: "Imported Build" },
        "Showcases",
      ),
    ).toBe(false);
    expect(
      canMoveItemToFolder(
        { kind: "folder", subPath: "", name: "Showcases" },
        "Showcases",
      ),
    ).toBe(false);
    expect(
      canMoveItemToFolder(
        { kind: "folder", subPath: "", name: "Showcases" },
        "Showcases/Nested",
      ),
    ).toBe(false);
  });
});
