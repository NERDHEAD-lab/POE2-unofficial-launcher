import type {
  PobBuildMetadataSnapshot,
  PobBuildSummary,
  PobCalcsBreakdown,
  PobCalcsSnapshot,
  PobConfigSnapshot,
  PobItemDbSummary,
  PobItemsTooltip,
  PobItemsSnapshot,
  PobItemSummary,
  PobMainSkillSummarySnapshot,
  PobRepoeTranslationsSnapshot,
  PobSkillGem,
  PobSkillGemCatalogEntry,
  PobSkillGroup,
  PobSkillsGemTooltip,
  PobSkillsSnapshot,
  PobTreeNode,
  PobTreeNodeTooltip,
  PobTreeSnapshot,
  PobTreeTooltipLine,
} from "@poe2-launcher/shared/types";

export const EMPTY_REPOE_TRANSLATIONS: PobRepoeTranslationsSnapshot = {
  locale: "ko",
  available: false,
  nodeNamesById: {},
  nodeStatLinesById: {},
  statLinesByEnglishLine: {},
  statLineTemplates: [],
  itemNamesById: {},
  itemNamesByEnglishName: {},
  gemNamesById: {},
  gemNamesBySkillId: {},
  gemNamesByEnglishName: {},
  skillDescriptionsById: {},
  skillDescriptionsByEnglishText: {},
  gemFamiliesByEnglishName: {},
  skillTagsByEnglishName: {},
};

const translatedByName = (
  translations: PobRepoeTranslationsSnapshot,
  value: string | null | undefined,
  map: Record<string, string>,
): string | null => {
  if (!value) return null;
  return map[value] ?? null;
};

const shouldApplyDisplayTranslations = (
  translations: PobRepoeTranslationsSnapshot,
): boolean =>
  translations.available && !translations.locale.toLowerCase().startsWith("en");

