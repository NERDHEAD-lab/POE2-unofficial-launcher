import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import type {
  PobRepoeTranslationsSnapshot,
  PobTreeNode,
  PobTreeNodeTooltip,
  PobTreeSnapshot,
} from "@poe2-launcher/shared/types";

import {
  buildDdsAssetLookup,
  ddsImageKey,
  extractDdsCoords,
  getNodeEffectDrawSize,
  getNodeEffectOpacity,
  getNodeFrameAssetName,
  getNodeFrameDrawSize,
  getNodeHitRadius,
  getNodeIconDrawSize,
  getNodeIconOpacity,
  pngImageKey,
  resolveDdsAssetRef,
  resolveTreeAssetFilename,
} from "./passiveTreeAssets";
import {
  buildConnectorMap,
  connectorAssetName,
  connectorKey,
  connectorStrokeStyle,
  connectorStrokeWidth,
  connectorTextureQuad,
  projectConnectorQuad,
  shouldReinforceTexturedConnector,
  type ConnectorQuad,
  type ConnectorStrokeLayer,
  type TreeConnectorState,
} from "./passiveTreeConnectors";
import {
  buildTreePathPreview,
  getTreeConnectorVisualState,
  getTreeNodeVisualState,
  isTreeDependencyConnector,
} from "./passiveTreePreview";
import {
  asTreeMetadata,
  buildPassiveTreeResourceManifest,
  classifyPassiveTreeLoadScenario,
  createPassiveTreePerfDebugContext,
  defaultPassiveTreePerfReporter,
  loadPassiveTreeResources,
  passiveTreeResourceCacheKeyToString,
  timePassiveTreeStage,
  timePassiveTreeSyncStage,
  type PassiveTreeLoadContext,
  type PassiveTreeMetadata,
  type PassiveTreeLoadScenario,
  type TreeImage,
} from "./passiveTreeResourceCache";
import { buildTreeSearchMatchIds } from "./passiveTreeSearch";
import {
  estimatePassiveTreeTooltipHeight,
  resolvePassiveTreeTooltipPlacement,
} from "./passiveTreeTooltip";
import { PobTooltipAssetHeader } from "./PobTooltipAssetHeader";
import {
  buildPobTooltipHeaderAssetStyle,
  buildPobTooltipSharedAssetStyle,
  collectPobTooltipHeaderTitleEntries,
} from "./pobTooltipAssetParts";
import {
  shouldSkipHeaderSeparator,
  tooltipHeaderClasses,
  tooltipLineClasses,
} from "./pobTooltipMetadata";
import {
  translateTreeNodeTooltip,
  translateTreeSnapshot,
} from "./repoeTranslations";
import { PobUnimplementedButton } from "./UnimplementedButton";

interface PassiveTreeViewProps {
  active: boolean;
  preload?: boolean;
  sessionKey: string;
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
      scenario: PassiveTreeLoadScenario;
    }
  | { status: "error"; reason: string };

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

let lastPassiveTreeLoadContext: PassiveTreeLoadContext | null = null;

