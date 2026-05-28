import { describe, expect, it } from "vitest";

import type { PobTreeNode } from "@poe2-launcher/shared/types";

import {
  buildDdsAssetLookup,
  ddsImageKey,
  getNodeEffectDrawSize,
  getNodeEffectOpacity,
  getNodeFrameAssetName,
  getNodeHitRadius,
  resolveDdsAssetRef,
  resolveTreeAssetFilename,
} from "./passiveTreeAssets";

const node = (overrides: Partial<PobTreeNode>): PobTreeNode => ({
  id: 1,
  x: 0,
  y: 0,
  name: "Test",
  type: "Normal",
  ascendancyName: null,
  isAscendancyStart: false,
  isKeystone: false,
  isNotable: false,
  isSocket: false,
  isMastery: false,
  isOnlyImage: false,
  alloc: false,
  linked: [],
  ...overrides,
});

describe("passiveTreeAssets", () => {
  it("builds layer references from PoE2 ddsCoords", () => {
    const lookup = buildDdsAssetLookup({
      "skills_64_64_BC1.dds.zst": {
        "Art/2DArt/SkillIcons/passives/plusstrength.dds": 47,
      },
      "skills-disabled_64_64_BC1.dds.zst": {
        "Art/2DArt/SkillIcons/passives/plusstrength.dds": 24,
      },
    });

    const active = resolveDdsAssetRef(
      lookup,
      "Art/2DArt/SkillIcons/passives/plusstrength.dds",
      false,
    );
    const disabled = resolveDdsAssetRef(
      lookup,
      "Art/2DArt/SkillIcons/passives/plusstrength.dds",
      true,
    );

    expect(active).toMatchObject({
      file: "skills_64_64_BC1.dds.zst",
      layer: 47,
    });
    expect(disabled).toMatchObject({
      file: "skills-disabled_64_64_BC1.dds.zst",
      layer: 24,
    });
    expect(active && ddsImageKey(active)).toBe(
      "dds:skills_64_64_BC1.dds.zst:47",
    );
  });

  it("uses PoB overlay names before fallback frame names", () => {
    expect(
      getNodeFrameAssetName(
        node({
          alloc: true,
          overlay: {
            alloc: "CustomAllocated",
            unalloc: "CustomUnallocated",
          },
        }),
      ),
    ).toBe("CustomAllocated");

    expect(getNodeFrameAssetName(node({ type: "Normal", alloc: true }))).toBe(
      "PSSkillFrameActive",
    );
    expect(
      getNodeFrameAssetName(
        node({ type: "Socket", isSocket: true, alloc: false }),
      ),
    ).toBe("JewelFrameUnallocated");
    expect(
      getNodeFrameAssetName(
        node({ type: "OnlyImage", isOnlyImage: true, alloc: false }),
      ),
    ).toBeNull();
  });

  it("resolves PoB hover/path frame states separately from allocation", () => {
    expect(
      getNodeFrameAssetName(
        node({
          alloc: false,
          overlay: {
            alloc: "CustomAllocated",
            path: "CustomCanAllocate",
            unalloc: "CustomUnallocated",
          },
        }),
        "alloc",
      ),
    ).toBe("CustomAllocated");
    expect(
      getNodeFrameAssetName(
        node({
          alloc: false,
          overlay: {
            alloc: "CustomAllocated",
            path: "CustomCanAllocate",
            unalloc: "CustomUnallocated",
          },
        }),
        "path",
      ),
    ).toBe("CustomCanAllocate");
    expect(getNodeFrameAssetName(node({ type: "Normal" }), "alloc")).toBe(
      "PSSkillFrameActive",
    );
  });

  it("resolves PoB tree asset names to PNG filenames", () => {
    expect(
      resolveTreeAssetFilename(
        {
          CharacterLineConnectorNormal: "Character_orbit_normal0.png",
          IgnoredDds: "skills_64_64_BC1.dds.zst",
        },
        "CharacterLineConnectorNormal",
      ),
    ).toBe("Character_orbit_normal0.png");
    expect(
      resolveTreeAssetFilename(
        {
          CharacterOrbit1Active: ["Character_orbit_intermediateactive9.png"],
        },
        "CharacterOrbit1Active",
      ),
    ).toBe("Character_orbit_intermediateactive9.png");
    expect(
      resolveTreeAssetFilename(
        { IgnoredDds: "skills_64_64_BC1.dds.zst" },
        "IgnoredDds",
      ),
    ).toBeNull();
  });

  it("treats PoB target sizes as centered half extents", () => {
    expect(
      getNodeHitRadius(
        node({
          targetSize: {
            width: 37,
            height: 37,
            overlay: { width: 54, height: 54 },
          },
        }),
      ),
    ).toBe(54);
    expect(
      getNodeEffectDrawSize(
        node({
          targetSize: { effect: { width: 380, height: 380 } },
        }),
      ),
    ).toEqual({ width: 380, height: 380 });
  });

  it("brightens active effect artwork for allocated and hover/path states", () => {
    expect(getNodeEffectOpacity(node({ alloc: true }))).toBe(1);
    expect(getNodeEffectOpacity(node({ alloc: false }), "alloc")).toBe(1);
    expect(getNodeEffectOpacity(node({ alloc: false }), "path")).toBe(1);
    expect(getNodeEffectOpacity(node({ alloc: false }))).toBe(0.15);
    expect(
      getNodeEffectOpacity(
        node({ type: "OnlyImage", isOnlyImage: true, alloc: true }),
        "alloc",
      ),
    ).toBe(0.15);
  });
});
