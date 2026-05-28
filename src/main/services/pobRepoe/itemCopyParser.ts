import type { PobRepoeLocale } from "../../../shared/types";

export type PobItemCopyLocale = Extract<PobRepoeLocale, "en" | "ko">;

interface RePoeNamedRecord {
  id?: unknown;
  name?: unknown;
  display_name?: unknown;
  base_item?: {
    id?: unknown;
    display_name?: unknown;
  };
}

interface RePoeStatCondition {
  min?: number | null;
  max?: number | null;
  negated?: boolean | null;
}

interface RePoeStatTranslationVariant {
  condition?: RePoeStatCondition[];
  string?: string | null;
}

interface RePoeStatTranslationEntry {
  ids?: string[];
  English?: RePoeStatTranslationVariant[] | null;
  Korean?: RePoeStatTranslationVariant[] | null;
}

export interface PobItemCopyParserLocaleData {
  baseItems?: Record<string, RePoeNamedRecord>;
  itemClasses?: Record<string, RePoeNamedRecord>;
  uniques?: Record<string, RePoeNamedRecord>;
}

export interface PobItemCopyParserData {
  en?: PobItemCopyParserLocaleData;
  ko?: PobItemCopyParserLocaleData;
  statTranslations?: RePoeStatTranslationEntry[];
}

export interface ParseItemCopyTextRequest {
  rawText: string;
  localeHint?: PobItemCopyLocale;
  data?: PobItemCopyParserData;
}

export type ParseItemCopyTextResult =
  | {
      status: "ok";
      locale: PobItemCopyLocale;
      englishText: string;
      warnings: string[];
    }
  | {
      status: "error";
      locale: PobItemCopyLocale;
      reason: string;
      originalText: string;
    };

interface LocaleHeaderDictionary {
  itemClass: RegExp;
  rarity: RegExp;
  rarityMap: Record<string, string>;
  quality: RegExp;
  requirements: RegExp;
  reqMap: Record<string, string>;
  itemLevel: RegExp;
  sockets: RegExp;
  spirit: RegExp;
  grantsSkill: RegExp;
  fractured: RegExp;
}

export const LOCALE_HEADER_DICTIONARIES: Record<"ko", LocaleHeaderDictionary> =
  {
    ko: {
      itemClass: /^아이템 종류:\s*(.+)$/,
      rarity: /^아이템 희귀도:\s*(.+)$/,
      rarityMap: {
        일반: "Normal",
        마법: "Magic",
        희귀: "Rare",
        고유: "Unique",
      },
      quality: /^퀄리티:\s*\+?(\d+)%/,
      requirements: /^요구 사항:\s*(.*)$/,
      reqMap: { 레벨: "Level", 지능: "Int", 힘: "Str", 민첩: "Dex" },
      itemLevel: /^아이템 레벨:\s*(\d+)$/,
      sockets: /^홈:\s*(.+)$/,
      spirit: /^정신력:\s*(\d+)$/,
      grantsSkill: /^스킬 부여:\s*(\d+)레벨\s*(.+)$/,
      fractured: /^분열된 아이템$/,
    },
  };

const KOREAN_STATIC_LINES: Record<string, string> = {
  미확인: "Unidentified",
  타락: "Corrupted",
  성역화됨: "Sanctified",
};

const stringValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const hasHangul = (value: string): boolean => /[가-힣]/.test(value);

const normalizeLineEndings = (text: string): string =>
  text.replace(/\r\n?/g, "\n").trim();

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function firstRecordName(record: RePoeNamedRecord | undefined): string | null {
  if (!record) return null;
  return (
    stringValue(record.display_name) ??
    stringValue(record.name) ??
    stringValue(record.base_item?.display_name)
  );
}

function addPairedNames(
  map: Map<string, string>,
  englishRecords: Record<string, RePoeNamedRecord> | undefined,
  localizedRecords: Record<string, RePoeNamedRecord> | undefined,
): void {
  for (const [key, localized] of Object.entries(localizedRecords ?? {})) {
    const englishName = firstRecordName(englishRecords?.[key]);
    const localizedName = firstRecordName(localized);
    if (!englishName || !localizedName) continue;
    map.set(localizedName, englishName);
  }
}

