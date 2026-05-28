import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import {
  buildDdsAssetLookup,
  ddsImageKey,
  extractDdsCoords,
  getNodeEffectDrawSize,
  getNodeFrameAssetName,
  getNodeFrameDrawSize,
  getNodeHitRadius,
  getNodeIconDrawSize,
  isDdsFile,
  pngImageKey,
  resolveDdsAssetRef,
} from "./passiveTreeAssets";
import { translateTreeSnapshot } from "./repoeTranslations";
import { decodeDdsZstLayers } from "../utils/DdsDecoder";

import type {
  PobRepoeTranslationsSnapshot,
  PobTreeNode,
  PobTreeSnapshot,
} from "../../shared/types";

interface PassiveTreeViewProps {
  active: boolean;
  translations: PobRepoeTranslationsSnapshot;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      snapshot: PobTreeSnapshot;
      metadata: PassiveTreeMetadata;
      vaultPath: string;
    }
  | { status: "error"; reason: string };

interface PassiveTreeMetadata {
  assets?: Record<string, unknown>;
  connectors?: unknown[] | Record<string, unknown>;
  ddsCoords?: unknown;
  skillSprites?: unknown;
  classBackground?: TreeArtPlacement | null;
  ascendancyBackgrounds?: TreeArtPlacement[];
  groupBackgrounds?: TreeArtPlacement[];
}

interface TreeConnector {
  type?: string | null;
  nodeId1: number;
  nodeId2: number;
  vert?: Record<string, unknown>;
}

