import type {
  DebugLogPayload,
  PobSessionAPI,
  PobTreePerfDebugContext,
  PobTreeMetadataResult,
  PobTreeResult,
  PobTreeSnapshot,
} from "@poe2-launcher/shared/types";

import {
  buildDdsAssetLookup,
  ddsImageKey,
  extractDdsCoords,
  getNodeFrameAssetName,
  isDdsFile,
  pngImageKey,
  resolveDdsAssetRef,
} from "./passiveTreeAssets";
import { decodeDdsZstLayers } from "../utils/DdsDecoder";

export type TreeImage = HTMLImageElement | HTMLCanvasElement;

export interface PassiveTreeMetadata {
  assets?: Record<string, unknown>;
  connectors?: unknown[] | Record<string, unknown>;
  ddsCoords?: unknown;
  skillSprites?: unknown;
  classBackground?: TreeArtPlacement | null;
  ascendancyBackgrounds?: TreeArtPlacement[];
  groupBackgrounds?: TreeArtPlacement[];
}

export interface TreeArtPlacement {
  image?: string | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  active?: { width?: number | null; height?: number | null } | null;
  bg?: { width?: number | null; height?: number | null } | null;
  selected?: boolean | null;
  isHalfImage?: boolean | null;
  startNodeX?: number | null;
  startNodeY?: number | null;
}

export type PassiveTreeLoadScenario =
  | "cold-start"
  | "warm-return"
  | "build-switch"
  | "prewarm";

export type PassiveTreeLoadStage =
  | "snapshot"
  | "metadata"
  | "resource-manifest"
  | "resource-load"
  | "translate-tree"
  | "project-scene"
  | "canvas-draw";

export interface PassiveTreePerfMeasure {
  scenario: PassiveTreeLoadScenario;
  stage: PassiveTreeLoadStage;
  durationMs: number;
  resourceCount?: number;
  cacheHits?: number;
  nodeCount?: number;
  treeVersion?: string | null;
  buildKey?: string;
}

export type PassiveTreePerfReporter = (measure: PassiveTreePerfMeasure) => void;

export interface PassiveTreeResourceCacheKey {
  vaultPath: string;
  treeVersion: string;
  assetFingerprint: string;
}

export interface PassiveTreeLoadContext {
  buildKey: string;
  resourceKey: PassiveTreeResourceCacheKey;
}

export interface PassiveTreeDdsResourceRequest {
  key: string;
  file: string;
  layer: number;
}

export interface PassiveTreeResourceManifest {
  cacheKey: PassiveTreeResourceCacheKey;
  ddsByFile: Map<string, PassiveTreeDdsResourceRequest[]>;
  pngByKey: Map<string, string>;
  resourceCount: number;
}

export interface PassiveTreeResourceLoadInput {
  snapshot: PobTreeSnapshot;
  metadata: PassiveTreeMetadata;
  vaultPath: string;
}

export interface PassiveTreeResourceLoadOptions {
  scenario: PassiveTreeLoadScenario;
  buildKey?: string;
  reportMeasure?: PassiveTreePerfReporter;
  onImage?: (key: string, image: TreeImage) => void;
  fetchImpl?: typeof fetch;
  imageFactory?: () => HTMLImageElement;
  decodeDdsLayers?: typeof decodeDdsZstLayers;
}

export interface PassiveTreeResourceLoadResult {
  manifest: PassiveTreeResourceManifest;
  images: Record<string, TreeImage>;
  cacheHits: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const asTreeMetadata = (value: unknown): PassiveTreeMetadata =>
  isRecord(value) ? (value as PassiveTreeMetadata) : {};

export const normalizePassiveTreeVaultPath = (vaultPath: string): string =>
  vaultPath.replace(/\\/g, "/").replace(/\/+$/, "");

const now = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export const isPassiveTreePerfEnabled = (): boolean => {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage?.getItem("pob:treePerf") === "1"
    );
  } catch {
    return false;
  }
};

