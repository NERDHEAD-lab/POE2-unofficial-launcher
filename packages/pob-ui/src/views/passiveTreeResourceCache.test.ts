import { afterEach, describe, expect, it, vi } from "vitest";

import type { PobTreeNode, PobTreeSnapshot } from "@poe2-launcher/shared/types";

import {
  buildPassiveTreeResourceManifest,
  classifyPassiveTreeLoadScenario,
  defaultPassiveTreePerfReporter,
  passiveTreeResourceCacheKeyToString,
  timePassiveTreeSyncStage,
  type PassiveTreeMetadata,
} from "./passiveTreeResourceCache";

const node = (overrides: Partial<PobTreeNode>): PobTreeNode => ({
  id: 1,
  x: 0,
  y: 0,
  name: "Test node",
  type: "Normal",
  ascendancyName: null,
  isAscendancyStart: false,
  isKeystone: false,
  isNotable: false,
  isSocket: false,
  isMastery: false,
  isOnlyImage: false,
  alloc: false,
  icon: "SkillIcon",
  activeEffectImage: "ActiveEffect",
  overlay: {
    alloc: "OverlayAlloc",
    unalloc: "OverlayUnalloc",
    path: "OverlayPath",
  },
  linked: [],
  ...overrides,
});

const snapshot = (
  overrides: Partial<PobTreeSnapshot> = {},
): PobTreeSnapshot => ({
  treeVersion: "0_4",
  classId: 1,
  className: "Witch",
  ascendClassId: null,
  ascendClassName: null,
  allocCount: 0,
  viewport: null,
  treeSize: 1000,
  nodes: [node({})],
  ...overrides,
});

const metadata = (
  overrides: Partial<PassiveTreeMetadata> = {},
): PassiveTreeMetadata => ({
  assets: {
    ConnectionArt: "connection.png",
    ClassArt: ["class.png"],
  },
  ddsCoords: {
    "art_active.dds.zst": {
      Background2: 1,
      BGTreeActive: 2,
      BGTree: 3,
      AscendancyMiddle: 4,
      SkillIcon: 5,
      ActiveEffect: 6,
      PSSkillFrame: 7,
      PSSkillFrameActive: 8,
      OverlayAlloc: 9,
      OverlayUnalloc: 10,
      OverlayPath: 11,
      Greed: 12,
    },
    "art_disabled.dds.zst": {
      SkillIcon: 5,
    },
  },
  classBackground: { image: "ClassBackground", x: 0, y: 0 },
  ...overrides,
});