const pobDisplayPhrasesKo: Record<string, string> = {
  // Build metadata / class names.
  Warrior: "워리어",
  Huntress: "헌트리스",
  Mercenary: "머서너리",
  Monk: "몽크",
  Ranger: "레인저",
  Sorceress: "소서리스",
  Witch: "위치",
  Titan: "타이탄",
  Warbringer: "워브링어",
  SmithOfKitava: "키타바의 대장장이",
  "Smith of Kitava": "키타바의 대장장이",
  Amazon: "아마존",
  Ritualist: "리추얼리스트",
  Tactician: "택티션",
  Witchhunter: "위치헌터",
  GemlingLegionnaire: "젬링 군단병",
  "Gemling Legionnaire": "젬링 군단병",
  Invoker: "인보커",
  AcolyteOfChayula: "차율라의 수행자",
  "Acolyte of Chayula": "차율라의 수행자",
  Deadeye: "데드아이",
  Pathfinder: "패스파인더",
  Stormweaver: "스톰위버",
  Chronomancer: "크로노맨서",
  BloodMage: "블러드 메이지",
  "Blood Mage": "블러드 메이지",
  Infernalist: "인퍼널리스트",

  // Config section / option chrome observed in Imported Build2.
  General: "일반",
  "Skill Options": "스킬 옵션",
  "Quest Rewards": "퀘스트 보상",
  "Enemy Stats": "적 능력치",
  "When In Combat": "전투 중",
  "For Effective DPS": "유효 DPS",
  "Custom Modifiers": "커스텀 보정",
  "Act 1 (0%)": "액트 1 (0%)",
  "Act 2 (-10%)": "액트 2 (-10%)",
  "Act 3 (-20%)": "액트 3 (-20%)",
  "Act 4 (-30%)": "액트 4 (-30%)",
  "Act 5 (-40%)": "액트 5 (-40%)",
  "Act 6 (-50%)": "액트 6 (-50%)",
  "One of the following:": "다음 중 하나:",
  "Elemental Resistance penalty:": "원소 저항 페널티:",
  "Enemy Corpse Life:": "적 시신 생명력:",
  "Current Mana %:": "현재 마나 %:",
  "Time spent stationary": "정지 상태 지속 시간",
  "Are you always moving?": "항상 이동 중입니까?",
  "Are you always on Full Life?": "항상 최대 생명력 상태입니까?",
  "Are you always on Low Life?": "항상 낮은 생명력 상태입니까?",
  "Are you always on Full Mana?": "항상 최대 마나 상태입니까?",
  "Are you always on Low Mana?": "항상 낮은 마나 상태입니까?",
  "Are you always on Full Energy Shield?":
    "항상 최대 에너지 보호막 상태입니까?",
  "Are you always on Low Energy Shield?": "항상 낮은 에너지 보호막 상태입니까?",
  "Do you always have Energy Shield?": "항상 에너지 보호막이 있습니까?",
  "Current Energy Shield percentage:": "현재 에너지 보호막 비율:",
  "Are your Minions always on Full Life?":
    "소환수가 항상 최대 생명력 상태입니까?",
  "Minion is always on Full Energy Shield?":
    "소환수가 항상 최대 에너지 보호막 상태입니까?",
  "Have your Minions been created Recently?": "소환수가 최근 생성되었습니까?",
  "Ailment calculation mode:": "상태 이상 계산 방식:",
  "Cooldown calculation mode:": "재사용 대기시간 계산 방식:",
  "Random element mode:": "무작위 원소 방식:",
  "Life regen calculation mode:": "생명력 재생 계산 방식:",
  "Resource gain calculation mode:": "자원 획득 계산 방식:",
  "EHP calc unlucky:": "EHP 계산 불운:",
  "Disable EHP gain on block/suppress:": "막기/억제 시 EHP 획득 비활성:",
  "Armour calculation mode:": "방어도 계산 방식:",
  "Exerted/Boosted calc mode:": "강화/증폭 계산 방식:",
  "Disable Emperor's Vigilance Bypass": "황제의 경계 우회 비활성",
  "Don't disable items": "아이템 비활성화 안 함",
  "Ignore Jewel Limits": "주얼 제한 무시",
  "Wind Dancer:": "바람의 무희:",
  "# of Wind Dancer Stacks:": "바람의 무희 중첩 수:",
  "Enemy Level:": "적 레벨:",
  "Is the enemy Rare or Unique?": "적이 희귀 또는 고유입니까?",
  "Is the enemy a Boss?": "적이 보스입니까?",
  "Delirious Effect:": "환영 효과:",
  "Enemy Phys. Damage Reduction:": "적 물리 피해 감소:",
  "Enemy Lightning Resistance:": "적 번개 저항:",
  "Enemy Cold Resistance:": "적 냉기 저항:",
  "Enemy Fire Resistance:": "적 화염 저항:",
  "Enemy Chaos Resistance:": "적 카오스 저항:",
  "Enemy Max Resistance is always 75%": "적 최대 저항을 항상 75%로 처리",
  "Enemy Block Chance:": "적 막기 확률:",
  "Enemy Base Evasion:": "적 기본 회피:",
  "Enemy Base Armour:": "적 기본 방어도:",
  "Boss Skill Preset": "보스 스킬 프리셋",
  "Enemy Skill Roll Range %:": "적 스킬 피해 범위 %:",
  "Enemy Damage Type:": "적 피해 유형:",
  "Enemy attack / cast time in ms:": "적 공격/시전 시간(ms):",
  "Enemy critical strike chance:": "적 치명타 확률:",
  "Enemy critical strike multiplier:": "적 치명타 배율:",
  "Enemy Skill Physical Damage:": "적 스킬 물리 피해:",
  "Enemy Skill Physical Overwhelm:": "적 스킬 물리 압도:",
  "Enemy Skill Lightning Damage:": "적 스킬 번개 피해:",
  "Enemy Skill Lightning Pen:": "적 스킬 번개 관통:",
  "Enemy Skill Cold Damage:": "적 스킬 냉기 피해:",
  "Enemy Skill Cold Pen:": "적 스킬 냉기 관통:",
  "Enemy Skill Fire Damage:": "적 스킬 화염 피해:",
  "Enemy Skill Fire Pen:": "적 스킬 화염 관통:",
  "Enemy Skill Chaos Damage:": "적 스킬 카오스 피해:",
  "Do you use Power Charges?": "권능 충전을 사용합니까?",
  "# of Power Charges (if not maximum):": "권능 충전 수(최대가 아닐 때):",
  "Do you use Frenzy Charges?": "격분 충전을 사용합니까?",
  "# of Frenzy Charges (if not maximum):": "격분 충전 수(최대가 아닐 때):",
  "Do you use Endurance Charges?": "인내 충전을 사용합니까?",
  "# of Endurance Charges (if not maximum):": "인내 충전 수(최대가 아닐 때):",
  "Are you Sprinting?": "질주 중입니까?",
  "Do you have Onslaught?": "맹공 상태입니까?",
  "Do you have Arcane Surge?": "비전 쇄도 상태입니까?",
  "Do you have Unholy Might?": "부정한 힘 상태입니까?",
  "Do you have Chaotic Might?": "혼돈의 힘 상태입니까?",
  "Are you Fortified?": "방어 상승 상태입니까?",
  "Do you have Adrenaline?": "아드레날린 상태입니까?",
  "Are you on Consecrated Ground?": "신성화 지대 위에 있습니까?",
  "Endgame (-60%)": "엔드게임 (-60%)",
  Average: "평균",
  Base: "기본",
  "Crits Only": "치명타만",
  Minimum: "최소",
  Maximum: "최대",
  Unlucky: "불운",
  "Very Unlucky": "매우 불운",
  Fire: "화염",
  Cold: "냉기",
  Lightning: "번개",
  None: "없음",
  No: "아니요",
  Nothing: "없음",
  "Standard Boss": "일반 보스",
  "Guardian/Pinnacle Boss": "가디언/정점 보스",
  "Uber Pinnacle Boss": "우버 정점 보스",
  Untyped: "유형 없음",
  "Damage Over Time": "지속 피해",
  Melee: "근접",
  Projectile: "투사체",
  Spell: "주문",
  "Projectile Spell": "투사체 주문",
  Fissure: "균열",
  Fissures: "균열",
  Amulet: "목걸이",
  Ring: "반지",
  Belt: "허리띠",
  Jewel: "주얼",
  Flask: "플라스크",
  Charm: "호신부",
  "Effective Hit Pool": "유효 생명력",
  "Phys Max Hit": "물리 최대 피격",
  "Fire Max Hit": "화염 최대 피격",
  "Cold Max Hit": "냉기 최대 피격",
  "Lightning Max Hit": "번개 최대 피격",
  "Chaos Max Hit": "카오스 최대 피격",
  "Total Mana": "총 마나",
  "Mana Regen": "마나 재생",
  "Fire Res. Over Max": "화염 저항 최대 초과",
  "Cold Res. Over Max": "냉기 저항 최대 초과",
  "Lightning Res. Over Max": "번개 저항 최대 초과",
};

const pobQuestAreaNamesKo: Record<string, string> = {
  Clearfell: "클리어펠",
  Freythorn: "프레이쏜",
  "Ogham Manor": "오검 저택",
  "Valley of the Titans": "거인들의 계곡",
  "Spires of Deshar": "데샤르 첨탑",
  "Azak Bog": "아작 늪",
  "Venom Crypts": "맹독 지하실",
  "Jiquani's Machinarium": "지콰니의 기계실",
  "Eye of Hinekora": "히네코라의 눈",
  "Halls Of The Dead": "망자의 전당",
  "Abandoned Prison": "버려진 감옥",
  "Khari Crossing": "카리 교차로",
  "Kharri Crossing": "카리 교차로",
  Qimah: "키마",
  "Kriar Village": "크리어 마을",
};

const translateQuestRewardLabel = (text: string): string | null => {
  const match = /^(Act|Interlude)\s+(\d+):\s+(.+)$/.exec(text);
  if (!match) return null;

  const [, phase, number, area] = match;
  const phaseLabel = phase === "Act" ? "액트" : "막간";
  return `${phaseLabel} ${number}: ${pobQuestAreaNamesKo[area] ?? area}`;
};

const translatePobDisplayPhrase = (
  text: string | null | undefined,
  translations: PobRepoeTranslationsSnapshot,
): string | null => {
  if (!text || !translations.locale.toLowerCase().startsWith("ko")) {
    return null;
  }
  return pobDisplayPhrasesKo[text] ?? translateQuestRewardLabel(text);
};