const formatPassiveTreePerfLine = (measure: PassiveTreePerfMeasure): string => {
  const parts = [
    measure.scenario,
    measure.stage,
    `${measure.durationMs.toFixed(1)}ms`,
  ];
  if (measure.treeVersion) parts.push(`tree=${measure.treeVersion}`);
  if (typeof measure.nodeCount === "number") {
    parts.push(`nodes=${measure.nodeCount}`);
  }
  if (typeof measure.resourceCount === "number") {
    parts.push(`resources=${measure.resourceCount}`);
  }
  if (typeof measure.cacheHits === "number") {
    parts.push(`cacheHits=${measure.cacheHits}`);
  }
  if (measure.buildKey) parts.push(`build=${measure.buildKey}`);
  return `[pob-tree] ${parts.join(" ")}`;
};

const createDebugLogPayload = (
  measure: PassiveTreePerfMeasure,
): DebugLogPayload => ({
  type: "POB_TREE",
  content: formatPassiveTreePerfLine(measure),
  isError: false,
  timestamp: Date.now(),
  typeColor: "#8be9fd",
  textColor: "#f8f8f2",
  priority: 2,
});

export const defaultPassiveTreePerfReporter: PassiveTreePerfReporter = (
  measure,
) => {
  if (!isPassiveTreePerfEnabled()) return;
  console.debug(formatPassiveTreePerfLine(measure), measure);
  try {
    window.pobAPI?.debugLog?.(createDebugLogPayload(measure));
  } catch {
    // Debug reporting must never affect Tree rendering.
  }
};

export const timePassiveTreeStage = async <T>(
  scenario: PassiveTreeLoadScenario,
  stage: PassiveTreeLoadStage,
  work: () => Promise<T>,
  reportMeasure: PassiveTreePerfReporter = defaultPassiveTreePerfReporter,
): Promise<T> => {
  const startedAt = now();
  try {
    return await work();
  } finally {
    reportMeasure({
      scenario,
      stage,
      durationMs: now() - startedAt,
    });
  }
};

export const timePassiveTreeSyncStage = <T>(
  scenario: PassiveTreeLoadScenario,
  stage: PassiveTreeLoadStage,
  work: () => T,
  reportMeasure: PassiveTreePerfReporter = defaultPassiveTreePerfReporter,
  details: Partial<Omit<PassiveTreePerfMeasure, "scenario" | "stage">> = {},
): T => {
  const startedAt = now();
  try {
    return work();
  } finally {
    reportMeasure({
      scenario,
      stage,
      durationMs: now() - startedAt,
      ...details,
    });
  }
};

export const createPassiveTreePerfDebugContext = (
  scenario: PassiveTreeLoadScenario,
  buildKey: string,
): PobTreePerfDebugContext | undefined =>
  isPassiveTreePerfEnabled()
    ? {
        enabled: true,
        scenario,
        buildKey,
      }
    : undefined;

export const passiveTreeResourceCacheKeyToString = (
  key: PassiveTreeResourceCacheKey,
): string => `${key.vaultPath}|${key.treeVersion}|${key.assetFingerprint}`;

export const classifyPassiveTreeLoadScenario = (
  previous: PassiveTreeLoadContext | null,
  current: PassiveTreeLoadContext,
): PassiveTreeLoadScenario => {
  if (!previous) return "cold-start";
  if (previous.buildKey !== current.buildKey) return "build-switch";
  return passiveTreeResourceCacheKeyToString(previous.resourceKey) ===
    passiveTreeResourceCacheKeyToString(current.resourceKey)
    ? "warm-return"
    : "cold-start";
};

const readAssetFilename = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  if (isRecord(value)) {
    const first =
      value["1"] ??
      Object.values(value).find((entry) => typeof entry === "string");
    return typeof first === "string" ? first : null;
  }
  return null;
};

const addPngAssetFilenames = (
  assets: Record<string, unknown> | undefined,
  pngByKey: Map<string, string>,
) => {
  if (!assets) return;
  for (const value of Object.values(assets)) {
    const filename = readAssetFilename(value);
    if (filename && !isDdsFile(filename)) {
      pngByKey.set(pngImageKey(filename), filename);
    }
  }
};

const assetFingerprint = (
  ddsByFile: Map<string, PassiveTreeDdsResourceRequest[]>,
  pngByKey: Map<string, string>,
): string => {
  const ddsParts = [...ddsByFile.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, entries]) => {
      const layers = [...new Set(entries.map((entry) => entry.layer))]
        .sort((a, b) => a - b)
        .join(",");
      return `dds:${file}:${layers}`;
    });
  const pngParts = [...pngByKey.values()]
    .sort((a, b) => a.localeCompare(b))
    .map((filename) => `png:${filename}`);
  return [...ddsParts, ...pngParts].join("|");
};