describe("passiveTreeResourceCache", () => {
  afterEach(() => {
    window.localStorage.removeItem("pob:treePerf");
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "pobAPI");
  });

  it("builds a static resource key that ignores build allocation state", () => {
    const unallocated = buildPassiveTreeResourceManifest({
      snapshot: snapshot({ nodes: [node({ alloc: false })] }),
      metadata: metadata(),
      vaultPath: "D:\\PoB",
    });
    const allocated = buildPassiveTreeResourceManifest({
      snapshot: snapshot({ nodes: [node({ alloc: true })] }),
      metadata: metadata(),
      vaultPath: "D:/PoB/",
    });

    expect(unallocated).not.toBeNull();
    expect(allocated).not.toBeNull();
    expect(passiveTreeResourceCacheKeyToString(unallocated!.cacheKey)).toEqual(
      passiveTreeResourceCacheKeyToString(allocated!.cacheKey),
    );
  });

  it("keeps tree version and asset paths in the cache key", () => {
    const base = buildPassiveTreeResourceManifest({
      snapshot: snapshot(),
      metadata: metadata(),
      vaultPath: "D:/PoB",
    });
    const nextVersion = buildPassiveTreeResourceManifest({
      snapshot: snapshot({ treeVersion: "0_5" }),
      metadata: metadata(),
      vaultPath: "D:/PoB",
    });
    const nextAsset = buildPassiveTreeResourceManifest({
      snapshot: snapshot(),
      metadata: metadata({ assets: { ConnectionArt: "connection2.png" } }),
      vaultPath: "D:/PoB",
    });

    expect(base).not.toBeNull();
    expect(nextVersion).not.toBeNull();
    expect(nextAsset).not.toBeNull();
    expect(passiveTreeResourceCacheKeyToString(base!.cacheKey)).not.toEqual(
      passiveTreeResourceCacheKeyToString(nextVersion!.cacheKey),
    );
    expect(passiveTreeResourceCacheKeyToString(base!.cacheKey)).not.toEqual(
      passiveTreeResourceCacheKeyToString(nextAsset!.cacheKey),
    );
  });

  it("groups DDS layers by file and keeps PNG resources separate", () => {
    const manifest = buildPassiveTreeResourceManifest({
      snapshot: snapshot(),
      metadata: metadata(),
      vaultPath: "D:/PoB",
    });

    expect(manifest).not.toBeNull();
    expect([...manifest!.pngByKey.values()].sort()).toEqual([
      "class.png",
      "connection.png",
    ]);
    expect(
      manifest!.ddsByFile
        .get("art_active.dds.zst")
        ?.map((entry) => entry.layer),
    ).toEqual([1, 2, 3, 4, 5, 6, 9, 10, 11]);
    expect(
      manifest!.ddsByFile
        .get("art_disabled.dds.zst")
        ?.map((entry) => entry.layer),
    ).toEqual([5]);
  });

  it("loads notable recipe DDS icons used by tree tooltip headers", () => {
    const manifest = buildPassiveTreeResourceManifest({
      snapshot: snapshot({
        nodes: [node({ recipe: ["Greed"] })],
      }),
      metadata: metadata(),
      vaultPath: "D:/PoB",
    });

    expect(
      manifest!.ddsByFile
        .get("art_active.dds.zst")
        ?.map((entry) => entry.layer),
    ).toContain(12);
  });

  it("classifies cold, warm, and build switch load scenarios", () => {
    const manifest = buildPassiveTreeResourceManifest({
      snapshot: snapshot(),
      metadata: metadata(),
      vaultPath: "D:/PoB",
    });
    expect(manifest).not.toBeNull();

    const context = {
      buildKey: "build-a:0",
      resourceKey: manifest!.cacheKey,
    };

    expect(classifyPassiveTreeLoadScenario(null, context)).toBe("cold-start");
    expect(classifyPassiveTreeLoadScenario(context, context)).toBe(
      "warm-return",
    );
    expect(
      classifyPassiveTreeLoadScenario(context, {
        ...context,
        buildKey: "build-b:0",
      }),
    ).toBe("build-switch");
  });

  it("reports opt-in performance measures to console and main debug log", () => {
    const debugLog = vi.fn();
    Object.defineProperty(window, "pobAPI", {
      configurable: true,
      value: { debugLog },
    });
    const consoleDebug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => {});
    window.localStorage.setItem("pob:treePerf", "1");

    defaultPassiveTreePerfReporter({
      scenario: "cold-start",
      stage: "snapshot",
      durationMs: 12.34,
      nodeCount: 42,
      treeVersion: "0_4",
      buildKey: "Imported Build2",
    });

    expect(consoleDebug).toHaveBeenCalledWith(
      expect.stringContaining("[pob-tree] cold-start snapshot 12.3ms"),
      expect.objectContaining({ stage: "snapshot" }),
    );
    expect(debugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "POB_TREE",
        content: expect.stringContaining("nodes=42"),
        isError: false,
      }),
    );
  });

  it("times synchronous Tree stages for translation and projection", () => {
    const measures: unknown[] = [];
    const result = timePassiveTreeSyncStage(
      "warm-return",
      "translate-tree",
      () => 42,
      (measure) => measures.push(measure),
      { nodeCount: 3, treeVersion: "0_4" },
    );

    expect(result).toBe(42);
    expect(measures).toHaveLength(1);
    expect(measures[0]).toMatchObject({
      scenario: "warm-return",
      stage: "translate-tree",
      nodeCount: 3,
      treeVersion: "0_4",
    });
  });
});