interface CompiledStatLineTemplate {
  regex: RegExp;
  indexes: number[];
  localized: string;
}

const statTemplateCache = new WeakMap<
  PobRepoeTranslationsSnapshot,
  CompiledStatLineTemplate[]
>();
const statLineTranslationCache = new WeakMap<
  PobRepoeTranslationsSnapshot,
  Map<string, string>
>();
const treeSnapshotTranslationCache = new WeakMap<
  PobTreeSnapshot,
  WeakMap<PobRepoeTranslationsSnapshot, PobTreeSnapshot>
>();
const treeNodeTextTranslationCache = new WeakMap<
  PobRepoeTranslationsSnapshot,
  Map<string, Pick<PobTreeNode, "name" | "statLines">>
>();

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compileStatTemplate = (
  english: string,
  localized: string,
): CompiledStatLineTemplate | null => {
  const indexes: number[] = [];
  let pattern = "^";
  let cursor = 0;
  for (const match of english.matchAll(/\{(\d+)(?::[^}]+)?\}|#/g)) {
    pattern += escapeRegex(english.slice(cursor, match.index));
    pattern += "(.+?)";
    indexes.push(match[1] === undefined ? indexes.length : Number(match[1]));
    cursor = (match.index ?? 0) + match[0].length;
  }
  if (indexes.length === 0) return null;
  pattern += `${escapeRegex(english.slice(cursor))}$`;
  return { regex: new RegExp(pattern, "i"), indexes, localized };
};

const compiledStatTemplates = (
  translations: PobRepoeTranslationsSnapshot,
): CompiledStatLineTemplate[] => {
  const cached = statTemplateCache.get(translations);
  if (cached) return cached;

  const compiled = translations.statLineTemplates.flatMap((template) => {
    const value = compileStatTemplate(template.english, template.localized);
    return value ? [value] : [];
  });
  statTemplateCache.set(translations, compiled);
  return compiled;
};

export const translateStatLine = (
  text: string,
  translations: PobRepoeTranslationsSnapshot,
): string => {
  if (!shouldApplyDisplayTranslations(translations) || !text) return text;
  let cache = statLineTranslationCache.get(translations);
  if (!cache) {
    cache = new Map();
    statLineTranslationCache.set(translations, cache);
  }
  const cached = cache.get(text);
  if (cached !== undefined) return cached;

  const translated = translateStatLineUncached(text, translations);
  cache.set(text, translated);
  return translated;
};

const translateStatLineUncached = (
  text: string,
  translations: PobRepoeTranslationsSnapshot,
): string => {
  const exact = translations.statLinesByEnglishLine[text];
  if (exact) return exact;

  const cleaned = stripPobInlineTags(text);
  if (cleaned !== text) {
    const translated = translateStatLine(cleaned, translations);
    if (translated !== cleaned) return translated;
  }

  for (const template of compiledStatTemplates(translations)) {
    const match = template.regex.exec(text);
    if (!match) continue;

    const values = new Map<number, string>();
    template.indexes.forEach((index, captureIndex) => {
      values.set(index, match[captureIndex + 1] ?? "");
    });
    return formatLocalizedTemplate(
      template.localized,
      template.indexes,
      values,
    );
  }

  return text;
};

const stripPobInlineTags = (text: string): string =>
  text.replace(/^(?:\{[a-z]+\})+/i, "");

const formatLocalizedTemplate = (
  localized: string,
  indexes: number[],
  values: Map<number, string>,
): string => {
  let sequentialIndex = 0;
  return localized.replace(
    /\{(\d+)(?::[^}]+)?\}|#/g,
    (token, index: string) => {
      const valueIndex =
        token === "#" ? indexes[sequentialIndex++] : Number(index);
      return values.get(valueIndex) ?? "";
    },
  );
};

const requirementLabels: Record<string, string> = {
  str: "힘",
  strength: "힘",
  dex: "민첩",
  dexterity: "민첩",
  int: "지능",
  intelligence: "지능",
};

const translateRequirementPart = (part: string): string => {
  const level = /^Level\s+(\d+)$/i.exec(part);
  if (level) return `레벨 ${level[1]}`;

  const attribute = /^(\d+)\s+([A-Za-z]+)$/i.exec(part);
  if (attribute) {
    const label = requirementLabels[attribute[2].toLocaleLowerCase()];
    if (label) return `${label} ${attribute[1]}`;
  }

  return part;
};

const translateTooltipChromeLine = (
  text: string,
  translations: PobRepoeTranslationsSnapshot,
): string | null => {
  const requires = /^Requires\s+(.+)$/i.exec(text);
  if (requires) {
    return `요구 ${requires[1]
      .split(",")
      .map((part) => translateRequirementPart(part.trim()))
      .join(", ")}`;
  }

  const requiresColon = /^Requires:\s+(.+)$/i.exec(text);
  if (requiresColon) {
    const requirement =
      translatedByName(
        translations,
        requiresColon[1],
        translations.itemNamesByEnglishName,
      ) ?? requiresColon[1];
    return `요구: ${requirement}`;
  }

  return null;
};

export const translateStatLines = (
  lines: string[],
  translations: PobRepoeTranslationsSnapshot,
): string[] => lines.map((line) => translateStatLine(line, translations));

const translateNullableDisplayText = (
  text: string | null,
  translations: PobRepoeTranslationsSnapshot,
): string | null => {
  if (text === null) return null;
  return translateDisplayText(text, translations);
};

const translateDisplayText = (
  text: string,
  translations: PobRepoeTranslationsSnapshot,
): string => {
  if (!shouldApplyDisplayTranslations(translations)) return text;
  return (
    translatedByName(translations, text, translations.gemNamesByEnglishName) ??
    translatedByName(translations, text, translations.itemNamesByEnglishName) ??
    translatePobDisplayPhrase(text, translations) ??
    translateTooltipChromeLine(text, translations) ??
    translateStatLine(text, translations)
  );
};

const cleanGameText = (text: string): string =>
  text.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");

const skillGemChromePhrasesKo: Record<string, string> = {
  Support: "보조",
  Skill: "스킬",
};