export const buildPassiveTreeResourceManifest = ({
  snapshot,
  metadata,
  vaultPath,
}: PassiveTreeResourceLoadInput): PassiveTreeResourceManifest | null => {
  const treeVersion = snapshot.treeVersion;
  if (!treeVersion) return null;

  const ddsLookup = buildDdsAssetLookup(extractDdsCoords(metadata));
  const ddsToLoad = new Map<string, PassiveTreeDdsResourceRequest>();
  const pngByKey = new Map<string, string>();

  const addDds = (assetName: string | null | undefined, disabled: boolean) => {
    const ref = resolveDdsAssetRef(ddsLookup, assetName, disabled);
    if (!ref) return;
    ddsToLoad.set(ddsImageKey(ref), {
      key: ddsImageKey(ref),
      file: ref.file,
      layer: ref.layer,
    });
  };

  addDds("Background2", false);
  addDds(metadata.classBackground?.image, false);
  addDds("BGTreeActive", false);
  addDds("BGTree", false);
  addDds("AscendancyMiddle", false);
  for (const art of metadata.ascendancyBackgrounds ?? []) {
    addDds(art.image, false);
  }
  for (const art of metadata.groupBackgrounds ?? []) {
    addDds(art.image, false);
  }

  for (const node of snapshot.nodes) {
    addDds(node.icon, false);
    addDds(node.icon, true);
    addDds(node.activeEffectImage, false);
    addDds(getNodeFrameAssetName(node, "alloc"), false);
    addDds(getNodeFrameAssetName(node, "path"), false);
    addDds(getNodeFrameAssetName(node, "unalloc"), false);
    addDds(node.overlay?.alloc, false);
    addDds(node.overlay?.unalloc, false);
    addDds(node.overlay?.path, false);
  }

  addPngAssetFilenames(metadata.assets, pngByKey);

  const ddsByFile = new Map<string, PassiveTreeDdsResourceRequest[]>();
  for (const request of ddsToLoad.values()) {
    const entries = ddsByFile.get(request.file) ?? [];
    entries.push(request);
    ddsByFile.set(request.file, entries);
  }
  for (const entries of ddsByFile.values()) {
    entries.sort((a, b) => a.layer - b.layer || a.key.localeCompare(b.key));
  }

  const cacheKey = {
    vaultPath: normalizePassiveTreeVaultPath(vaultPath),
    treeVersion,
    assetFingerprint: assetFingerprint(ddsByFile, pngByKey),
  };

  return {
    cacheKey,
    ddsByFile,
    pngByKey,
    resourceCount: ddsToLoad.size + pngByKey.size,
  };
};

const assetUrl = (key: PassiveTreeResourceCacheKey, filename: string): string =>
  `pob-asset://asset/?path=${encodeURIComponent(
    `${key.vaultPath}/TreeData/${key.treeVersion}/${filename}`,
  )}`;

const ddsFileCache = new Map<string, Promise<Map<number, HTMLCanvasElement>>>();
const pngImageCache = new Map<string, Promise<HTMLImageElement>>();

const ddsFileCacheKey = (
  key: PassiveTreeResourceCacheKey,
  file: string,
  layers: number[],
): string =>
  `${key.vaultPath}|${key.treeVersion}|${file}|${[...layers]
    .sort((a, b) => a - b)
    .join(",")}`;

const pngCacheKey = (
  key: PassiveTreeResourceCacheKey,
  filename: string,
): string => `${key.vaultPath}|${key.treeVersion}|${filename}`;

const loadDdsLayers = (
  cacheKey: PassiveTreeResourceCacheKey,
  file: string,
  layers: number[],
  fetchImpl: typeof fetch,
  decodeDdsLayers: typeof decodeDdsZstLayers,
): { promise: Promise<Map<number, HTMLCanvasElement>>; cacheHit: boolean } => {
  const key = ddsFileCacheKey(cacheKey, file, layers);
  const cached = ddsFileCache.get(key);
  if (cached) return { promise: cached, cacheHit: true };

  const promise = fetchImpl(assetUrl(cacheKey, file))
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => decodeDdsLayers(buffer, layers));
  ddsFileCache.set(key, promise);
  return { promise, cacheHit: false };
};

