import type { PobRepoeTranslationsSnapshot } from "../../../../shared/types";

export interface RePoePassiveTreeTextRecord {
  id?: unknown;
  name?: unknown;
  stats?: unknown;
}

export interface RePoePassiveTreeTextSource {
  passives?: Record<string, RePoePassiveTreeTextRecord>;
}

const textValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const textArrayValue = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const text = textValue(entry);
    return text ? [text] : [];
  });
};

const idValue = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const localizedName = (
  tree: RePoePassiveTreeTextSource | null | undefined,
  nodeId: string,
): string | null => textValue(tree?.passives?.[nodeId]?.name);

const localizedStatLines = (
  tree: RePoePassiveTreeTextSource | null | undefined,
  nodeId: string,
): string[] => textArrayValue(tree?.passives?.[nodeId]?.stats);

export const passiveTreeTextOverride = {
  enabled: true,

  apply(
    nodeId: string,
    englishName: string,
    englishStatLines: string[],
    localizedTree: RePoePassiveTreeTextSource | null | undefined,
  ): { name: string; statLines: string[] } {
    if (!this.enabled) {
      return { name: englishName, statLines: englishStatLines };
    }
    const statLines = localizedStatLines(localizedTree, nodeId);
    return {
      name: localizedName(localizedTree, nodeId) ?? englishName,
      statLines: statLines.length > 0 ? statLines : englishStatLines,
    };
  },

  indexSnapshot(
    snapshot: PobRepoeTranslationsSnapshot,
    localizedTree: RePoePassiveTreeTextSource | null | undefined,
  ): void {
    if (!this.enabled) return;

    for (const [nodeId, record] of Object.entries(
      localizedTree?.passives ?? {},
    )) {
      const name = textValue(record.name);
      const statLines = textArrayValue(record.stats);
      if (!name && statLines.length === 0) continue;

      const recordId = idValue(record.id);
      if (name) {
        snapshot.nodeNamesById[nodeId] = name;
      }
      if (statLines.length > 0) {
        snapshot.nodeStatLinesById[nodeId] = statLines;
      }
      if (recordId) {
        if (name) {
          snapshot.nodeNamesById[recordId] = name;
        }
        if (statLines.length > 0) {
          snapshot.nodeStatLinesById[recordId] = statLines;
        }
      }
    }
  },
};