const skillGemChromeLabelsKo: Record<string, string> = {
  Category: "카테고리",
  Tags: "태그",
  Tier: "티어",
  Level: "레벨",
  Quality: "퀄리티",
  "Cost Multiplier": "소모 배율",
  "Cost & Reservation Multiplier": "소모 및 점유 배율",
  "Reservation Multiplier": "점유 배율",
  "Additional Reservation": "추가 점유",
  "Cooldown Time": "재사용 대기시간",
  "Attack Time": "공격 시간",
  "Cast Time": "시전 시간",
  "Critical Hit Chance": "치명타 명중 확률",
  "Attack Damage": "공격 피해",
};

const translateSkillGemCategoryValue = (
  value: string,
  translations: PobRepoeTranslationsSnapshot,
): string =>
  value
    .split(/\s*,\s*/)
    .map((part) => {
      const translated =
        translatedByName(
          translations,
          part,
          translations.gemFamiliesByEnglishName,
        ) ??
        translatedByName(
          translations,
          part,
          translations.skillTagsByEnglishName,
        ) ??
        translateDisplayText(part, translations);
      return translated;
    })
    .join(", ");

const translateSkillGemChromeValue = (
  label: string,
  value: string,
  translations: PobRepoeTranslationsSnapshot,
): string => {
  if (label === "Category" || label === "Tags") {
    return translateSkillGemCategoryValue(value, translations);
  }
  if (label === "Additional Reservation") {
    return value.replace(/\bSpirit\b/g, "정신력");
  }
  if (
    label === "Cooldown Time" ||
    label === "Attack Time" ||
    label === "Cast Time"
  ) {
    return value.replace(/\s+sec\b/i, "초");
  }
  return value;
};

const translateSkillGemDescriptionText = (
  text: string,
  translations: PobRepoeTranslationsSnapshot,
): string | null =>
  translatedByName(
    translations,
    text,
    translations.skillDescriptionsByEnglishText,
  ) ??
  translatedByName(
    translations,
    cleanGameText(text),
    translations.skillDescriptionsByEnglishText,
  );

const translateSkillsGemLineText = (
  text: string,
  translations: PobRepoeTranslationsSnapshot,
): string => {
  if (!translations.locale.toLowerCase().startsWith("ko")) {
    return translateDisplayText(text, translations);
  }

  const unsupported = /^(.*?)(\s*)\(Not supported in PoB yet\)$/i.exec(text);
  if (unsupported) {
    const translatedCore = translateSkillsGemLineText(
      unsupported[1].trimEnd(),
      translations,
    );
    return `${translatedCore}${unsupported[2]}(아직 PoB에서 지원되지 않음)`;
  }

  const description = translateSkillGemDescriptionText(text, translations);
  if (description) return cleanGameText(description);

  const phrase = skillGemChromePhrasesKo[text];
  if (phrase) return phrase;

  const chrome = /^([A-Za-z][A-Za-z &/]+):\s*(.+)$/.exec(text);
  if (chrome) {
    const [, label, value] = chrome;
    const translatedLabel = skillGemChromeLabelsKo[label];
    if (translatedLabel) {
      return `${translatedLabel}: ${translateSkillGemChromeValue(
        label,
        value,
        translations,
      )}`;
    }
  }

  return translateDisplayText(text, translations);
};

const translateMultilineDisplayText = (
  text: string | null | undefined,
  translations: PobRepoeTranslationsSnapshot,
): string => {
  if (text == null) return "";
  return text
    .split("\n")
    .map((line) => {
      const match = /^(\s*)(.*?)(\s*)$/.exec(line);
      if (!match || !match[2]) return line;
      return `${match[1]}${translateDisplayText(match[2], translations)}${
        match[3]
      }`;
    })
    .join("\n");
};

const translateCompositeDisplayText = (
  text: string | null,
  translations: PobRepoeTranslationsSnapshot,
): string | null => {
  if (text === null) return null;
  const direct = translateDisplayText(text, translations);
  if (direct !== text) return direct;

  const parts = text.split(/\s*,\s*/);
  if (parts.length <= 1) return text;

  const translatedParts = parts.map((part) =>
    translateDisplayText(part, translations),
  );
  return translatedParts.some((part, index) => part !== parts[index])
    ? translatedParts.join(", ")
    : text;
};

const translatedItemName = (
  item: PobItemSummary | PobItemDbSummary,
  translations: PobRepoeTranslationsSnapshot,
): string => {
  const direct =
    (typeof item.id === "string"
      ? translations.itemNamesById[item.id]
      : null) ??
    translatedByName(
      translations,
      item.name,
      translations.itemNamesByEnglishName,
    );
  if (direct) return direct;

  const baseCandidates = [
    item.baseName,
    item.baseType,
    item.baseSubType,
  ].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  for (const base of baseCandidates) {
    const suffix = `, ${base}`;
    if (!item.name.endsWith(suffix)) continue;
    const prefix = item.name.slice(0, -suffix.length);
    const translatedPrefix =
      translatedByName(
        translations,
        prefix,
        translations.itemNamesByEnglishName,
      ) ?? prefix;
    const translatedBase =
      translatedByName(
        translations,
        base,
        translations.itemNamesByEnglishName,
      ) ?? base;
    return `${translatedPrefix}, ${translatedBase}`;
  }

  return item.name;
};

const itemTooltipClassPhrasesKo: Record<string, string> = {
  AMULET: "목걸이",
  RING: "반지",
  BELT: "허리띠",
  JEWEL: "주얼",
  FLASK: "플라스크",
  CHARM: "호신부",
  BODY_ARMOUR: "갑옷",
  BOOTS: "장화",
  GLOVES: "장갑",
  HELMET: "투구",
  QUIVER: "화살통",
  SHIELD: "방패",
  WEAPON: "무기",
};

const translateItemContextLine = (
  text: string,
  item: PobItemSummary | PobItemDbSummary | undefined,
  translations: PobRepoeTranslationsSnapshot,
): string | null => {
  if (!item) return null;
  if (text === item.name || text === item.title) {
    return translatedItemName(item, translations);
  }
  if (
    text === item.baseName ||
    text === item.baseType ||
    text === item.baseSubType
  ) {
    return translatedBaseName(item, translations) ?? text;
  }

  if (item.baseSubType && text === item.baseSubType.toUpperCase()) {
    return (
      itemTooltipClassPhrasesKo[text] ??
      translateDisplayText(item.baseSubType, translations)
    );
  }

  for (const value of [item.baseName, item.baseType]) {
    if (value && text === value.toUpperCase()) {
      return translatedBaseName(item, translations) ?? text;
    }
  }

  return null;
};

