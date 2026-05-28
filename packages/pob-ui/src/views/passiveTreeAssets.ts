import type { PobTreeNode } from "@poe2-launcher/shared/types";

export interface DdsAssetRef {
  assetName: string;
  file: string;
  layer: number;
}

export interface DdsAssetLookup {
  byAssetName: Map<string, DdsAssetRef[]>;
}

export interface DrawSize {
  width: number;
  height: number;
}

type DdsCoords = Record<string, Record<string, unknown>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const isDdsFile = (filename: string): boolean =>
  filename.endsWith(".dds") || filename.endsWith(".dds.zst");

export const ddsImageKey = (ref: DdsAssetRef): string =>
  `dds:${ref.file}:${ref.layer}`;

export const pngImageKey = (filename: string): string => `png:${filename}`;

export const extractDdsCoords = (metadata: unknown): DdsCoords => {
  if (!isRecord(metadata)) return {};
  const ddsCoords = metadata.ddsCoords;
  if (isRecord(ddsCoords)) return ddsCoords as DdsCoords;

  // Compatibility with the first PR-6.1 attempt, which exposed ddsCoords under
  // skillSprites for PoE2 trees.
  const skillSprites = metadata.skillSprites;
  if (isRecord(skillSprites)) return skillSprites as DdsCoords;
  return {};
};

export const buildDdsAssetLookup = (ddsCoords: DdsCoords): DdsAssetLookup => {
  const byAssetName = new Map<string, DdsAssetRef[]>();
  for (const [file, fileInfo] of Object.entries(ddsCoords)) {
    if (!isDdsFile(file) || !isRecord(fileInfo)) continue;
    for (const [assetName, rawLayer] of Object.entries(fileInfo)) {
      if (
        typeof rawLayer !== "number" ||
        !Number.isInteger(rawLayer) ||
        rawLayer < 1
      ) {
        continue;
      }
      const refs = byAssetName.get(assetName) ?? [];
      refs.push({ assetName, file, layer: rawLayer });
      byAssetName.set(assetName, refs);
    }
  }
  return { byAssetName };
};

export const resolveDdsAssetRef = (
  lookup: DdsAssetLookup,
  assetName: string | null | undefined,
  preferDisabled = false,
): DdsAssetRef | null => {
  if (!assetName) return null;
  const refs = lookup.byAssetName.get(assetName);
  if (!refs || refs.length === 0) return null;

  const preferred = refs.find((ref) =>
    preferDisabled
      ? ref.file.includes("disabled")
      : !ref.file.includes("disabled"),
  );
  return preferred ?? refs[0];
};

export const getNodeFrameAssetName = (node: PobTreeNode): string | null => {
  if (node.isOnlyImage || node.type === "OnlyImage") return null;

  const overlay = node.overlay;
  if (overlay) {
    if (node.alloc && overlay.alloc) return overlay.alloc;
    if (!node.alloc && overlay.unalloc) return overlay.unalloc;
    if (overlay.path) return overlay.path;
  }

  const state = node.alloc ? "Allocated" : "Unallocated";
  if (node.isKeystone) return `KeystoneFrame${state}`;
  if (node.isSocket || node.type === "Socket") return `JewelFrame${state}`;
  if (node.isNotable) return `NotableFrame${state}`;
  if (node.type === "Normal")
    return node.alloc ? "PSSkillFrameActive" : "PSSkillFrame";
  return null;
};

const fallbackIconSize = (node: PobTreeNode): DrawSize => {
  if (node.isOnlyImage || node.type === "OnlyImage") {
    return { width: 380, height: 380 };
  }
  if (node.isKeystone) return { width: 82, height: 82 };
  if (node.isSocket || node.type === "Socket") {
    return { width: 76, height: 76 };
  }
  if (node.isNotable || node.ascendancyName) {
    return { width: 54, height: 54 };
  }
  return { width: 37, height: 37 };
};

const fallbackOverlaySize = (node: PobTreeNode): DrawSize => {
  if (node.isKeystone) return { width: 120, height: 120 };
  if (node.isSocket || node.type === "Socket") {
    return { width: 76, height: 76 };
  }
  if (node.isNotable || node.ascendancyName) {
    return { width: 80, height: 80 };
  }
  return { width: 54, height: 54 };
};

export const getNodeIconDrawSize = (node: PobTreeNode): DrawSize => {
  const width = node.targetSize?.width;
  const height = node.targetSize?.height;
  if (isPositiveNumber(width) && isPositiveNumber(height)) {
    return { width, height };
  }
  return fallbackIconSize(node);
};

export const getNodeFrameDrawSize = (node: PobTreeNode): DrawSize => {
  const width = node.targetSize?.overlay?.width;
  const height = node.targetSize?.overlay?.height;
  if (isPositiveNumber(width) && isPositiveNumber(height)) {
    return { width, height };
  }
  return fallbackOverlaySize(node);
};

export const getNodeEffectDrawSize = (node: PobTreeNode): DrawSize => {
  const width = node.targetSize?.effect?.width;
  const height = node.targetSize?.effect?.height;
  if (isPositiveNumber(width) && isPositiveNumber(height)) {
    return { width, height };
  }
  return { width: 380, height: 380 };
};

export const getNodeHitRadius = (node: PobTreeNode): number => {
  const frame = getNodeFrameDrawSize(node);
  const icon = getNodeIconDrawSize(node);
  return Math.max(frame.width, frame.height, icon.width, icon.height);
};
