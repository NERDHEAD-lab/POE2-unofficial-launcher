import type { PobRepoeTranslationsSnapshot } from "@poe2-launcher/shared/types";

export interface RePoePassiveTreeTextRecord {
  id?: unknown;
  name?: unknown;
  stats?: unknown;
}

export interface RePoePassiveTreeTextSource {
  passives?: Record<string, RePoePassiveTreeTextRecord>;
}

type StatLineTranslator = (statId: string, values: number[]) => string | null;

const textValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const numberValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const numberArrayValue = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    const parsed = numberValue(value);
    return parsed === null ? [] : [parsed];
  }
  return value.flatMap((entry) => {
    const parsed = numberValue(entry);
    return parsed === null ? [] : [parsed];
  });
};

const statRecordLine = (
  value: unknown,
  translateStatLine?: StatLineTranslator,
): string | null => {
  if (typeof value === "string") {
    return translateStatLine?.(value, []) ?? textValue(value);
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const statId =
    textValue(record.id) ??
    textValue(record.stat) ??
    textValue(record.stat_id) ??
    textValue(record.statId);
  if (!statId) return null;

  const values = [
    ...numberArrayValue(record.values),
    ...numberArrayValue(record.value),
  ];
  if (values.length === 0) {
    const min = numberValue(record.min);
    const max = numberValue(record.max);
    if (min !== null) values.push(min);
    if (max !== null && max !== min) values.push(max);
  }

  return translateStatLine?.(statId, values) ?? statId;
};

const textArrayValue = (
  value: unknown,
  translateStatLine?: StatLineTranslator,
): string[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const text = statRecordLine(entry, translateStatLine);
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
  translateStatLine?: StatLineTranslator,
): string[] =>
  textArrayValue(tree?.passives?.[nodeId]?.stats, translateStatLine);

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
    translateStatLine?: StatLineTranslator,
  ): void {
    if (!this.enabled) return;

    for (const [nodeId, record] of Object.entries(
      localizedTree?.passives ?? {},
    )) {
      const name = textValue(record.name);
      const statLines = textArrayValue(record.stats, translateStatLine);
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