const translateItemTooltipComparisonHeader = (
  text: string,
  translations: PobRepoeTranslationsSnapshot,
): string | null => {
  const remove = /^Removing this item from (.+) will give you:$/i.exec(text);
  if (remove) {
    return `${translateDisplayText(
      remove[1],
      translations,
    )}에서 이 아이템을 제거하면 다음 변화가 적용됩니다:`;
  }

  const equip = /^Equipping this item in (.+) will give you:$/i.exec(text);
  if (equip) {
    return `${translateDisplayText(
      equip[1],
      translations,
    )}에 이 아이템을 장착하면 다음 변화가 적용됩니다:`;
  }

  return null;
};

const translateItemTooltipComparisonLine = (
  text: string,
  translations: PobRepoeTranslationsSnapshot,
): string | null => {
  const match = /^([A-Za-z][A-Za-z .]+):\s*(.+)$/.exec(text);
  if (!match) return null;

  const translatedLabel = translatePobDisplayPhrase(match[1], translations);
  if (!translatedLabel || translatedLabel === match[1]) return null;

  return `${translatedLabel}: ${match[2]}`;
};

const translateItemTooltipLineText = (
  text: string,
  translations: PobRepoeTranslationsSnapshot,
  item?: PobItemSummary | PobItemDbSummary,
): string =>
  translateItemContextLine(text, item, translations) ??
  itemTooltipClassPhrasesKo[text] ??
  translateItemTooltipComparisonHeader(text, translations) ??
  translateItemTooltipComparisonLine(text, translations) ??
  translateDisplayText(text, translations);

const translatedBaseName = (
  item: PobItemSummary | PobItemDbSummary,
  translations: PobRepoeTranslationsSnapshot,
): string | null =>
  translatedByName(
    translations,
    item.baseName,
    translations.itemNamesByEnglishName,
  ) ??
  translatedByName(
    translations,
    item.baseType,
    translations.itemNamesByEnglishName,
  ) ??
  item.baseName;

export function translateBuildSummary(
  summary: PobBuildSummary,
  translations: PobRepoeTranslationsSnapshot,
): PobBuildSummary {
  if (!shouldApplyDisplayTranslations(translations)) return summary;
  return {
    ...summary,
    className: translateDisplayText(summary.className, translations),
    ascendClassName: translateDisplayText(
      summary.ascendClassName,
      translations,
    ),
    mainSkillName: translateNullableDisplayText(
      summary.mainSkillName,
      translations,
    ),
  };
}

export function translateBuildMetadataSnapshot(
  snapshot: PobBuildMetadataSnapshot,
  translations: PobRepoeTranslationsSnapshot,
): PobBuildMetadataSnapshot {
  if (!shouldApplyDisplayTranslations(translations)) return snapshot;
  return {
    ...snapshot,
    className: translateNullableDisplayText(snapshot.className, translations),
    ascendClassName: translateNullableDisplayText(
      snapshot.ascendClassName,
      translations,
    ),
    classes: snapshot.classes.map((classOption) => ({
      ...classOption,
      label: translateDisplayText(classOption.label, translations),
      ascendancies: classOption.ascendancies.map((ascendancy) => ({
        ...ascendancy,
        label: translateDisplayText(ascendancy.label, translations),
      })),
    })),
  };
}

export function translateMainSkillSummarySnapshot(
  snapshot: PobMainSkillSummarySnapshot,
  translations: PobRepoeTranslationsSnapshot,
): PobMainSkillSummarySnapshot {
  if (!shouldApplyDisplayTranslations(translations)) return snapshot;
  return {
    ...snapshot,
    socketGroupLabel: translateCompositeDisplayText(
      snapshot.socketGroupLabel,
      translations,
    ),
    mainSkillLabel: translateNullableDisplayText(
      snapshot.mainSkillLabel,
      translations,
    ),
    rows: snapshot.rows.map((row) => ({
      ...row,
      label: translateNullableDisplayText(row.label, translations),
      value: translateNullableDisplayText(row.value, translations),
      text: translateNullableDisplayText(row.text, translations),
    })),
    warnings: snapshot.warnings.map((warning) =>
      translateDisplayText(warning, translations),
    ),
  };
}

export function translateTreeSnapshot(
  snapshot: PobTreeSnapshot,
  translations: PobRepoeTranslationsSnapshot,
): PobTreeSnapshot {
  if (!shouldApplyDisplayTranslations(translations)) return snapshot;
  let translationsBySnapshot = treeSnapshotTranslationCache.get(snapshot);
  if (!translationsBySnapshot) {
    translationsBySnapshot = new WeakMap();
    treeSnapshotTranslationCache.set(snapshot, translationsBySnapshot);
  }
  const cached = translationsBySnapshot.get(translations);
  if (cached) return cached;

  const translated = {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      ...translateTreeNodeText(snapshot.treeVersion, node, translations),
    })),
  };
  translationsBySnapshot.set(translations, translated);
  return translated;
}

const translateTreeNodeText = (
  treeVersion: string | null,
  node: PobTreeNode,
  translations: PobRepoeTranslationsSnapshot,
): Pick<PobTreeNode, "name" | "statLines"> => {
  let cache = treeNodeTextTranslationCache.get(translations);
  if (!cache) {
    cache = new Map();
    treeNodeTextTranslationCache.set(translations, cache);
  }

  const key = [
    treeVersion ?? "",
    node.id,
    node.name ?? "",
    ...(node.statLines ?? []),
  ].join("\u001f");
  const cached = cache.get(key);
  if (cached) return cached;

  const translated = {
    name: translations.nodeNamesById[String(node.id)] ?? node.name,
    statLines:
      translations.nodeStatLinesById[String(node.id)] ??
      translateStatLines(node.statLines ?? [], translations),
  };
  cache.set(key, translated);
  return translated;
};