interface TreeArtPlacement {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asTreeMetadata = (value: unknown): PassiveTreeMetadata =>
  isRecord(value) ? (value as PassiveTreeMetadata) : {};

const toTreeConnector = (value: unknown): TreeConnector | null => {
  if (!isRecord(value)) return null;
  if (typeof value.nodeId1 !== "number" || typeof value.nodeId2 !== "number") {
    return null;
  }
  return {
    type: typeof value.type === "string" ? value.type : null,
    nodeId1: value.nodeId1,
    nodeId2: value.nodeId2,
    vert: isRecord(value.vert) ? value.vert : undefined,
  };
};

const readConnectorVert = (
  vert: unknown,
  index: number,
): number | undefined => {
  if (Array.isArray(vert)) {
    const value = vert[index];
    return typeof value === "number" ? value : undefined;
  }
  if (isRecord(vert)) {
    const value = vert[String(index + 1)];
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
};

const ZOOM_LEVEL_MIN = 0;
const ZOOM_LEVEL_MAX = 20;
const ZOOM_LEVEL_INIT = 10;
const ZOOM_BASE = 1.2;
const DRAG_THRESHOLD_PX = 5;

const zoomFromLevel = (level: number): number => Math.pow(ZOOM_BASE, level);

const nodeColor = (node: PobTreeNode): string => {
  if (node.alloc) return "#ffd166";
  if (node.isKeystone) return "#ef476f";
  if (node.isNotable) return "#06d6a0";
  if (node.isSocket) return "#118ab2";
  if (node.isMastery) return "#9d4edd";
  return "#5b6b78";
};

type TreeImage = HTMLImageElement | HTMLCanvasElement;

interface ProjectedNode extends PobTreeNode {
  screenX: number;
  screenY: number;
  radius: number;
}

interface ProjectedEdge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  active: boolean;
  node1Id: number;
  node2Id: number;
}

interface Projection {
  scale: number;
  offsetX: number;
  offsetY: number;
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
}

const projectScene = (
  snapshot: PobTreeSnapshot,
  width: number,
  height: number,
  zoom: number,
  panX: number,
  panY: number,
): Projection | null => {
  if (snapshot.nodes.length === 0) return null;

  const reducedViewport = snapshot.nodes.reduce(
    (acc, n) => ({
      minX: Math.min(acc.minX, n.x),
      minY: Math.min(acc.minY, n.y),
      maxX: Math.max(acc.maxX, n.x),
      maxY: Math.max(acc.maxY, n.y),
    }),
    {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    },
  );

  const vp = snapshot.viewport;
  const hasViewport =
    vp != null &&
    Number.isFinite(vp.minX) &&
    Number.isFinite(vp.minY) &&
    Number.isFinite(vp.maxX) &&
    Number.isFinite(vp.maxY);
  const viewport = hasViewport ? vp : reducedViewport;

  const referenceSize =
    typeof snapshot.treeSize === "number" && snapshot.treeSize > 0
      ? snapshot.treeSize
      : Math.max(
          1,
          reducedViewport.maxX - reducedViewport.minX,
          reducedViewport.maxY - reducedViewport.minY,
        );

  const scale = (Math.min(width, height) / referenceSize) * zoom;
  const centerX = (viewport.minX + viewport.maxX) / 2;
  const centerY = (viewport.minY + viewport.maxY) / 2;
  const offsetX = width / 2 - centerX * scale + panX;
  const offsetY = height / 2 - centerY * scale + panY;

  const nodes: ProjectedNode[] = snapshot.nodes.map((n) => ({
    ...n,
    screenX: n.x * scale + offsetX,
    screenY: n.y * scale + offsetY,
    radius: Math.max(2, getNodeHitRadius(n) * scale),
  }));

  const nodeById = new Map<number, ProjectedNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  const edges: ProjectedEdge[] = [];
  for (const node of nodes) {
    for (const otherId of node.linked) {
      if (otherId <= node.id) continue;
      const other = nodeById.get(otherId);
      if (!other) continue;

      // Match PoB's connection filtering logic (PassiveTree.lua BuildConnector)
      if (node.type === "ClassStart" || other.type === "ClassStart") continue;
      if (node.ascendancyName !== other.ascendancyName) continue;

      edges.push({
        ax: node.screenX,
        ay: node.screenY,
        bx: other.screenX,
        by: other.screenY,
        active: node.alloc && other.alloc,
        node1Id: node.id,
        node2Id: other.id,
      });
    }
  }

  return { scale, offsetX, offsetY, nodes, edges };
};

export const PassiveTreeView: React.FC<PassiveTreeViewProps> = ({
  active,
  translations,
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [images, setImages] = useState<Record<string, TreeImage>>({});
  const [view, setView] = useState({
    zoomLevel: ZOOM_LEVEL_INIT,
    pan: { x: 0, y: 0 },
  });
  const [hoveredNode, setHoveredNode] = useState<{
    id: number;
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [busy, setBusy] = useState(false);
  const projectionRef = useRef<Projection | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    dragging: boolean;
    pointerId: number;
  } | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const fetchSnapshot = async () => {
      const api = window.pobAPI;
      if (!api) {
        if (!cancelled) {
          setState({ status: "error", reason: "pobAPI unavailable" });
        }
        return;
      }
      const [result, metaResult] = await Promise.all([
        api.session.treeSnapshot(),
        api.session.treeMetadata(),
      ]);
      if (cancelled) return;
      if (result.status === "error") {
        setState({ status: "error", reason: result.reason });
        return;
      }
      if (metaResult.status === "error") {
        setState({ status: "error", reason: metaResult.reason });
        return;
      }
      setState({
        status: "ready",
        snapshot: result.snapshot,
        metadata: asTreeMetadata(metaResult.metadata),
        vaultPath: metaResult.vaultPath,
      });
    };

    void fetchSnapshot();
    return () => {
      cancelled = true;
    };
  }, [active]);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(240, Math.round(rect.height)),
      });
    }
  }, [state.status]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      setSize({
        width: Math.max(320, Math.round(width)),
        height: Math.max(240, Math.round(height)),
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [state.status]);

  const projection = useMemo(() => {
    if (state.status !== "ready") return null;
    const snapshot = translateTreeSnapshot(state.snapshot, translations);
    return projectScene(
      snapshot,
      size.width,
      size.height,
      zoomFromLevel(view.zoomLevel),
      view.pan.x,
      view.pan.y,
    );
  }, [
    state,
    translations,
    size.width,
    size.height,
    view.zoomLevel,
    view.pan.x,
    view.pan.y,
  ]);

  useEffect(() => {
    if (state.status !== "ready" || !state.metadata) return;

    let cancelled = false;
    const ddsLookup = buildDdsAssetLookup(extractDdsCoords(state.metadata));
    const ddsToLoad = new Map<string, { file: string; layer: number }>();
    const pngToLoad = new Map<string, string>();

    const addDds = (
      assetName: string | null | undefined,
      disabled: boolean,
    ) => {
      const ref = resolveDdsAssetRef(ddsLookup, assetName, disabled);
      if (ref) {
        ddsToLoad.set(ddsImageKey(ref), { file: ref.file, layer: ref.layer });
      }
    };

    addDds("Background2", false);
    addDds(state.metadata.classBackground?.image, false);
    addDds("BGTreeActive", false);
    addDds("BGTree", false);
    addDds("AscendancyMiddle", false);
    for (const art of state.metadata.ascendancyBackgrounds ?? []) {
      addDds(art.image, false);
    }
    for (const art of state.metadata.groupBackgrounds ?? []) {
      addDds(art.image, false);
    }

    for (const node of state.snapshot.nodes) {
      addDds(node.icon, !node.alloc);
      addDds(node.icon, node.alloc);
      addDds(node.activeEffectImage, false);
      addDds(getNodeFrameAssetName(node), false);
      addDds(node.overlay?.alloc, false);
      addDds(node.overlay?.unalloc, false);
      addDds(node.overlay?.path, false);
    }

    if (state.metadata.assets) {
      for (const filename of Object.values(state.metadata.assets)) {
        if (typeof filename === "string") {
          if (!isDdsFile(filename))
            pngToLoad.set(pngImageKey(filename), filename);
        } else if (Array.isArray(filename) && typeof filename[0] === "string") {
          if (!isDdsFile(filename[0])) {
            pngToLoad.set(pngImageKey(filename[0]), filename[0]);
          }
        } else if (typeof filename === "object" && filename !== null) {
          const val =
            (filename as Record<string, unknown>)["1"] ||
            Object.values(filename).find((v) => typeof v === "string");
          if (typeof val === "string" && !isDdsFile(val)) {
            pngToLoad.set(pngImageKey(val), val);
          }
        }
      }
    }

    const treeVersion = state.snapshot.treeVersion;
    if (!treeVersion) return;

    const vaultPath = state.vaultPath.replace(/\\/g, "/");
    const assetUrl = (filename: string) =>
      `pob-asset://asset/?path=${encodeURIComponent(
        `${vaultPath}/TreeData/${treeVersion}/${filename}`,
      )}`;

    const ddsByFile = new Map<string, Array<{ key: string; layer: number }>>();
    ddsToLoad.forEach(({ file, layer }, key) => {
      const entries = ddsByFile.get(file) ?? [];
      entries.push({ key, layer });
      ddsByFile.set(file, entries);
    });

    ddsByFile.forEach((entries, file) => {
      fetch(assetUrl(file))
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buffer) =>
          decodeDdsZstLayers(
            buffer,
            entries.map((entry) => entry.layer),
          ),
        )
        .then((layers) => {
          if (cancelled) return;
          setImages((prev) => {
            const next = { ...prev };
            for (const entry of entries) {
              const canvas = layers.get(entry.layer);
              if (canvas) next[entry.key] = canvas;
            }
            return next;
          });
        })
        .catch((e) => {
          console.error("Failed to decode DDS:", file, e);
        });
    });

    pngToLoad.forEach((filename, key) => {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setImages((prev) => ({ ...prev, [key]: img }));
      };
      img.src = assetUrl(filename);
    });

    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    projectionRef.current = projection;
    const canvas = canvasRef.current;
    if (!canvas || !projection || state.status !== "ready") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = size.width;
    canvas.height = size.height;
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = "#0e1116";
    ctx.fillRect(0, 0, size.width, size.height);

    const ddsLookup = buildDdsAssetLookup(extractDdsCoords(state.metadata));
    const getDdsImage = (
      assetName: string | null | undefined,
      disabled = false,
    ): TreeImage | null => {
      const ref = resolveDdsAssetRef(ddsLookup, assetName, disabled);
      return ref ? (images[ddsImageKey(ref)] ?? null) : null;
    };

    const backgroundImg = getDdsImage("Background2");
    if (backgroundImg) {
      const pattern = ctx.createPattern(backgroundImg, "repeat");
      if (pattern) {
        if (typeof DOMMatrix !== "undefined") {
          pattern.setTransform(
            new DOMMatrix().scale(
              100 / backgroundImg.width,
              100 / backgroundImg.height,
            ),
          );
        }
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, size.width, size.height);
      }
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(140, 152, 168, 0.35)";

    const connectorMap = new Map<string, TreeConnector>();
    if (state.metadata?.connectors) {
      const connectors = Array.isArray(state.metadata.connectors)
        ? state.metadata.connectors
        : Object.values(state.metadata.connectors);
      for (const rawConnector of connectors) {
        const conn = toTreeConnector(rawConnector);
        if (!conn) continue;
        const [n1, n2] = [conn.nodeId1, conn.nodeId2].sort((a, b) => a - b);
        connectorMap.set(`${n1}_${n2}`, conn);
      }
    }

    const drawConnector = (edge: ProjectedEdge, active: boolean) => {
      ctx.lineWidth = active ? 3 : 2;
      ctx.strokeStyle = active ? "#ffd166" : "rgba(140, 152, 168, 0.35)";

      const nodeIds = [edge.node1Id, edge.node2Id].sort((a, b) => a - b);
      const matchedConnector = connectorMap.get(`${nodeIds[0]}_${nodeIds[1]}`);

      ctx.beginPath();
      ctx.moveTo(edge.ax, edge.ay);

      if (
        matchedConnector &&
        String(matchedConnector.type).startsWith("Orbit")
      ) {
        const stateKey = active ? "Active" : "Normal";
        const vert = matchedConnector.vert?.[stateKey];
        if (vert) {
          const cx = readConnectorVert(vert, 0);
          const cy = readConnectorVert(vert, 1);

          if (cx !== undefined && cy !== undefined) {
            const projCx = cx * projection.scale + projection.offsetX;
            const projCy = cy * projection.scale + projection.offsetY;

            const radius = Math.hypot(edge.ax - projCx, edge.ay - projCy);
            const startAngle = Math.atan2(edge.ay - projCy, edge.ax - projCx);
            const endAngle = Math.atan2(edge.by - projCy, edge.bx - projCx);

            let diff = endAngle - startAngle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;

            ctx.arc(
              projCx,
              projCy,
              radius,
              startAngle,
              startAngle + diff,
              diff < 0,
            );
          } else {
            ctx.lineTo(edge.bx, edge.by);
          }
        } else {
          ctx.lineTo(edge.bx, edge.by);
        }
      } else {
        ctx.lineTo(edge.bx, edge.by);
      }
      ctx.stroke();
    };

    const imageSize = (img: TreeImage): { width: number; height: number } => ({
      width:
        "naturalWidth" in img && img.naturalWidth > 0
          ? img.naturalWidth
          : img.width,
      height:
        "naturalHeight" in img && img.naturalHeight > 0
          ? img.naturalHeight
          : img.height,
    });
    const drawTreeArt = (
      assetName: string | null | undefined,
      x: number | null | undefined,
      y: number | null | undefined,
      sizeHint?: {
        width?: number | null;
        height?: number | null;
        isHalfImage?: boolean | null;
      } | null,
      opacity = 1,
    ) => {
      if (typeof x !== "number" || typeof y !== "number") return;
      const img = getDdsImage(assetName);
      if (!img) return;
      const natural = imageSize(img);
      const halfWidth =
        typeof sizeHint?.width === "number" ? sizeHint.width : natural.width;
      const halfHeight =
        typeof sizeHint?.height === "number" ? sizeHint.height : natural.height;
      if (halfWidth <= 0 || halfHeight <= 0) return;

      const screenX = x * projection.scale + projection.offsetX;
      const screenY = y * projection.scale + projection.offsetY;
      const dw = halfWidth * projection.scale * 2;
      const dh = halfHeight * projection.scale * 2;
      ctx.globalAlpha = opacity;
      if (sizeHint && "isHalfImage" in sizeHint && sizeHint.isHalfImage) {
        ctx.drawImage(img, screenX - dw / 2, screenY - dh, dw, dh);
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.scale(1, -1);
        ctx.drawImage(img, -dw / 2, -dh, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(img, screenX - dw / 2, screenY - dh / 2, dw, dh);
      }
      ctx.globalAlpha = 1;
    };

    const classBackground = state.metadata.classBackground;
    if (classBackground) {
      drawTreeArt(
        classBackground.image,
        classBackground.x,
        classBackground.y,
        classBackground,
      );
      // BGTreeActive (the "light" from the class start) is rotated to point at
      // the start node. PoB: PassiveTreeView.lua:589-596 (DrawQuadAndRotate).
      const bgX = classBackground.x;
      const bgY = classBackground.y;
      const startX = classBackground.startNodeX;
      const startY = classBackground.startNodeY;
      const activeImg = getDdsImage("BGTreeActive");
      if (
        activeImg &&
        typeof bgX === "number" &&
        typeof bgY === "number" &&
        typeof startX === "number" &&
        typeof startY === "number"
      ) {
        const halfW = classBackground.active?.width ?? activeImg.width;
        const halfH = classBackground.active?.height ?? activeImg.height;
        if (halfW > 0 && halfH > 0) {
          const angle = Math.PI / 2 + Math.atan2(startY - bgY, startX - bgX);
          const screenX = bgX * projection.scale + projection.offsetX;
          const screenY = bgY * projection.scale + projection.offsetY;
          const dw = halfW * projection.scale * 2;
          const dh = halfH * projection.scale * 2;
          ctx.save();
          ctx.translate(screenX, screenY);
          ctx.rotate(angle);
          ctx.drawImage(activeImg, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
        }
      }
      drawTreeArt(
        "BGTree",
        classBackground.x,
        classBackground.y,
        classBackground.bg,
      );
    }
    for (const art of state.metadata.ascendancyBackgrounds ?? []) {
      drawTreeArt(art.image, art.x, art.y, art, art.selected ? 1 : 0.5);
    }
    for (const art of state.metadata.groupBackgrounds ?? []) {
      drawTreeArt(art.image, art.x, art.y, art);
    }

    // Draw inactive edges first
    for (const edge of projection.edges) {
      if (!edge.active) drawConnector(edge, false);
    }
    // Draw active edges on top
    for (const edge of projection.edges) {
      if (edge.active) drawConnector(edge, true);
    }

    const drawCenteredImage = (
      img: TreeImage,
      node: ProjectedNode,
      drawSize: { width: number; height: number },
      opacity = 1,
    ) => {
      const dw = Math.max(1, drawSize.width * projection.scale * 2);
      const dh = Math.max(1, drawSize.height * projection.scale * 2);
      ctx.globalAlpha = opacity;
      ctx.drawImage(img, node.screenX - dw / 2, node.screenY - dh / 2, dw, dh);
      ctx.globalAlpha = 1;
    };

    const sortedNodes = [...projection.nodes].sort((a, b) => {
      const rank = (n: ProjectedNode) => {
        if (n.isKeystone) return 4;
        if (n.isNotable) return 3;
        if (n.isSocket) return 2;
        if (n.isOnlyImage) return 0;
        return 1;
      };
      return rank(a) - rank(b);
    });

    for (const node of sortedNodes) {
      // PoB: PassiveTreeView.lua:863-869. ClassStart draws nothing (the class
      // background covers it). AscendClassStart draws only the "AscendancyMiddle"
      // diamond overlay.
      if (node.type === "ClassStart") continue;
      if (node.type === "AscendClassStart") {
        const ascendImg = getDdsImage("AscendancyMiddle");
        if (ascendImg) {
          drawCenteredImage(ascendImg, node, getNodeFrameDrawSize(node));
        }
        continue;
      }

      const onlyImage = node.isOnlyImage || node.type === "OnlyImage";
      const iconImg = onlyImage ? null : getDdsImage(node.icon, !node.alloc);
      const effectImg = getDdsImage(node.activeEffectImage);
      const frameAssetName = getNodeFrameAssetName(node);
      const frameImg = getDdsImage(frameAssetName);

      if (effectImg) {
        drawCenteredImage(
          effectImg,
          node,
          onlyImage ? getNodeIconDrawSize(node) : getNodeEffectDrawSize(node),
          onlyImage ? 0.15 : node.alloc ? 1 : 0.15,
        );
      } else if (!onlyImage && !iconImg && !frameImg) {
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor(node);
        ctx.fill();
      }

      if (iconImg) {
        drawCenteredImage(iconImg, node, getNodeIconDrawSize(node));
      }

      if (frameImg) {
        drawCenteredImage(frameImg, node, getNodeFrameDrawSize(node));
      } else if (node.alloc) {
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, node.radius, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#fff7ae";
        ctx.stroke();
      }
    }
  }, [projection, size.width, size.height, state, images]);

  const hitTest = useCallback(
    (mouseX: number, mouseY: number): ProjectedNode | null => {
      const proj = projectionRef.current;
      if (!proj) return null;
      let best: { node: ProjectedNode; distSq: number } | null = null;
      for (const node of proj.nodes) {
        const dx = node.screenX - mouseX;
        const dy = node.screenY - mouseY;
        const distSq = dx * dx + dy * dy;
        const hitRadius = Math.max(node.radius, 8);
        if (distSq <= hitRadius * hitRadius) {
          if (!best || distSq < best.distSq) {
            best = { node, distSq };
          }
        }
      }
      return best?.node ?? null;
    },
    [],
  );

  const allocateNode = useCallback(
    async (node: ProjectedNode) => {
      const api = window.pobAPI;
      if (!api || busy) return;
      setBusy(true);
      try {
        const result = node.alloc
          ? await api.session.treeDeallocate(node.id)
          : await api.session.treeAllocate(node.id);
        if (result.status === "ok") {
          setState((prev) =>
            prev.status === "ready"
              ? { ...prev, snapshot: result.snapshot }
              : prev,
          );
        } else {
          setState({ status: "error", reason: result.reason });
        }
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(event.pointerId);
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        panX: view.pan.x,
        panY: view.pan.y,
        dragging: false,
        pointerId: event.pointerId,
      };
    },
    [view.pan.x, view.pan.y],
  );

  const clampPan = useCallback(
    (next: { x: number; y: number }, level: number) => {
      if (state.status !== "ready") return next;
      const snapshot = state.snapshot;
      const vp = snapshot.viewport;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      if (
        vp != null &&
        Number.isFinite(vp.minX) &&
        Number.isFinite(vp.minY) &&
        Number.isFinite(vp.maxX) &&
        Number.isFinite(vp.maxY)
      ) {
        minX = vp.minX;
        minY = vp.minY;
        maxX = vp.maxX;
        maxY = vp.maxY;
      } else {
        for (const n of snapshot.nodes) {
          if (n.x < minX) minX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.x > maxX) maxX = n.x;
          if (n.y > maxY) maxY = n.y;
        }
      }

      const referenceSize =
        typeof snapshot.treeSize === "number" && snapshot.treeSize > 0
          ? snapshot.treeSize
          : Math.max(1, maxX - minX, maxY - minY);

      const zoom = zoomFromLevel(level);
      const scale = (Math.min(size.width, size.height) / referenceSize) * zoom;

      const treeScreenW = (maxX - minX) * scale;
      const treeScreenH = (maxY - minY) * scale;
      const padding = 100; // Allow 100px padding beyond tree bounds

      // Prevent panning past the tree bounds.
      // If tree is smaller than screen, it limits panning to just the padding, effectively centering it.
      const boundX = Math.max(0, (treeScreenW - size.width) / 2) + padding;
      const boundY = Math.max(0, (treeScreenH - size.height) / 2) + padding;

      return {
        x: Math.max(-boundX, Math.min(boundX, next.x)),
        y: Math.max(-boundY, Math.min(boundY, next.y)),
      };
    },
    [state, size.width, size.height],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const node = hitTest(
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
        setHoveredNode(
          node?.name
            ? { id: node.id, name: node.name, x: node.screenX, y: node.screenY }
            : null,
        );
      }

      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (
        !drag.dragging &&
        Math.abs(dx) <= DRAG_THRESHOLD_PX &&
        Math.abs(dy) <= DRAG_THRESHOLD_PX
      ) {
        return;
      }
      drag.dragging = true;
      setView((prev) => ({
        ...prev,
        pan: clampPan({ x: drag.panX + dx, y: drag.panY + dy }, prev.zoomLevel),
      }));
    },
    [clampPan, hitTest],
  );

  const handlePointerLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const canvas = canvasRef.current;
      canvas?.releasePointerCapture(event.pointerId);
      const wasClick = !drag.dragging;
      dragRef.current = null;
      if (!wasClick) return;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const node = hitTest(x, y);
      if (node) void allocateNode(node);
    },
    [allocateNode, hitTest],
  );

  const applyZoomAt = useCallback(
    (delta: number, focusClientX?: number, focusClientY?: number) => {
      setView((prev) => {
        const nextLevel = Math.max(
          ZOOM_LEVEL_MIN,
          Math.min(ZOOM_LEVEL_MAX, prev.zoomLevel + delta),
        );
        if (nextLevel === prev.zoomLevel) return prev;

        const canvas = canvasRef.current;
        if (
          !canvas ||
          focusClientX === undefined ||
          focusClientY === undefined
        ) {
          return { ...prev, zoomLevel: nextLevel };
        }

        const rect = canvas.getBoundingClientRect();
        const cx = focusClientX - rect.left - size.width / 2;
        const cy = focusClientY - rect.top - size.height / 2;
        const factor = zoomFromLevel(nextLevel) / zoomFromLevel(prev.zoomLevel);

        const nextPan = clampPan(
          {
            x: cx + (prev.pan.x - cx) * factor,
            y: cy + (prev.pan.y - cy) * factor,
          },
          nextLevel,
        );

        return { zoomLevel: nextLevel, pan: nextPan };
      });
    },
    [clampPan, size.width, size.height],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const step = event.shiftKey ? 3 : 1;
      applyZoomAt(direction * step, event.clientX, event.clientY);
    },
    [applyZoomAt],
  );

  const resetView = useCallback(() => {
    setView({ zoomLevel: ZOOM_LEVEL_INIT, pan: { x: 0, y: 0 } });
  }, []);

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="pob-passive-tree-state" role="status">
        {t("buildEdit.tree.loading")}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="pob-error">
        {t("buildList.error.generic", { reason: state.reason })}
      </div>
    );
  }

  const snapshot = translateTreeSnapshot(state.snapshot, translations);
  const zoomPercent = Math.round(zoomFromLevel(view.zoomLevel) * 100);
  const tooltipStyle =
    hoveredNode === null
      ? undefined
      : {
          left: Math.max(8, Math.min(size.width - 220, hoveredNode.x + 12)),
          top: Math.max(8, Math.min(size.height - 48, hoveredNode.y + 12)),
        };
  return (
    <div className="pob-passive-tree-pane">
      <div className="pob-passive-tree-toolbar">
        <span className="pob-passive-tree-version">
          {t("buildEdit.tree.version", {
            version: snapshot.treeVersion ?? "-",
          })}
        </span>
        <span className="pob-passive-tree-alloc">
          {t("buildEdit.tree.allocCount", { count: snapshot.allocCount })}
        </span>
        <span className="pob-passive-tree-spacer" />
        <label className="pob-passive-tree-selector">
          {t("buildEdit.tree.selector")}
          <select disabled defaultValue="primary">
            <option value="primary">{snapshot.className ?? "-"}</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => applyZoomAt(-1)}
          aria-label={t("buildEdit.tree.zoomOut")}
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          aria-label={t("buildEdit.tree.zoomReset")}
        >
          {zoomPercent}%
        </button>
        <button
          type="button"
          onClick={() => applyZoomAt(1)}
          aria-label={t("buildEdit.tree.zoomIn")}
        >
          +
        </button>
        <button
          type="button"
          disabled
          title={t("buildEdit.tree.findTimelessJewelDisabled")}
        >
          {t("buildEdit.tree.findTimelessJewel")}
        </button>
      </div>
      <div className="pob-passive-tree-canvas-wrap" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="pob-passive-tree-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          aria-busy={busy}
        />
        {hoveredNode && (
          <div className="pob-passive-tree-tooltip" style={tooltipStyle}>
            {hoveredNode.name}
          </div>
        )}
      </div>
      <div className="pob-passive-tree-legend" aria-hidden="true">
        <span className="pob-passive-tree-legend-item pob-passive-tree-legend--allocated">
          {t("buildEdit.tree.legend.allocated")}
        </span>
        <span className="pob-passive-tree-legend-item pob-passive-tree-legend--keystone">
          {t("buildEdit.tree.legend.keystone")}
        </span>
        <span className="pob-passive-tree-legend-item pob-passive-tree-legend--notable">
          {t("buildEdit.tree.legend.notable")}
        </span>
        <span className="pob-passive-tree-legend-item pob-passive-tree-legend--socket">
          {t("buildEdit.tree.legend.socket")}
        </span>
      </div>
    </div>
  );
};