function buildReverseNameMap(
  data: PobItemCopyParserData | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  addPairedNames(map, data?.en?.baseItems, data?.ko?.baseItems);
  addPairedNames(map, data?.en?.itemClasses, data?.ko?.itemClasses);
  addPairedNames(map, data?.en?.uniques, data?.ko?.uniques);
  return map;
}

function localeTemplate(
  variant: RePoeStatTranslationVariant | undefined,
  locale: "English" | "Korean",
): string | null {
  const template = stringValue(variant?.string);
  if (!template) return null;
  return template.replace(/\[([^|\]]+)\|([^\]]+)\]/g, (_match, en, ko) =>
    locale === "Korean" ? String(ko) : String(en),
  );
}

function conditionsEqual(
  left: RePoeStatCondition[] | undefined,
  right: RePoeStatCondition[] | undefined,
): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function findEnglishVariant(
  entry: RePoeStatTranslationEntry,
  koreanVariant: RePoeStatTranslationVariant,
  index: number,
): RePoeStatTranslationVariant | undefined {
  const english = entry.English ?? [];
  return (
    english[index] ??
    english.find((variant) =>
      conditionsEqual(variant.condition, koreanVariant.condition),
    )
  );
}

function templateToRegex(template: string): {
  regex: RegExp;
  placeholders: number[];
} {
  const placeholders: number[] = [];
  let source = "";

  for (let i = 0; i < template.length; ) {
    const placeholder = template.slice(i).match(/^\{(\d+)\}|^#/);
    if (placeholder) {
      placeholders.push(
        placeholder[1] ? Number(placeholder[1]) : placeholders.length,
      );
      source += "([-+]?\\d+(?:\\.\\d+)?)";
      i += placeholder[0].length;
      continue;
    }

    const char = template[i];
    source += /\s/.test(char) ? "\\s+" : escapeRegex(char);
    i += 1;
  }

  return { regex: new RegExp(`^${source}$`), placeholders };
}

function applyValuesToEnglishTemplate(
  template: string,
  valuesByIndex: Map<number, string>,
): string {
  let nextHash = 0;
  return template
    .replace(/\{(\d+)\}/g, (_match, index: string) => {
      return valuesByIndex.get(Number(index)) ?? "";
    })
    .replace(/#/g, () => valuesByIndex.get(nextHash++) ?? "");
}

function reverseStatLine(
  line: string,
  statTranslations: RePoeStatTranslationEntry[] | undefined,
): string | null {
  for (const entry of statTranslations ?? []) {
    for (const [index, koreanVariant] of (entry.Korean ?? []).entries()) {
      const koreanTemplate = localeTemplate(koreanVariant, "Korean");
      const englishTemplate = localeTemplate(
        findEnglishVariant(entry, koreanVariant, index),
        "English",
      );
      if (!koreanTemplate || !englishTemplate) continue;

      const { regex, placeholders } = templateToRegex(koreanTemplate);
      const match = line.match(regex);
      if (!match) continue;

      const valuesByIndex = new Map<number, string>();
      placeholders.forEach((placeholderIndex, matchIndex) => {
        valuesByIndex.set(placeholderIndex, match[matchIndex + 1]);
      });
      return applyValuesToEnglishTemplate(englishTemplate, valuesByIndex);
    }
  }
  return null;
}

function detectLocale(
  text: string,
  localeHint: PobItemCopyLocale | undefined,
): PobItemCopyLocale {
  if (localeHint) return localeHint;
  return hasHangul(text) ? "ko" : "en";
}

function translateKoreanItemText(
  text: string,
  data: PobItemCopyParserData | undefined,
): ParseItemCopyTextResult {
  const dict = LOCALE_HEADER_DICTIONARIES.ko;
  const reverseNameMap = buildReverseNameMap(data);
  const lines = normalizeLineEndings(text).split("\n");
  const output: string[] = [];
  const warnings: string[] = [];
  let expectedNameLines = 0;
  let nameLineIndex = 0;
  let inRequirements = false;

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line) continue;

    if (line.includes("{ ")) {
      return {
        status: "error",
        locale: "ko",
        reason: "Advanced Item Descriptions (Ctrl+Alt+C) are unsupported",
        originalText: text,
      };
    }

    const itemClass = line.match(dict.itemClass);
    if (itemClass) {
      output.push(
        `Item Class: ${reverseNameMap.get(itemClass[1]) ?? itemClass[1]}`,
      );
      continue;
    }

    const rarity = line.match(dict.rarity);
    if (rarity) {
      const englishRarity = dict.rarityMap[rarity[1]];
      if (!englishRarity) {
        return {
          status: "error",
          locale: "ko",
          reason: `Unknown Korean rarity: ${rarity[1]}`,
          originalText: text,
        };
      }
      output.push(`Rarity: ${englishRarity}`);
      expectedNameLines =
        englishRarity === "Rare" || englishRarity === "Unique" ? 2 : 1;
      nameLineIndex = 0;
      continue;
    }

    if (line === "--------") {
      output.push(line);
      inRequirements = false;
      expectedNameLines = 0;
      continue;
    }

    if (expectedNameLines > 0) {
      const mapped = reverseNameMap.get(line);
      const isBaseLine = nameLineIndex === expectedNameLines - 1;
      if (!mapped && isBaseLine && hasHangul(line)) {
        return {
          status: "error",
          locale: "ko",
          reason: `Unmapped Korean item base/name: ${line}`,
          originalText: text,
        };
      }
      output.push(mapped ?? line);
      expectedNameLines -= 1;
      nameLineIndex += 1;
      continue;
    }

    const quality = line.match(dict.quality);
    if (quality) {
      output.push(`Quality: +${quality[1]}%`);
      continue;
    }

    const requirements = line.match(dict.requirements);
    if (requirements) {
      output.push("Requirements:");
      inRequirements = true;
      if (requirements[1]) {
        warnings.push("Inline Korean requirements were split into a section");
      }
      continue;
    }

    if (inRequirements) {
      const [label, value] = line.split(/:\s*/, 2);
      const mapped = dict.reqMap[label];
      if (mapped && value) {
        output.push(`${mapped}: ${value}`);
        continue;
      }
    }

    const itemLevel = line.match(dict.itemLevel);
    if (itemLevel) {
      output.push(`Item Level: ${itemLevel[1]}`);
      continue;
    }

    const sockets = line.match(dict.sockets);
    if (sockets) {
      output.push(`Sockets: ${sockets[1]}`);
      continue;
    }

    const spirit = line.match(dict.spirit);
    if (spirit) {
      output.push(`Spirit: ${spirit[1]}`);
      continue;
    }

    const grantsSkill = line.match(dict.grantsSkill);
    if (grantsSkill) {
      const skillName = reverseNameMap.get(grantsSkill[2]) ?? grantsSkill[2];
      output.push(`Grants Skill: Level ${grantsSkill[1]} ${skillName}`);
      continue;
    }

    if (dict.fractured.test(line)) {
      warnings.push("Korean fractured item marker is informational only");
      continue;
    }

    const staticLine = KOREAN_STATIC_LINES[line];
    if (staticLine) {
      output.push(staticLine);
      continue;
    }

    const mappedName = reverseNameMap.get(line);
    if (mappedName) {
      output.push(mappedName);
      continue;
    }

    const reversedStat = reverseStatLine(line, data?.statTranslations);
    if (reversedStat) {
      output.push(reversedStat);
      continue;
    }

    if (hasHangul(line)) {
      return {
        status: "error",
        locale: "ko",
        reason: `Unmapped Korean item line: ${line}`,
        originalText: text,
      };
    }

    output.push(line);
  }

  return {
    status: "ok",
    locale: "ko",
    englishText: output.join("\n"),
    warnings,
  };
}

export function parseItemCopyText(
  request: ParseItemCopyTextRequest,
): ParseItemCopyTextResult {
  const text = normalizeLineEndings(request.rawText);
  if (!text) {
    return {
      status: "error",
      locale: request.localeHint ?? "en",
      reason: "Item text is empty",
      originalText: request.rawText,
    };
  }

  const locale = detectLocale(text, request.localeHint);
  if (locale === "en") {
    return { status: "ok", locale: "en", englishText: text, warnings: [] };
  }
  return translateKoreanItemText(text, request.data);
}