export function translateItemSummary<
  T extends PobItemSummary | PobItemDbSummary,
>(item: T, translations: PobRepoeTranslationsSnapshot): T {
  if (!shouldApplyDisplayTranslations(translations)) return item;
  return {
    ...item,
    name: translatedItemName(item, translations),
    baseName: translatedBaseName(item, translations),
    implicitLines: translateStatLines(item.implicitLines, translations),
    explicitLines: translateStatLines(item.explicitLines, translations),
    title:
      translatedByName(
        translations,
        item.title,
        translations.itemNamesByEnglishName,
      ) ?? item.title,
  };
}

export function translateItemsSnapshot(
  snapshot: PobItemsSnapshot,
  translations: PobRepoeTranslationsSnapshot,
): PobItemsSnapshot {
  if (!shouldApplyDisplayTranslations(translations)) return snapshot;
  return {
    ...snapshot,
    items: snapshot.items.map((item) =>
      translateItemSummary(item, translations),
    ),
    sharedItems: snapshot.sharedItems.map((item) =>
      translateItemSummary(item, translations),
    ),
  };
}

export function translateItemDbEntries(
  entries: PobItemDbSummary[],
  translations: PobRepoeTranslationsSnapshot,
): PobItemDbSummary[] {
  if (!shouldApplyDisplayTranslations(translations)) return entries;
  return entries.map((entry) => translateItemSummary(entry, translations));
}

const searchableText = (
  item: PobItemSummary | PobItemDbSummary | undefined,
): string[] => {
  if (!item) return [];
  return [
    String(item.id),
    item.name,
    item.baseName,
    item.baseType,
    item.baseSubType,
    item.title,
    item.raw,
    ...item.implicitLines,
    ...item.explicitLines,
  ].flatMap((value) =>
    typeof value === "string" && value.trim() ? [value] : [],
  );
};

export interface PobTextRange {
  start: number;
  end: number;
}

export type PobSearchMatchedField = "localized" | "sourceEnglish" | null;

export interface PobSearchLabelProjection {
  localizedLabel: string;
  sourceEnglishLabel: string | null;
  showSourceEnglish: boolean;
  localizedHighlightRanges: PobTextRange[];
  sourceEnglishHighlightRanges: PobTextRange[];
  matchedField: PobSearchMatchedField;
}

export interface PobItemDbEntrySearchView {
  entry: PobItemDbSummary;
  sourceEntry: PobItemDbSummary | null;
  name: PobSearchLabelProjection;
  base: PobSearchLabelProjection;
}

export interface PobGemCatalogEntrySearchView {
  entry: PobSkillGemCatalogEntry;
  sourceEntry: PobSkillGemCatalogEntry;
  name: PobSearchLabelProjection;
}

const normalizedSearchText = (value: string): string =>
  value.trim().toLocaleLowerCase();

const findSearchRanges = (value: string, query: string): PobTextRange[] => {
  const needle = normalizedSearchText(query);
  if (!needle) return [];

  const haystack = value.toLocaleLowerCase();
  const ranges: PobTextRange[] = [];
  let cursor = 0;
  while (cursor < haystack.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index === -1) break;
    ranges.push({ start: index, end: index + needle.length });
    cursor = index + Math.max(needle.length, 1);
  }
  return ranges;
};

export function projectSearchLabel(
  localizedLabel: string,
  sourceEnglishLabel: string | null | undefined,
  query: string,
  locale: PobRepoeTranslationsSnapshot["locale"],
): PobSearchLabelProjection {
  const sourceLabel = sourceEnglishLabel?.trim() || null;
  const localizedHighlightRanges = findSearchRanges(localizedLabel, query);
  const sourceEnglishHighlightRanges = sourceLabel
    ? findSearchRanges(sourceLabel, query)
    : [];
  const sameLabel =
    sourceLabel !== null &&
    normalizedSearchText(localizedLabel) === normalizedSearchText(sourceLabel);
  const sourceMatched = sourceEnglishHighlightRanges.length > 0;
  const localizedMatched = localizedHighlightRanges.length > 0;
  const showSourceEnglish =
    locale !== "en" && sourceLabel !== null && sourceMatched && !sameLabel;

  return {
    localizedLabel,
    sourceEnglishLabel: sourceLabel,
    showSourceEnglish,
    localizedHighlightRanges,
    sourceEnglishHighlightRanges,
    matchedField: localizedMatched
      ? "localized"
      : sourceMatched
        ? "sourceEnglish"
        : null,
  };
}

const itemBaseLabel = (
  item: PobItemSummary | PobItemDbSummary | undefined,
): string => item?.baseName ?? item?.baseType ?? "";

const stripDbNameBaseSuffix = (name: string, baseLabel: string): string => {
  const suffix = `, ${baseLabel}`;
  return baseLabel && name.endsWith(suffix)
    ? name.slice(0, -suffix.length)
    : name;
};

const itemDbNameLabel = (
  item: PobItemSummary | PobItemDbSummary | undefined,
): string => {
  if (!item) return "";
  return stripDbNameBaseSuffix(item.name, itemBaseLabel(item));
};

export function filterTranslatedItemDbEntryViews(
  displayEntries: PobItemDbSummary[],
  sourceEntries: PobItemDbSummary[],
  query: string,
  locale: PobRepoeTranslationsSnapshot["locale"],
): PobItemDbEntrySearchView[] {
  const needle = normalizedSearchText(query);
  const sourceById = new Map(sourceEntries.map((entry) => [entry.id, entry]));

  return displayEntries
    .map((entry) => {
      const sourceEntry = sourceById.get(entry.id) ?? null;
      return {
        entry,
        sourceEntry,
        name: projectSearchLabel(
          itemDbNameLabel(entry),
          itemDbNameLabel(sourceEntry ?? undefined),
          query,
          locale,
        ),
        base: projectSearchLabel(
          itemBaseLabel(entry),
          itemBaseLabel(sourceEntry ?? undefined),
          query,
          locale,
        ),
      };
    })
    .filter((view) => {
      if (!needle) return true;
      return [
        ...searchableText(view.entry),
        ...searchableText(view.sourceEntry ?? undefined),
      ]
        .join("\n")
        .toLocaleLowerCase()
        .includes(needle);
    });
}