export const PassiveTreeView: React.FC<PassiveTreeViewProps> = ({
  active,
  preload = false,
  sessionKey,
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
  const [treeSearch, setTreeSearch] = useState("");
  const [unimplementedNotice, setUnimplementedNotice] = useState<string | null>(
    null,
  );
  const [hoveredNode, setHoveredNode] = useState<{
    id: number;
    name: string;
    statLines: string[];
    path?: number[];
    depends?: number[];
    x: number;
    y: number;
  } | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{
    nodeId: number;
    tooltip: PobTreeNodeTooltip | null;
  } | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [busy, setBusy] = useState(false);
  const projectionRef = useRef<Projection | null>(null);
  const resourceKeyRef = useRef<string | null>(null);
  const loadedSessionKeyRef = useRef<string | null>(null);
  const loadScenarioRef = useRef<PassiveTreeLoadScenario>("cold-start");
  const dragRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    dragging: boolean;
    pointerId: number;
  } | null>(null);

  useEffect(() => {
    if (!active && !preload) return;
    if (loadedSessionKeyRef.current === sessionKey) return;
    let cancelled = false;

    const fetchSnapshot = async () => {
      const api = window.pobAPI;
      if (!api) {
        if (!cancelled) {
          setState({ status: "error", reason: "pobAPI unavailable" });
        }
        return;
      }
      setState({ status: "loading" });
      const debugContext = createPassiveTreePerfDebugContext(
        loadScenarioRef.current,
        sessionKey,
      );
      const [result, metaResult] = await Promise.all([
        timePassiveTreeStage(
          loadScenarioRef.current,
          "snapshot",
          () => api.session.treeSnapshot(debugContext),
          defaultPassiveTreePerfReporter,
        ),
        timePassiveTreeStage(
          loadScenarioRef.current,
          "metadata",
          () => api.session.treeMetadata(debugContext),
          defaultPassiveTreePerfReporter,
        ),
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
      const metadata = asTreeMetadata(metaResult.metadata);
      const manifest = buildPassiveTreeResourceManifest({
        snapshot: result.snapshot,
        metadata,
        vaultPath: metaResult.vaultPath,
      });
      let scenario = loadScenarioRef.current;
      if (manifest) {
        const currentContext = {
          buildKey: sessionKey,
          resourceKey: manifest.cacheKey,
        };
        scenario = classifyPassiveTreeLoadScenario(
          lastPassiveTreeLoadContext,
          currentContext,
        );
        loadScenarioRef.current = scenario;
        lastPassiveTreeLoadContext = currentContext;
      }
      setState({
        status: "ready",
        snapshot: result.snapshot,
        metadata,
        vaultPath: metaResult.vaultPath,
        scenario,
      });
      loadedSessionKeyRef.current = sessionKey;
    };

    void fetchSnapshot();
    return () => {
      cancelled = true;
    };
  }, [active, preload, sessionKey]);

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

  const translatedSnapshot = useMemo(() => {
    if (state.status !== "ready") return null;
    return timePassiveTreeSyncStage(
      state.scenario,
      "translate-tree",
      () => translateTreeSnapshot(state.snapshot, translations),
      defaultPassiveTreePerfReporter,
      {
        nodeCount: state.snapshot.nodes.length,
        treeVersion: state.snapshot.treeVersion,
        buildKey: sessionKey,
      },
    );
  }, [state, translations, sessionKey]);

  const projection = useMemo(() => {
    if (!translatedSnapshot) return null;
    const scenario = state.status === "ready" ? state.scenario : "cold-start";
    return timePassiveTreeSyncStage(
      scenario,
      "project-scene",
      () =>
        projectScene(
          translatedSnapshot,
          size.width,
          size.height,
          zoomFromLevel(view.zoomLevel),
          view.pan.x,
          view.pan.y,
        ),
      defaultPassiveTreePerfReporter,
      {
        nodeCount: translatedSnapshot.nodes.length,
        treeVersion: translatedSnapshot.treeVersion,
        buildKey: sessionKey,
      },
    );
  }, [
    translatedSnapshot,
    size.width,
    size.height,
    view.zoomLevel,
    view.pan.x,
    view.pan.y,
    sessionKey,
    state,
  ]);

  const metadata = state.status === "ready" ? state.metadata : null;
  const ddsLookup = useMemo(
    () => (metadata ? buildDdsAssetLookup(extractDdsCoords(metadata)) : null),
    [metadata],
  );
  const connectorMap = useMemo(
    () => (metadata ? buildConnectorMap(metadata.connectors) : new Map()),
    [metadata],
  );

  useEffect(() => {
    if (state.status !== "ready") return;
    let cancelled = false;
    const loadInput = {
      snapshot: state.snapshot,
      metadata: state.metadata,
      vaultPath: state.vaultPath,
    };
    const manifest = buildPassiveTreeResourceManifest(loadInput);
    if (!manifest) return;

    const resourceKey = passiveTreeResourceCacheKeyToString(manifest.cacheKey);
    if (resourceKeyRef.current !== resourceKey) {
      resourceKeyRef.current = resourceKey;
      setImages({});
    }

    void loadPassiveTreeResources(loadInput, {
      scenario: state.scenario,
      buildKey: sessionKey,
      onImage: (key, image) => {
        if (cancelled) return;
        setImages((prev) =>
          prev[key] === image ? prev : { ...prev, [key]: image },
        );
      },
    }).catch((error: unknown) => {
      console.error("Failed to load passive tree resources:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [state, sessionKey]);

  useEffect(() => {
    projectionRef.current = projection;
    const canvas = canvasRef.current;
    if (!canvas || !projection || state.status !== "ready") return;
    const ctx = canvas.getContext("2d");
    if (!ctx || !ddsLookup) return;
    const drawStartedAt =
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    canvas.width = size.width;
    canvas.height = size.height;
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = "#0e1116";
    ctx.fillRect(0, 0, size.width, size.height);

    const getDdsImage = (
      assetName: string | null | undefined,
      disabled = false,
    ): TreeImage | null => {
      const ref = resolveDdsAssetRef(ddsLookup, assetName, disabled);
      return ref ? (images[ddsImageKey(ref)] ?? null) : null;
    };
    const getTreeImage = (
      assetName: string | null | undefined,
      disabled = false,
    ): TreeImage | null => {
      const dds = getDdsImage(assetName, disabled);
      if (dds) return dds;
      const filename = resolveTreeAssetFilename(
        state.metadata.assets,
        assetName,
      );
      return filename ? (images[pngImageKey(filename)] ?? null) : null;
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

    const nodeById = new Map(projection.nodes.map((node) => [node.id, node]));
    const pathPreview = buildTreePathPreview(hoveredNode);
    const searchMatchIds = buildTreeSearchMatchIds(
      projection.nodes,
      treeSearch,
    );

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

    const drawTexturedTriangle = (
      img: TreeImage,
      source: [number, number, number, number, number, number],
      dest: [number, number, number, number, number, number],
    ) => {
      const [sx0, sy0, sx1, sy1, sx2, sy2] = source;
      const [dx0, dy0, dx1, dy1, dx2, dy2] = dest;
      const denominator =
        sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
      if (Math.abs(denominator) < 0.0001) return;

      const a =
        (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) /
        denominator;
      const b =
        (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) /
        denominator;
      const c =
        (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) /
        denominator;
      const d =
        (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) /
        denominator;
      const e =
        (dx0 * (sx1 * sy2 - sx2 * sy1) +
          dx1 * (sx2 * sy0 - sx0 * sy2) +
          dx2 * (sx0 * sy1 - sx1 * sy0)) /
        denominator;
      const f =
        (dy0 * (sx1 * sy2 - sx2 * sy1) +
          dy1 * (sx2 * sy0 - sx0 * sy2) +
          dy2 * (sx0 * sy1 - sx1 * sy0)) /
        denominator;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(dx0, dy0);
      ctx.lineTo(dx1, dy1);
      ctx.lineTo(dx2, dy2);
      ctx.closePath();
      ctx.clip();
      ctx.setTransform(a, b, c, d, e, f);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    };

    const drawTexturedQuad = (
      img: TreeImage,
      sourceQuad: ConnectorQuad,
      destQuad: ConnectorQuad,
    ) => {
      const natural = imageSize(img);
      const source = sourceQuad.map((coord, index) =>
        index % 2 === 0 ? coord * natural.width : coord * natural.height,
      ) as ConnectorQuad;

      drawTexturedTriangle(
        img,
        [source[0], source[1], source[2], source[3], source[4], source[5]],
        [
          destQuad[0],
          destQuad[1],
          destQuad[2],
          destQuad[3],
          destQuad[4],
          destQuad[5],
        ],
      );
      drawTexturedTriangle(
        img,
        [source[0], source[1], source[4], source[5], source[6], source[7]],
        [
          destQuad[0],
          destQuad[1],
          destQuad[4],
          destQuad[5],
          destQuad[6],
          destQuad[7],
        ],
      );
    };

    const drawConnectorStroke = (
      edge: ProjectedEdge,
      stateKey: TreeConnectorState,
      dependency: boolean,
      layer: ConnectorStrokeLayer = "primary",
    ) => {
      ctx.lineWidth = connectorStrokeWidth(stateKey, layer);
      ctx.strokeStyle = connectorStrokeStyle(stateKey, dependency, layer);
      ctx.beginPath();
      ctx.moveTo(edge.ax, edge.ay);
      ctx.lineTo(edge.bx, edge.by);
      ctx.stroke();
    };

    const drawConnector = (
      edge: ProjectedEdge,
      stateKey: TreeConnectorState,
      dependency: boolean,
    ) => {
      ctx.lineWidth = stateKey === "Normal" ? 2 : 3;
      ctx.strokeStyle = connectorStrokeStyle(stateKey, dependency);

      const matchedConnectors = connectorMap.get(
        connectorKey(edge.node1Id, edge.node2Id),
      );
      let textured = false;
      for (const matchedConnector of matchedConnectors ?? []) {
        const quad = projectConnectorQuad(
          matchedConnector,
          stateKey,
          projection,
        );
        const assetName = connectorAssetName(matchedConnector, stateKey);
        const img = getTreeImage(assetName);
        if (quad && img) {
          drawTexturedQuad(img, connectorTextureQuad(matchedConnector), quad);
          textured = true;
        }
      }
      if (textured) {
        if (shouldReinforceTexturedConnector(stateKey, dependency)) {
          drawConnectorStroke(
            edge,
            stateKey,
            dependency,
            "texture-reinforcement",
          );
        }
        if (dependency) drawConnectorStroke(edge, stateKey, true);
        return;
      }

      drawConnectorStroke(edge, stateKey, dependency);
    };
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

    const edgeState = (
      edge: ProjectedEdge,
    ): { stateKey: TreeConnectorState; dependency: boolean } => {
      const node1 = nodeById.get(edge.node1Id);
      const node2 = nodeById.get(edge.node2Id);
      if (!node1 || !node2) {
        return {
          stateKey: edge.active ? "Active" : "Normal",
          dependency: false,
        };
      }
      return {
        stateKey: getTreeConnectorVisualState(node1, node2, pathPreview),
        dependency: isTreeDependencyConnector(node1, node2, pathPreview),
      };
    };

    const connectorDrawOrder: TreeConnectorState[] = [
      "Normal",
      "Intermediate",
      "Active",
    ];
    for (const stateKey of connectorDrawOrder) {
      for (const edge of projection.edges) {
        const visual = edgeState(edge);
        if (visual.stateKey === stateKey) {
          drawConnector(edge, visual.stateKey, visual.dependency);
        }
      }
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
      const frameState = getTreeNodeVisualState(node, pathPreview);
      const iconImg = onlyImage
        ? null
        : getDdsImage(node.icon, frameState === "unalloc");
      const effectImg = getDdsImage(node.activeEffectImage);
      const frameAssetName = getNodeFrameAssetName(node, frameState);
      const frameImg = getDdsImage(frameAssetName);

      if (effectImg) {
        drawCenteredImage(
          effectImg,
          node,
          onlyImage ? getNodeIconDrawSize(node) : getNodeEffectDrawSize(node),
          getNodeEffectOpacity(node, frameState),
        );
      } else if (!onlyImage && !iconImg && !frameImg) {
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor(node);
        ctx.fill();
      }

      if (iconImg) {
        drawCenteredImage(
          iconImg,
          node,
          getNodeIconDrawSize(node),
          getNodeIconOpacity(node, frameState),
        );
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

      if (searchMatchIds.has(node.id)) {
        const zoom = zoomFromLevel(view.zoomLevel);
        const radius = Math.max(
          node.radius + 8,
          (140 * projection.scale) / Math.pow(zoom, 0.2),
        );
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, radius, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, 3 * projection.scale);
        ctx.strokeStyle = "rgba(255, 72, 72, 0.95)";
        ctx.stroke();
      }
    }
    defaultPassiveTreePerfReporter({
      scenario: state.scenario,
      stage: "canvas-draw",
      durationMs:
        (typeof performance !== "undefined" &&
        typeof performance.now === "function"
          ? performance.now()
          : Date.now()) - drawStartedAt,
      nodeCount: projection.nodes.length,
      treeVersion: state.status === "ready" ? state.snapshot.treeVersion : null,
      buildKey: sessionKey,
    });
  }, [
    projection,
    size.width,
    size.height,
    state,
    images,
    ddsLookup,
    connectorMap,
    hoveredNode,
    treeSearch,
    view.zoomLevel,
    sessionKey,
  ]);

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

  useEffect(() => {
    const nodeId = hoveredNode?.id ?? null;
    if (nodeId === null) {
      return;
    }

    const api = window.pobAPI;
    if (!api) return;

    let cancelled = false;
    void api.session
      .treeNodeTooltip(nodeId)
      .then((result) => {
        if (cancelled) return;
        setHoverTooltip({
          nodeId,
          tooltip: result.status === "ok" ? result.tooltip : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setHoverTooltip({ nodeId, tooltip: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hoveredNode?.id]);

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
            ? {
                id: node.id,
                name: node.name,
                statLines: node.statLines ?? [],
                path: node.path,
                depends: node.depends,
                x: node.screenX,
                y: node.screenY,
              }
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
      if (event.ctrlKey) {
        applyZoomAt(2, event.clientX, event.clientY);
        return;
      }
      const node = hitTest(x, y);
      if (node) void allocateNode(node);
    },
    [allocateNode, applyZoomAt, hitTest],
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

  const snapshot = translatedSnapshot ?? state.snapshot;
  const zoomPercent = Math.round(zoomFromLevel(view.zoomLevel) * 100);
  const sourceRichTooltip =
    hoveredNode !== null && hoverTooltip?.nodeId === hoveredNode.id
      ? hoverTooltip.tooltip
      : null;
  const richTooltip = sourceRichTooltip
    ? translateTreeNodeTooltip(sourceRichTooltip, translations)
    : null;
  const tooltipHeight =
    hoveredNode === null
      ? 0
      : estimatePassiveTreeTooltipHeight(
          richTooltip
            ? {
                hasHeader: richTooltip.header !== null,
                lineCount: richTooltip.lines.filter(
                  (line) => line.kind !== "separator",
                ).length,
                separatorCount: richTooltip.lines.filter(
                  (line) => line.kind === "separator",
                ).length,
              }
            : {
                hasHeader: true,
                lineCount: hoveredNode.statLines.length,
              },
        );
  const tooltipStyle: React.CSSProperties | undefined =
    hoveredNode === null
      ? undefined
      : resolvePassiveTreeTooltipPlacement({
          viewportWidth: size.width,
          viewportHeight: size.height,
          anchorX: hoveredNode.x,
          anchorY: hoveredNode.y,
          estimatedHeight: tooltipHeight,
        });
  const tooltipVaultPath = state.status === "ready" ? state.vaultPath : null;
  const tooltipHeaderAssetStyle = richTooltip
    ? buildPobTooltipHeaderAssetStyle(tooltipVaultPath, richTooltip.header)
    : null;
  const tooltipSharedAssetStyle =
    buildPobTooltipSharedAssetStyle(tooltipVaultPath);
  const richTooltipHeaderTitleEntries = richTooltip
    ? collectPobTooltipHeaderTitleEntries(
        richTooltip.lines,
        Boolean(tooltipHeaderAssetStyle),
      )
    : [];
  const richTooltipHeaderTitleIndexes = new Set(
    richTooltipHeaderTitleEntries.map((entry) => entry.index),
  );
  const richTooltipSkippedHeaderSeparatorIndex = richTooltip
    ? richTooltip.lines.findIndex(
        (line) =>
          line.kind === "separator" &&
          shouldSkipHeaderSeparator(line.separatorTheme ?? richTooltip.header),
      )
    : -1;
  const richTooltipStyle = {
    ...(tooltipSharedAssetStyle ?? {}),
    ...(tooltipHeaderAssetStyle ?? {}),
    ...(tooltipStyle ?? {}),
  } as React.CSSProperties;
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
        <input
          type="search"
          className="pob-passive-tree-search"
          placeholder={t("buildEdit.tree.search.placeholder")}
          title={t("buildEdit.tree.search.tooltip")}
          value={treeSearch}
          onChange={(event) => setTreeSearch(event.currentTarget.value)}
        />
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
        <PobUnimplementedButton
          controlId="tree.find-timeless-jewel"
          notice={t("buildEdit.unimplemented.notice", {
            reason: t("buildEdit.tree.findTimelessJewelDisabled"),
          })}
          title={t("buildEdit.tree.findTimelessJewelDisabled")}
          onNotice={setUnimplementedNotice}
        >
          {t("buildEdit.tree.findTimelessJewel")}
        </PobUnimplementedButton>
      </div>
      {unimplementedNotice && (
        <div className="pob-passive-tree-notice" role="status">
          {unimplementedNotice}
        </div>
      )}
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
          <div
            className={tooltipHeaderClasses(
              `pob-passive-tree-tooltip${
                tooltipHeaderAssetStyle ? " has-asset-tooltip-header" : ""
              }`,
              richTooltip?.header,
            )}
            style={richTooltipStyle}
          >
            {richTooltip ? (
              <>
                {tooltipHeaderAssetStyle && richTooltip.header && (
                  <PobTooltipAssetHeader
                    className="pob-passive-tree-tooltip-header"
                    lineBaseClass="pob-passive-tree-tooltip-line"
                    titleEntries={richTooltipHeaderTitleEntries}
                    style={tooltipHeaderAssetStyle}
                  />
                )}
                {richTooltip.lines.map((line, index) =>
                  line.kind === "separator" ? (
                    index === richTooltipSkippedHeaderSeparatorIndex ? null : (
                      <div
                        className="pob-passive-tree-tooltip-separator"
                        key={`${hoveredNode.id}-separator-${index}`}
                      />
                    )
                  ) : richTooltipHeaderTitleIndexes.has(index) ? null : (
                    <div
                      className={tooltipLineClasses(
                        "pob-passive-tree-tooltip-line",
                        line,
                      )}
                      key={`${hoveredNode.id}-line-${index}-${line.text}`}
                    >
                      {line.text}
                    </div>
                  ),
                )}
              </>
            ) : (
              <>
                <div className="pob-passive-tree-tooltip-title">
                  {hoveredNode.name}
                </div>
                {hoveredNode.statLines.length > 0 && (
                  <div className="pob-passive-tree-tooltip-lines">
                    {hoveredNode.statLines.map((line, index) => (
                      <div
                        className="pob-passive-tree-tooltip-line"
                        key={`${hoveredNode.id}-${index}-${line}`}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
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