const loadPngImage = (
  cacheKey: PassiveTreeResourceCacheKey,
  filename: string,
  imageFactory: () => HTMLImageElement,
): { promise: Promise<HTMLImageElement>; cacheHit: boolean } => {
  const key = pngCacheKey(cacheKey, filename);
  const cached = pngImageCache.get(key);
  if (cached) return { promise: cached, cacheHit: true };

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = imageFactory();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`Failed to load passive tree image: ${filename}`));
    image.src = assetUrl(cacheKey, filename);
  });
  pngImageCache.set(key, promise);
  return { promise, cacheHit: false };
};

export const loadPassiveTreeResources = async (
  input: PassiveTreeResourceLoadInput,
  options: PassiveTreeResourceLoadOptions,
): Promise<PassiveTreeResourceLoadResult | null> => {
  const reportMeasure = options.reportMeasure ?? defaultPassiveTreePerfReporter;
  const manifestStart = now();
  const manifest = buildPassiveTreeResourceManifest(input);
  reportMeasure({
    scenario: options.scenario,
    stage: "resource-manifest",
    durationMs: now() - manifestStart,
    treeVersion: input.snapshot.treeVersion,
    nodeCount: input.snapshot.nodes.length,
    buildKey: options.buildKey,
  });
  if (!manifest) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const imageFactory = options.imageFactory ?? (() => new Image());
  const decodeDdsLayers = options.decodeDdsLayers ?? decodeDdsZstLayers;
  const images: Record<string, TreeImage> = {};
  let cacheHits = 0;
  const startedAt = now();

  const setImage = (key: string, image: TreeImage) => {
    images[key] = image;
    options.onImage?.(key, image);
  };

  const ddsTasks = [...manifest.ddsByFile.entries()].map(
    async ([file, entries]) => {
      const layers = [...new Set(entries.map((entry) => entry.layer))];
      const loaded = loadDdsLayers(
        manifest.cacheKey,
        file,
        layers,
        fetchImpl,
        decodeDdsLayers,
      );
      if (loaded.cacheHit) cacheHits += 1;
      const decoded = await loaded.promise;
      for (const entry of entries) {
        const canvas = decoded.get(entry.layer);
        if (canvas) setImage(entry.key, canvas);
      }
    },
  );

  const pngTasks = [...manifest.pngByKey.entries()].map(
    async ([key, filename]) => {
      const loaded = loadPngImage(manifest.cacheKey, filename, imageFactory);
      if (loaded.cacheHit) cacheHits += 1;
      setImage(key, await loaded.promise);
    },
  );

  await Promise.all([...ddsTasks, ...pngTasks]);
  reportMeasure({
    scenario: options.scenario,
    stage: "resource-load",
    durationMs: now() - startedAt,
    resourceCount: manifest.resourceCount,
    cacheHits,
    treeVersion: input.snapshot.treeVersion,
    nodeCount: input.snapshot.nodes.length,
    buildKey: options.buildKey,
  });

  return { manifest, images, cacheHits };
};

type TreeSession = Pick<PobSessionAPI, "treeSnapshot" | "treeMetadata">;

export const prewarmPassiveTreeResources = async (
  session: TreeSession,
  reportMeasure: PassiveTreePerfReporter = defaultPassiveTreePerfReporter,
): Promise<PassiveTreeResourceLoadResult | null> => {
  const [treeResult, metadataResult]: [PobTreeResult, PobTreeMetadataResult] =
    await Promise.all([
      timePassiveTreeStage(
        "prewarm",
        "snapshot",
        () => session.treeSnapshot(),
        reportMeasure,
      ),
      timePassiveTreeStage(
        "prewarm",
        "metadata",
        () => session.treeMetadata(),
        reportMeasure,
      ),
    ]);
  if (treeResult.status !== "ok" || metadataResult.status !== "ok") {
    return null;
  }

  return loadPassiveTreeResources(
    {
      snapshot: treeResult.snapshot,
      metadata: asTreeMetadata(metadataResult.metadata),
      vaultPath: metadataResult.vaultPath,
    },
    { scenario: "prewarm", reportMeasure },
  );
};

export const clearPassiveTreeResourceCachesForTests = (): void => {
  ddsFileCache.clear();
  pngImageCache.clear();
};