export function filterTranslatedItemDbEntries(
  displayEntries: PobItemDbSummary[],
  sourceEntries: PobItemDbSummary[],
  query: string,
): PobItemDbSummary[] {
  return filterTranslatedItemDbEntryViews(
    displayEntries,
    sourceEntries,
    query,
    "ko",
  ).map((view) => view.entry);
}

const searchableGemText = (
  entry: PobSkillGemCatalogEntry | undefined,
): string[] => {
  if (!entry) return [];
  return [entry.id, entry.name, entry.tagString].flatMap((value) =>
    typeof value === "string" && value.trim() ? [value] : [],
  );
};

export function filterTranslatedGemCatalogEntryViews(
  displayEntries: PobSkillGemCatalogEntry[],
  sourceEntries: PobSkillGemCatalogEntry[],
  query: string,
  locale: PobRepoeTranslationsSnapshot["locale"],
): PobGemCatalogEntrySearchView[] {
  const needle = normalizedSearchText(query);
  const sourceById = new Map(sourceEntries.map((entry) => [entry.id, entry]));
  const displayById = new Map(displayEntries.map((entry) => [entry.id, entry]));
  const ids = [
    ...new Set([
      ...displayEntries.map((entry) => entry.id),
      ...sourceEntries.map((entry) => entry.id),
    ]),
  ];

  return ids
    .flatMap((id): PobGemCatalogEntrySearchView[] => {
      const sourceEntry = sourceById.get(id);
      const entry = displayById.get(id) ?? sourceEntry;
      if (!entry || !sourceEntry) return [];
      return [
        {
          entry,
          sourceEntry,
          name: projectSearchLabel(entry.name, sourceEntry.name, query, locale),
        },
      ];
    })
    .filter((view) => {
      if (!needle) return true;
      return [
        ...searchableGemText(view.entry),
        ...searchableGemText(view.sourceEntry),
      ]
        .join("\n")
        .toLocaleLowerCase()
        .includes(needle);
    });
}

const translatedGemName = (
  gem: PobSkillGem,
  translations: PobRepoeTranslationsSnapshot,
): string =>
  translatedByName(translations, gem.gemId, translations.gemNamesById) ??
  translatedByName(translations, gem.skillId, translations.gemNamesBySkillId) ??
  translatedByName(
    translations,
    gem.displayName,
    translations.gemNamesByEnglishName,
  ) ??
  translatedByName(
    translations,
    gem.nameSpec,
    translations.gemNamesByEnglishName,
  ) ??
  gem.displayName;

const translateGemCatalogEntry = (
  entry: PobSkillGemCatalogEntry,
  translations: PobRepoeTranslationsSnapshot,
): PobSkillGemCatalogEntry => ({
  ...entry,
  name:
    translatedByName(translations, entry.id, translations.gemNamesById) ??
    translatedByName(
      translations,
      entry.name,
      translations.gemNamesByEnglishName,
    ) ??
    entry.name,
});

const translateCompositeSkillGroupLabel = (
  group: PobSkillGroup,
  translations: PobRepoeTranslationsSnapshot,
): string => {
  const direct =
    translatedByName(
      translations,
      group.displayLabel,
      translations.gemNamesByEnglishName,
    ) ?? translatePobDisplayPhrase(group.displayLabel, translations);
  if (direct) return direct;

  const parts = group.displayLabel.split(/\s*,\s*/);
  if (parts.length > 1) {
    const translatedParts = parts.map((part) =>
      translateDisplayText(part, translations),
    );
    if (translatedParts.some((part, index) => part !== parts[index])) {
      return translatedParts.join(", ");
    }

    const gemLabels = group.gems
      .map((gem) => translatedGemName(gem, translations))
      .filter((label) => label.trim().length > 0);
    if (gemLabels.length === parts.length) return gemLabels.join(", ");

    const activeSkillLabels = group.activeSkills
      .map((skill) => translateDisplayText(skill.label, translations))
      .filter((label) => label.trim().length > 0);
    if (activeSkillLabels.length === parts.length) {
      return activeSkillLabels.join(", ");
    }
  }

  return group.displayLabel;
};

export function translateSkillsSnapshot(
  snapshot: PobSkillsSnapshot,
  translations: PobRepoeTranslationsSnapshot,
): PobSkillsSnapshot {
  if (!shouldApplyDisplayTranslations(translations)) return snapshot;
  return {
    ...snapshot,
    groups: snapshot.groups.map((group) => ({
      ...group,
      label: translateDisplayText(group.label, translations),
      displayLabel: translateCompositeSkillGroupLabel(group, translations),
      gems: group.gems.map((gem) => ({
        ...gem,
        displayName: translatedGemName(gem, translations),
        globalEffects: gem.globalEffects.map((effect) => ({
          ...effect,
          name:
            translatedByName(
              translations,
              effect.name,
              translations.gemNamesByEnglishName,
            ) ?? effect.name,
        })),
      })),
      activeSkills: group.activeSkills.map((skill) => ({
        ...skill,
        label:
          translatedByName(
            translations,
            skill.label,
            translations.gemNamesByEnglishName,
          ) ?? skill.label,
        skillPartName:
          translatedByName(
            translations,
            skill.skillPartName,
            translations.gemNamesByEnglishName,
          ) ?? skill.skillPartName,
      })),
    })),
    availableGems: snapshot.availableGems.map((entry) =>
      translateGemCatalogEntry(entry, translations),
    ),
  };
}

