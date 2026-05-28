export type TreeConnectorState = "Normal" | "Intermediate" | "Active";

export interface TreeConnector {
  type: string | null;
  connectionArt: string | null;
  ascendancyName: string | null;
  nodeId1: number;
  nodeId2: number;
  vert?: Record<string, unknown>;
  tex?: unknown;
}

export interface TreeProjectionTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export type ConnectorStrokeLayer = "primary" | "texture-reinforcement";

export type ConnectorQuad = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const connectorKey = (nodeId1: number, nodeId2: number): string => {
  const [left, right] = [nodeId1, nodeId2].sort((a, b) => a - b);
  return `${left}_${right}`;
};

export const toTreeConnector = (value: unknown): TreeConnector | null => {
  if (!isRecord(value)) return null;
  if (typeof value.nodeId1 !== "number" || typeof value.nodeId2 !== "number") {
    return null;
  }
  return {
    type: typeof value.type === "string" ? value.type : null,
    connectionArt:
      typeof value.connectionArt === "string" ? value.connectionArt : null,
    ascendancyName:
      typeof value.ascendancyName === "string" ? value.ascendancyName : null,
    nodeId1: value.nodeId1,
    nodeId2: value.nodeId2,
    vert: isRecord(value.vert) ? value.vert : undefined,
    tex: value.tex,
  };
};

export const buildConnectorMap = (
  value: unknown[] | Record<string, unknown> | undefined,
): Map<string, TreeConnector[]> => {
  const map = new Map<string, TreeConnector[]>();
  if (!value) return map;
  const connectors = Array.isArray(value) ? value : Object.values(value);
  for (const rawConnector of connectors) {
    const connector = toTreeConnector(rawConnector);
    if (!connector) continue;
    const key = connectorKey(connector.nodeId1, connector.nodeId2);
    const list = map.get(key) ?? [];
    list.push(connector);
    map.set(key, list);
  }
  return map;
};

export const connectorAssetName = (
  connector: TreeConnector,
  state: TreeConnectorState,
): string | null => {
  if (!connector.type) return null;
  return `${connector.connectionArt ?? "Character"}${connector.type}${state}`;
};

const readIndexedNumber = (value: unknown, index: number): number | null => {
  if (Array.isArray(value)) return readNumber(value[index]);
  if (isRecord(value)) return readNumber(value[String(index + 1)]);
  return null;
};

const readQuad = (value: unknown): ConnectorQuad | null => {
  const values = Array.from({ length: 8 }, (_, index) =>
    readIndexedNumber(value, index),
  );
  if (values.some((coord) => coord === null)) return null;
  const coords = values as number[];
  return [
    coords[0],
    coords[1],
    coords[2],
    coords[3],
    coords[4],
    coords[5],
    coords[6],
    coords[7],
  ];
};

const readStateVert = (
  connector: TreeConnector,
  state: TreeConnectorState,
): ConnectorQuad | null => {
  const vert = connector.vert?.[state] ?? connector.vert?.Normal;
  return readQuad(vert);
};

export const connectorTextureQuad = (
  connector: TreeConnector,
): ConnectorQuad => {
  const quad = readQuad(connector.tex) ?? [0, 1, 0, 0, 1, 0, 1, 1];
  return quad.map((coord) => Math.min(Math.max(coord, 0), 1)) as ConnectorQuad;
};

export const connectorStrokeWidth = (
  state: TreeConnectorState,
  layer: ConnectorStrokeLayer = "primary",
): number => {
  if (layer === "texture-reinforcement") {
    if (state === "Active") return 3.25;
    if (state === "Intermediate") return 2.75;
    return 1.75;
  }
  if (state === "Active") return 4.5;
  if (state === "Intermediate") return 3.75;
  return 2.5;
};

export const connectorStrokeStyle = (
  state: TreeConnectorState,
  dependency: boolean,
  layer: ConnectorStrokeLayer = "primary",
): string => {
  if (dependency) {
    return layer === "texture-reinforcement"
      ? "rgba(255, 88, 88, 0.55)"
      : "rgba(255, 88, 88, 0.9)";
  }
  if (state === "Active") {
    return layer === "texture-reinforcement"
      ? "rgba(255, 218, 122, 0.72)"
      : "#ffd166";
  }
  if (state === "Intermediate") {
    return layer === "texture-reinforcement"
      ? "rgba(255, 209, 102, 0.5)"
      : "rgba(255, 209, 102, 0.75)";
  }
  return layer === "texture-reinforcement"
    ? "rgba(140, 152, 168, 0.34)"
    : "rgba(140, 152, 168, 0.35)";
};

export const shouldReinforceTexturedConnector = (
  state: TreeConnectorState,
  dependency: boolean,
): boolean =>
  dependency ||
  state === "Normal" ||
  state === "Intermediate" ||
  state === "Active";

export const projectConnectorQuad = (
  connector: TreeConnector,
  state: TreeConnectorState,
  projection: TreeProjectionTransform,
): ConnectorQuad | null => {
  const treeQuad = readStateVert(connector, state);
  if (!treeQuad) return null;

  return treeQuad.map((coord, index) =>
    index % 2 === 0
      ? coord * projection.scale + projection.offsetX
      : coord * projection.scale + projection.offsetY,
  ) as ConnectorQuad;
};