export function translateCalcsSnapshot(
  snapshot: PobCalcsSnapshot,
  translations: PobRepoeTranslationsSnapshot,
): PobCalcsSnapshot {
  if (!shouldApplyDisplayTranslations(translations)) return snapshot;
  const translateDropdown = (
    dropdown: PobCalcsSnapshot["skillSelect"]["socketGroup"],
  ): PobCalcsSnapshot["skillSelect"]["socketGroup"] => ({
    ...dropdown,
    options: dropdown.options.map((option) => ({
      ...option,
      label: translateDisplayText(option.label, translations),
    })),
  });
  return {
    ...snapshot,
    skillSelect: {
      ...snapshot.skillSelect,
      socketGroup: translateDropdown(snapshot.skillSelect.socketGroup),
      mainSkill: translateDropdown(snapshot.skillSelect.mainSkill),
      statSet: translateDropdown(snapshot.skillSelect.statSet),
      skillPart: translateDropdown(snapshot.skillSelect.skillPart),
      minion: translateDropdown(snapshot.skillSelect.minion),
      spectreLibrary: {
        ...snapshot.skillSelect.spectreLibrary,
        label: translateDisplayText(
          snapshot.skillSelect.spectreLibrary.label,
          translations,
        ),
      },
      beastLibrary: {
        ...snapshot.skillSelect.beastLibrary,
        label: translateDisplayText(
          snapshot.skillSelect.beastLibrary.label,
          translations,
        ),
      },
      minionSkill: translateDropdown(snapshot.skillSelect.minionSkill),
      minionSkillStatSet: translateDropdown(
        snapshot.skillSelect.minionSkillStatSet,
      ),
    },
    sections: snapshot.sections.map((section) => ({
      ...section,
      subSections: section.subSections.map((subSection) => ({
        ...subSection,
        label: translateDisplayText(subSection.label, translations),
        extra: translateNullableDisplayText(subSection.extra, translations),
        extraRichText:
          subSection.extraRichText?.map((run) => ({
            ...run,
            text: translateDisplayText(run.text, translations),
          })) ?? subSection.extraRichText,
        rows: subSection.rows.map((row) => ({
          ...row,
          label: translateDisplayText(row.label, translations),
          cells: row.cells.map((cell) => ({
            ...cell,
            text: translateDisplayText(cell.text, translations),
          })),
        })),
      })),
    })),
  };
}

export function translateCalcsBreakdown(
  breakdown: PobCalcsBreakdown,
  translations: PobRepoeTranslationsSnapshot,
): PobCalcsBreakdown {
  if (!shouldApplyDisplayTranslations(translations)) return breakdown;
  return {
    ...breakdown,
    sections: breakdown.sections.map((section) => {
      if (section.type === "BREAKDOWN") {
        return {
          ...section,
          data: {
            ...section.data,
            label: translateNullableDisplayText(
              section.data.label,
              translations,
            ),
            footer: translateNullableDisplayText(
              section.data.footer,
              translations,
            ),
            lines: translateStatLines(section.data.lines, translations),
            rowList:
              section.data.rowList?.map((row) =>
                Object.fromEntries(
                  Object.entries(row).map(([key, value]) => [
                    key,
                    translateDisplayText(value, translations),
                  ]),
                ),
              ) ?? null,
            colList:
              section.data.colList?.map((column) => ({
                ...column,
                label: translateDisplayText(column.label, translations),
              })) ?? null,
          },
        };
      }
      return {
        ...section,
        data: {
          ...section.data,
          label: translateDisplayText(section.data.label, translations),
          modName: translateStatLines(section.data.modName, translations),
          entries: section.data.entries.map((entry) => ({
            ...entry,
            name: translateNullableDisplayText(entry.name, translations),
            source: translateNullableDisplayText(entry.source, translations),
            sourceLine: translateNullableDisplayText(
              entry.sourceLine,
              translations,
            ),
          })),
        },
      };
    }),
  };
}

export function translateConfigSnapshot(
  snapshot: PobConfigSnapshot,
  translations: PobRepoeTranslationsSnapshot,
): PobConfigSnapshot {
  if (!shouldApplyDisplayTranslations(translations)) return snapshot;
  return {
    ...snapshot,
    sections: snapshot.sections.map((section) => ({
      ...section,
      label: translateMultilineDisplayText(section.label, translations),
      options: section.options.map((option) => ({
        ...option,
        label: translateMultilineDisplayText(option.label, translations),
        tooltip:
          option.tooltip == null
            ? null
            : translateMultilineDisplayText(option.tooltip, translations),
        options: option.options.map((entry) => ({
          ...entry,
          label: translateMultilineDisplayText(entry.label, translations),
        })),
      })),
    })),
  };
}

const translateTooltipLines = (
  lines: PobTreeTooltipLine[],
  translations: PobRepoeTranslationsSnapshot,
): PobTreeTooltipLine[] => {
  if (!shouldApplyDisplayTranslations(translations)) return lines;
  return lines.map((line) =>
    line.kind === "line"
      ? { ...line, text: translateDisplayText(line.text, translations) }
      : line,
  );
};

const translateSkillsGemTooltipLines = (
  lines: PobTreeTooltipLine[],
  translations: PobRepoeTranslationsSnapshot,
): PobTreeTooltipLine[] => {
  if (!shouldApplyDisplayTranslations(translations)) return lines;
  return lines.map((line) =>
    line.kind === "line"
      ? { ...line, text: translateSkillsGemLineText(line.text, translations) }
      : line,
  );
};

export function translateTreeNodeTooltip(
  tooltip: PobTreeNodeTooltip,
  translations: PobRepoeTranslationsSnapshot,
): PobTreeNodeTooltip {
  if (!shouldApplyDisplayTranslations(translations)) return tooltip;
  return {
    ...tooltip,
    header: translateNullableDisplayText(tooltip.header, translations),
    lines: translateTooltipLines(tooltip.lines, translations),
  };
}

export function translateItemTooltip(
  tooltip: PobItemsTooltip,
  translations: PobRepoeTranslationsSnapshot,
  item?: PobItemSummary | PobItemDbSummary,
): PobItemsTooltip {
  if (!shouldApplyDisplayTranslations(translations)) return tooltip;
  return {
    ...tooltip,
    header: translateNullableDisplayText(tooltip.header, translations),
    lines: tooltip.lines.map((line) =>
      line.kind === "line"
        ? {
            ...line,
            text: translateItemTooltipLineText(line.text, translations, item),
          }
        : line,
    ),
  };
}

export function translateSkillsGemTooltip(
  tooltip: PobSkillsGemTooltip,
  translations: PobRepoeTranslationsSnapshot,
): PobSkillsGemTooltip {
  if (!shouldApplyDisplayTranslations(translations)) return tooltip;
  return {
    ...tooltip,
    header: translateNullableDisplayText(tooltip.header, translations),
    lines: translateSkillsGemTooltipLines(tooltip.lines, translations),
  };
}
