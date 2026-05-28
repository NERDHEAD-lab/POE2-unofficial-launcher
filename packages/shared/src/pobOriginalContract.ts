import type {
  PobBuildMetadataActionResult,
  PobBuildMetadataSnapshot,
  PobCalcsBreakdown,
  PobCalcsSnapshot,
  PobItemsDbList,
  PobItemsSnapshot,
  PobItemsTooltip,
  PobMainSkillSummarySnapshot,
  PobPartySnapshot,
  PobSkillsGemTooltip,
  PobSkillsSnapshot,
  PobTreeNodeTooltip,
  PobTreeSnapshot,
} from "./types";

export const POB_ORIGINAL_ITEM_RARITIES = [
  "NORMAL",
  "MAGIC",
  "RARE",
  "UNIQUE",
  "RELIC",
] as const;

export type PobOriginalItemRarity = (typeof POB_ORIGINAL_ITEM_RARITIES)[number];

export const POB_ORIGINAL_ITEMS_DB_KEYS = ["uniqueDB", "rareDB"] as const;

export type PobOriginalItemsDbKey = (typeof POB_ORIGINAL_ITEMS_DB_KEYS)[number];

export const POB_ORIGINAL_SKILL_GEM_COLORS = [
  "strength",
  "dexterity",
  "intelligence",
  "normal",
] as const;

export type PobOriginalSkillGemColor =
  (typeof POB_ORIGINAL_SKILL_GEM_COLORS)[number];

export const POB_ORIGINAL_SKILL_DEFAULT_GEM_LEVELS = [
  "normalMaximum",
  "corruptedMaximum",
  "awakenedMaximum",
  "characterLevel",
] as const;

export type PobOriginalSkillDefaultGemLevel =
  (typeof POB_ORIGINAL_SKILL_DEFAULT_GEM_LEVELS)[number];

export const POB_ORIGINAL_SKILL_SUPPORT_GEM_TYPES = [
  "ALL",
  "NORMAL",
  "AWAKENED",
] as const;

export type PobOriginalSkillSupportGemType =
  (typeof POB_ORIGINAL_SKILL_SUPPORT_GEM_TYPES)[number];

export const POB_ORIGINAL_SKILL_SORT_GEM_FIELDS = [
  "FullDPS",
  "CombinedDPS",
  "TotalDPS",
  "AverageDamage",
  "TotalDot",
  "BleedDPS",
  "IgniteDPS",
  "TotalPoisonDPS",
  "TotalEHP",
] as const;

export type PobOriginalSkillSortGemField =
  (typeof POB_ORIGINAL_SKILL_SORT_GEM_FIELDS)[number];

export const POB_ORIGINAL_CALCS_COLOURS = [
  "OFFENCE",
  "DEFENCE",
  "LIFE",
  "MANA",
  "SPIRIT",
  "ES",
  "ARMOUR",
  "EVASION",
  "FIRE",
  "COLD",
  "LIGHTNING",
  "CHAOS",
  "POSITIVE",
  "NEGATIVE",
  "NORMAL",
  "PHYS",
  "RAGE",
  "ENCHANTED",
  "RELIC",
  "TIP",
  "WARNING",
] as const;

export type PobOriginalCalcsColour =
  (typeof POB_ORIGINAL_CALCS_COLOURS)[number];

export const POB_ORIGINAL_TREE_TOOLTIP_COLOURS = [
  ...POB_ORIGINAL_CALCS_COLOURS,
  "GEM",
  "MAGIC",
  "RARE",
  "UNIQUE",
  "CUSTOM",
  "SOURCE",
  "GOLD",
  "MUTED",
] as const;

export type PobOriginalTreeTooltipColour =
  (typeof POB_ORIGINAL_TREE_TOOLTIP_COLOURS)[number];

export const POB_ORIGINAL_CALCS_BUFF_MODES = [
  "UNBUFFED",
  "BUFFED",
  "COMBAT",
  "EFFECTIVE",
] as const;

export type PobOriginalCalcsBuffMode =
  (typeof POB_ORIGINAL_CALCS_BUFF_MODES)[number];

export const POB_ORIGINAL_CALCS_BUFF_MODE_LABELS = {
  UNBUFFED: "Unbuffed",
  BUFFED: "Buffed",
  COMBAT: "In Combat",
  EFFECTIVE: "Effective DPS",
} as const satisfies Record<PobOriginalCalcsBuffMode, string>;

export const POB_ORIGINAL_CALCS_GROUP_FILTERS = {
  all: null,
  offence: 1,
  resources: 2,
  defence: 3,
} as const;

export type PobOriginalCalcsGroup = Exclude<
  (typeof POB_ORIGINAL_CALCS_GROUP_FILTERS)[keyof typeof POB_ORIGINAL_CALCS_GROUP_FILTERS],
  null
>;

export type PobOriginalCalcsGroupFilter =
  keyof typeof POB_ORIGINAL_CALCS_GROUP_FILTERS;

export const POB_ORIGINAL_CONFIG_OPTION_KINDS = [
  "label",
  "check",
  "list",
  "count",
  "integer",
  "countAllowZero",
  "float",
  "text",
] as const;

export type PobOriginalConfigOptionKind =
  (typeof POB_ORIGINAL_CONFIG_OPTION_KINDS)[number];

export const POB_ORIGINAL_BUILD_MODES = [
  "tree",
  "skills",
  "items",
  "calcs",
  "party",
] as const;

export type PobOriginalBuildMode = (typeof POB_ORIGINAL_BUILD_MODES)[number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const fail = (path: string, expected: string): never => {
  throw new Error(`${path} must be ${expected}`);
};

function assertRecord(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(path, "an object");
}

const assertKnownKeys = (
  value: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
): void => {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) fail(`${path}.${key}`, "a known PoB field");
  }
};

function assertArray(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value)) fail(path, "an array");
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") fail(path, "a string");
}

function assertNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "a finite number");
  }
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== "boolean") fail(path, "a boolean");
}

const assertOptionalBoolean = (value: unknown, path: string): void => {
  if (value !== undefined && typeof value !== "boolean") {
    fail(path, "a boolean");
  }
};

const assertNullableString = (value: unknown, path: string): void => {
  if (value !== null && typeof value !== "string") fail(path, "a string|null");
};

const assertNullableNumber = (value: unknown, path: string): void => {
  if (
    value !== null &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    fail(path, "a finite number|null");
  }
};

const assertNullableRecord = (value: unknown, path: string): void => {
  if (value !== null && !isRecord(value)) fail(path, "an object|null");
};

const assertOptionalNullableString = (value: unknown, path: string): void => {
  if (value !== undefined) assertNullableString(value, path);
};

const assertOptionalNullableNumber = (value: unknown, path: string): void => {
  if (value !== undefined) assertNullableNumber(value, path);
};

const itemRarities = new Set<string>(POB_ORIGINAL_ITEM_RARITIES);
const itemDbKeys = new Set<string>(POB_ORIGINAL_ITEMS_DB_KEYS);
const skillGemColours = new Set<string>(POB_ORIGINAL_SKILL_GEM_COLORS);
const skillDefaultGemLevels = new Set<string>(
  POB_ORIGINAL_SKILL_DEFAULT_GEM_LEVELS,
);
const skillSupportGemTypes = new Set<string>(
  POB_ORIGINAL_SKILL_SUPPORT_GEM_TYPES,
);
const skillSortGemFields = new Set<string>(POB_ORIGINAL_SKILL_SORT_GEM_FIELDS);
const calcsColours = new Set<string>(POB_ORIGINAL_CALCS_COLOURS);
const treeTooltipColours = new Set<string>(POB_ORIGINAL_TREE_TOOLTIP_COLOURS);
const calcsBuffModes = new Set<string>(POB_ORIGINAL_CALCS_BUFF_MODES);
const calcsGroups = new Set<number>();
for (const value of Object.values(POB_ORIGINAL_CALCS_GROUP_FILTERS)) {
  if (value !== null) calcsGroups.add(value);
}
const skillsTooltipModes = new Set<string>(["gem", "quality", "enabled"]);

const assertStringArray = (value: unknown, path: string): void => {
  assertArray(value, path);
  value.forEach((entry, index) => assertString(entry, `${path}[${index}]`));
};

const assertNumberArray = (value: unknown, path: string): void => {
  assertArray(value, path);
  value.forEach((entry, index) => assertNumber(entry, `${path}[${index}]`));
};

const assertTreeArt = (value: unknown, path: string): void => {
  if (value === undefined || value === null) return;
  assertRecord(value, path);
  assertKnownKeys(value, path, ["alloc", "unalloc", "path"]);
  assertOptionalNullableString(value.alloc, `${path}.alloc`);
  assertOptionalNullableString(value.unalloc, `${path}.unalloc`);
  assertOptionalNullableString(value.path, `${path}.path`);
};

const assertTreeDimensions = (value: unknown, path: string): void => {
  if (value === undefined || value === null) return;
  assertRecord(value, path);
  assertKnownKeys(value, path, ["width", "height"]);
  assertOptionalNullableNumber(value.width, `${path}.width`);
  assertOptionalNullableNumber(value.height, `${path}.height`);
};

const assertTreeTargetSize = (value: unknown, path: string): void => {
  if (value === undefined || value === null) return;
  assertRecord(value, path);
  assertKnownKeys(value, path, ["width", "height", "overlay", "effect"]);
  assertOptionalNullableNumber(value.width, `${path}.width`);
  assertOptionalNullableNumber(value.height, `${path}.height`);
  assertTreeDimensions(value.overlay, `${path}.overlay`);
  assertTreeDimensions(value.effect, `${path}.effect`);
};

const assertTooltipLines = (value: unknown, path: string): void => {
  assertArray(value, path);
  value.forEach((line, index) => {
    const linePath = `${path}[${index}]`;
    assertRecord(line, linePath);
    assertKnownKeys(line, linePath, ["kind", "text", "colour", "size"]);
    assertString(line.kind, `${linePath}.kind`);
    if (line.kind !== "line" && line.kind !== "separator") {
      fail(`${linePath}.kind`, "a tooltip line kind");
    }
    assertString(line.text, `${linePath}.text`);
    const colour = line.colour;
    assertNullableString(colour, `${linePath}.colour`);
    if (typeof colour === "string" && !treeTooltipColours.has(colour)) {
      fail(`${linePath}.colour`, "a PoB tooltip colour");
    }
    assertNullableNumber(line.size, `${linePath}.size`);
  });
};

const assertItemSummary = (
  value: unknown,
  path: string,
  expectedIdType: "number" | "string",
): void => {
  assertRecord(value, path);
  assertKnownKeys(value, path, [
    "id",
    "raw",
    "name",
    "rarity",
    "baseName",
    "title",
    "itemLevel",
    "quality",
    "corrupted",
    "mirrored",
    "shaper",
    "elder",
    "fractured",
    "influences",
    "baseType",
    "baseSubType",
    "implicitLines",
    "explicitLines",
  ]);
  if (expectedIdType === "number") assertNumber(value.id, `${path}.id`);
  else assertString(value.id, `${path}.id`);
  assertString(value.raw, `${path}.raw`);
  assertString(value.name, `${path}.name`);
  assertString(value.rarity, `${path}.rarity`);
  if (!itemRarities.has(value.rarity)) fail(`${path}.rarity`, "a PoB rarity");
  assertNullableString(value.baseName, `${path}.baseName`);
  assertNullableString(value.title, `${path}.title`);
  assertNullableNumber(value.itemLevel, `${path}.itemLevel`);
  assertNullableNumber(value.quality, `${path}.quality`);
  assertBoolean(value.corrupted, `${path}.corrupted`);
  assertBoolean(value.mirrored, `${path}.mirrored`);
  assertBoolean(value.shaper, `${path}.shaper`);
  assertBoolean(value.elder, `${path}.elder`);
  assertBoolean(value.fractured, `${path}.fractured`);
  assertNullableRecord(value.influences, `${path}.influences`);
  assertNullableString(value.baseType, `${path}.baseType`);
  assertNullableString(value.baseSubType, `${path}.baseSubType`);
  assertStringArray(value.implicitLines, `${path}.implicitLines`);
  assertStringArray(value.explicitLines, `${path}.explicitLines`);
};

export function assertPobTreeSnapshot(
  value: unknown,
): asserts value is PobTreeSnapshot {
  assertRecord(value, "tree");
  assertKnownKeys(value, "tree", [
    "treeVersion",
    "classId",
    "className",
    "ascendClassId",
    "ascendClassName",
    "allocCount",
    "viewport",
    "treeSize",
    "nodes",
  ]);
  assertNullableString(value.treeVersion, "tree.treeVersion");
  assertNullableNumber(value.classId, "tree.classId");
  assertNullableString(value.className, "tree.className");
  assertNullableNumber(value.ascendClassId, "tree.ascendClassId");
  assertNullableString(value.ascendClassName, "tree.ascendClassName");
  assertNumber(value.allocCount, "tree.allocCount");
  if (value.viewport !== null) {
    assertRecord(value.viewport, "tree.viewport");
    assertKnownKeys(value.viewport, "tree.viewport", [
      "minX",
      "minY",
      "maxX",
      "maxY",
    ]);
    assertNumber(value.viewport.minX, "tree.viewport.minX");
    assertNumber(value.viewport.minY, "tree.viewport.minY");
    assertNumber(value.viewport.maxX, "tree.viewport.maxX");
    assertNumber(value.viewport.maxY, "tree.viewport.maxY");
  }
  assertNullableNumber(value.treeSize, "tree.treeSize");
  assertArray(value.nodes, "tree.nodes");
  value.nodes.forEach((node, index) => {
    const path = `tree.nodes[${index}]`;
    assertRecord(node, path);
    assertKnownKeys(node, path, [
      "id",
      "x",
      "y",
      "name",
      "statLines",
      "type",
      "ascendancyName",
      "isAscendancyStart",
      "isKeystone",
      "isNotable",
      "isSocket",
      "isMastery",
      "isOnlyImage",
      "alloc",
      "icon",
      "activeEffectImage",
      "overlay",
      "targetSize",
      "linked",
    ]);
    assertNumber(node.id, `${path}.id`);
    assertNumber(node.x, `${path}.x`);
    assertNumber(node.y, `${path}.y`);
    assertNullableString(node.name, `${path}.name`);
    if (node.statLines !== undefined) {
      assertStringArray(node.statLines, `${path}.statLines`);
    }
    assertNullableString(node.type, `${path}.type`);
    assertNullableString(node.ascendancyName, `${path}.ascendancyName`);
    assertBoolean(node.isAscendancyStart, `${path}.isAscendancyStart`);
    assertBoolean(node.alloc, `${path}.alloc`);
    assertBoolean(node.isKeystone, `${path}.isKeystone`);
    assertBoolean(node.isNotable, `${path}.isNotable`);
    assertBoolean(node.isSocket, `${path}.isSocket`);
    assertBoolean(node.isMastery, `${path}.isMastery`);
    assertBoolean(node.isOnlyImage, `${path}.isOnlyImage`);
    assertOptionalNullableString(node.icon, `${path}.icon`);
    assertOptionalNullableString(
      node.activeEffectImage,
      `${path}.activeEffectImage`,
    );
    assertTreeArt(node.overlay, `${path}.overlay`);
    assertTreeTargetSize(node.targetSize, `${path}.targetSize`);
    assertNumberArray(node.linked, `${path}.linked`);
  });
}

export function assertPobTreeNodeTooltip(
  value: unknown,
): asserts value is PobTreeNodeTooltip {
  assertRecord(value, "treeTooltip");
  assertKnownKeys(value, "treeTooltip", ["nodeId", "header", "lines"]);
  assertNumber(value.nodeId, "treeTooltip.nodeId");
  assertNullableString(value.header, "treeTooltip.header");
  assertTooltipLines(value.lines, "treeTooltip.lines");
}

export function assertPobSkillsGemTooltip(
  value: unknown,
): asserts value is PobSkillsGemTooltip {
  assertRecord(value, "skillsGemTooltip");
  assertKnownKeys(value, "skillsGemTooltip", [
    "groupIndex",
    "gemIndex",
    "mode",
    "header",
    "lines",
  ]);
  assertNumber(value.groupIndex, "skillsGemTooltip.groupIndex");
  assertNumber(value.gemIndex, "skillsGemTooltip.gemIndex");
  assertString(value.mode, "skillsGemTooltip.mode");
  if (!skillsTooltipModes.has(value.mode)) {
    fail("skillsGemTooltip.mode", "a PoB skills tooltip mode");
  }
  assertNullableString(value.header, "skillsGemTooltip.header");
  assertTooltipLines(value.lines, "skillsGemTooltip.lines");
}

export function assertPobItemsSnapshot(
  value: unknown,
): asserts value is PobItemsSnapshot {
  assertRecord(value, "items");
  assertKnownKeys(value, "items", [
    "activeSetId",
    "useSecondWeaponSet",
    "sets",
    "slots",
    "items",
    "sharedItems",
  ]);
  assertNumber(value.activeSetId, "items.activeSetId");
  assertBoolean(value.useSecondWeaponSet, "items.useSecondWeaponSet");
  assertArray(value.sets, "items.sets");
  value.sets.forEach((set, index) => {
    const path = `items.sets[${index}]`;
    assertRecord(set, path);
    assertKnownKeys(set, path, ["id", "title", "useSecondWeaponSet"]);
    assertNumber(set.id, `${path}.id`);
    assertString(set.title, `${path}.title`);
    assertBoolean(set.useSecondWeaponSet, `${path}.useSecondWeaponSet`);
  });
  assertArray(value.slots, "items.slots");
  value.slots.forEach((slot, index) => {
    const path = `items.slots[${index}]`;
    assertRecord(slot, path);
    assertKnownKeys(slot, path, [
      "name",
      "label",
      "slotType",
      "weaponSet",
      "nodeId",
      "selItemId",
      "visible",
      "active",
      "canActivate",
      "validItemIds",
    ]);
    assertString(slot.name, `${path}.name`);
    assertString(slot.label, `${path}.label`);
    assertNullableString(slot.slotType, `${path}.slotType`);
    assertNullableNumber(slot.weaponSet, `${path}.weaponSet`);
    assertNullableNumber(slot.nodeId, `${path}.nodeId`);
    assertNumber(slot.selItemId, `${path}.selItemId`);
    assertBoolean(slot.visible, `${path}.visible`);
    assertBoolean(slot.active, `${path}.active`);
    assertBoolean(slot.canActivate, `${path}.canActivate`);
    assertNumberArray(slot.validItemIds, `${path}.validItemIds`);
  });
  assertArray(value.items, "items.items");
  assertArray(value.sharedItems, "items.sharedItems");
  value.items.forEach((item, index) =>
    assertItemSummary(item, `items.items[${index}]`, "number"),
  );
  value.sharedItems.forEach((item, index) =>
    assertItemSummary(item, `items.sharedItems[${index}]`, "number"),
  );
}

export function assertPobItemsDbList(
  value: unknown,
): asserts value is PobItemsDbList {
  assertRecord(value, "itemsDb");
  assertKnownKeys(value, "itemsDb", ["entries"]);
  assertArray(value.entries, "itemsDb.entries");
  value.entries.forEach((item, index) =>
    assertItemSummary(item, `itemsDb.entries[${index}]`, "string"),
  );
}

export function assertPobItemsTooltip(
  value: unknown,
): asserts value is PobItemsTooltip {
  assertRecord(value, "itemsTooltip");
  assertKnownKeys(value, "itemsTooltip", [
    "source",
    "itemId",
    "db",
    "slotName",
    "header",
    "lines",
  ]);
  assertString(value.source, "itemsTooltip.source");
  if (
    value.source !== "custom" &&
    value.source !== "shared" &&
    value.source !== "db"
  ) {
    fail("itemsTooltip.source", "an item tooltip source");
  }
  if (typeof value.itemId !== "number" && typeof value.itemId !== "string") {
    fail("itemsTooltip.itemId", "a number|string");
  }
  const db = value.db;
  assertNullableString(db, "itemsTooltip.db");
  if (typeof db === "string" && !itemDbKeys.has(db)) {
    fail("itemsTooltip.db", "an item DB key");
  }
  assertNullableString(value.slotName, "itemsTooltip.slotName");
  assertNullableString(value.header, "itemsTooltip.header");
  assertTooltipLines(value.lines, "itemsTooltip.lines");
}

const assertSkillGemColour = (value: unknown, path: string): void => {
  assertString(value, path);
  if (!skillGemColours.has(value)) fail(path, "a gem colour");
};

const assertSkillOption = (value: unknown, path: string): void => {
  assertRecord(value, path);
  assertKnownKeys(value, path, ["label", "value"]);
  assertString(value.label, `${path}.label`);
  assertString(value.value, `${path}.value`);
};

const assertSkillOptionValues = (
  value: unknown,
  path: string,
  expectedValues: readonly string[],
): void => {
  assertArray(value, path);
  const values = value.map((option, index) => {
    assertSkillOption(option, `${path}[${index}]`);
    assertRecord(option, `${path}[${index}]`);
    return option.value;
  });
  if (values.join("|") !== expectedValues.join("|")) {
    fail(path, "PoB option value order");
  }
};

const assertCalcsDropdown = (value: unknown, path: string): void => {
  assertRecord(value, path);
  assertKnownKeys(value, path, ["selected", "shown", "enabled", "options"]);
  assertNullableNumber(value.selected, `${path}.selected`);
  assertOptionalBoolean(value.shown, `${path}.shown`);
  assertOptionalBoolean(value.enabled, `${path}.enabled`);
  assertArray(value.options, `${path}.options`);
  value.options.forEach((option, index) => {
    const optionPath = `${path}.options[${index}]`;
    assertRecord(option, optionPath);
    assertKnownKeys(option, optionPath, ["index", "label"]);
    assertNumber(option.index, `${optionPath}.index`);
    assertString(option.label, `${optionPath}.label`);
  });
};

const assertCalcsEditField = (value: unknown, path: string): void => {
  assertRecord(value, path);
  assertKnownKeys(value, path, ["value", "shown"]);
  assertNullableString(value.value, `${path}.value`);
  assertBoolean(value.shown, `${path}.shown`);
};

const assertCalcsButton = (value: unknown, path: string): void => {
  assertRecord(value, path);
  assertKnownKeys(value, path, ["label", "shown", "enabled"]);
  assertString(value.label, `${path}.label`);
  assertBoolean(value.shown, `${path}.shown`);
  assertBoolean(value.enabled, `${path}.enabled`);
};

export function assertPobSkillsSnapshot(
  value: unknown,
): asserts value is PobSkillsSnapshot {
  assertRecord(value, "skills");
  assertKnownKeys(value, "skills", [
    "activeSetId",
    "mainSocketGroup",
    "calcsSocketGroup",
    "sets",
    "groups",
    "availableGems",
    "slotOptions",
    "defaultGemLevelOptions",
    "supportGemTypeOptions",
    "sortGemFieldOptions",
    "options",
  ]);
  assertNumber(value.activeSetId, "skills.activeSetId");
  assertNumber(value.mainSocketGroup, "skills.mainSocketGroup");
  assertNumber(value.calcsSocketGroup, "skills.calcsSocketGroup");
  assertArray(value.groups, "skills.groups");
  assertArray(value.sets, "skills.sets");
  value.sets.forEach((set, index) => {
    const path = `skills.sets[${index}]`;
    assertRecord(set, path);
    assertKnownKeys(set, path, ["id", "title"]);
    assertNumber(set.id, `${path}.id`);
    assertString(set.title, `${path}.title`);
  });
  assertArray(value.availableGems, "skills.availableGems");
  value.availableGems.forEach((gem, index) => {
    const path = `skills.availableGems[${index}]`;
    assertRecord(gem, path);
    assertKnownKeys(gem, path, [
      "id",
      "name",
      "color",
      "isSupport",
      "naturalMaxLevel",
      "tagString",
    ]);
    assertString(gem.id, `${path}.id`);
    assertString(gem.name, `${path}.name`);
    assertSkillGemColour(gem.color, `${path}.color`);
    assertBoolean(gem.isSupport, `${path}.isSupport`);
    assertNullableNumber(gem.naturalMaxLevel, `${path}.naturalMaxLevel`);
    assertNullableString(gem.tagString, `${path}.tagString`);
  });
  assertArray(value.slotOptions, "skills.slotOptions");
  value.slotOptions.forEach((option, index) => {
    const path = `skills.slotOptions[${index}]`;
    assertRecord(option, path);
    assertKnownKeys(option, path, ["label", "slotName"]);
    assertString(option.label, `${path}.label`);
    if (option.slotName !== undefined) {
      assertString(option.slotName, `${path}.slotName`);
    }
  });
  assertSkillOptionValues(
    value.defaultGemLevelOptions,
    "skills.defaultGemLevelOptions",
    POB_ORIGINAL_SKILL_DEFAULT_GEM_LEVELS,
  );
  assertSkillOptionValues(
    value.supportGemTypeOptions,
    "skills.supportGemTypeOptions",
    POB_ORIGINAL_SKILL_SUPPORT_GEM_TYPES,
  );
  assertSkillOptionValues(
    value.sortGemFieldOptions,
    "skills.sortGemFieldOptions",
    POB_ORIGINAL_SKILL_SORT_GEM_FIELDS,
  );
  assertRecord(value.options, "skills.options");
  assertKnownKeys(value.options, "skills.options", [
    "sortGemsByDPS",
    "sortGemsByDPSField",
    "defaultGemLevel",
    "defaultGemQuality",
    "showSupportGemTypes",
  ]);
  assertBoolean(value.options.sortGemsByDPS, "skills.options.sortGemsByDPS");
  assertString(
    value.options.sortGemsByDPSField,
    "skills.options.sortGemsByDPSField",
  );
  if (!skillSortGemFields.has(value.options.sortGemsByDPSField)) {
    fail("skills.options.sortGemsByDPSField", "a PoB sort gem field");
  }
  assertString(value.options.defaultGemLevel, "skills.options.defaultGemLevel");
  if (!skillDefaultGemLevels.has(value.options.defaultGemLevel)) {
    fail("skills.options.defaultGemLevel", "a PoB default gem level");
  }
  assertNumber(
    value.options.defaultGemQuality,
    "skills.options.defaultGemQuality",
  );
  assertString(
    value.options.showSupportGemTypes,
    "skills.options.showSupportGemTypes",
  );
  if (!skillSupportGemTypes.has(value.options.showSupportGemTypes)) {
    fail("skills.options.showSupportGemTypes", "a PoB support gem type");
  }
  value.groups.forEach((group, index) => {
    const path = `skills.groups[${index}]`;
    assertRecord(group, path);
    assertKnownKeys(group, path, [
      "index",
      "label",
      "displayLabel",
      "slot",
      "source",
      "sourceNote",
      "enabled",
      "slotEnabled",
      "includeInFullDPS",
      "groupCount",
      "mainActiveSkill",
      "mainActiveSkillCalcs",
      "isMain",
      "canDelete",
      "noSupports",
      "gems",
      "activeSkills",
    ]);
    assertNumber(group.index, `${path}.index`);
    assertString(group.label, `${path}.label`);
    assertString(group.displayLabel, `${path}.displayLabel`);
    assertNullableString(group.slot, `${path}.slot`);
    assertNullableString(group.source, `${path}.source`);
    assertNullableString(group.sourceNote, `${path}.sourceNote`);
    assertBoolean(group.enabled, `${path}.enabled`);
    assertBoolean(group.slotEnabled, `${path}.slotEnabled`);
    assertBoolean(group.includeInFullDPS, `${path}.includeInFullDPS`);
    assertNumber(group.groupCount, `${path}.groupCount`);
    assertNumber(group.mainActiveSkill, `${path}.mainActiveSkill`);
    assertNumber(group.mainActiveSkillCalcs, `${path}.mainActiveSkillCalcs`);
    assertBoolean(group.isMain, `${path}.isMain`);
    assertBoolean(group.canDelete, `${path}.canDelete`);
    assertBoolean(group.noSupports, `${path}.noSupports`);
    assertArray(group.gems, `${path}.gems`);
    group.gems.forEach((gem, gemIndex) => {
      const gemPath = `${path}.gems[${gemIndex}]`;
      assertRecord(gem, gemPath);
      assertKnownKeys(gem, gemPath, [
        "index",
        "gemId",
        "skillId",
        "nameSpec",
        "displayName",
        "level",
        "quality",
        "enabled",
        "enableGlobal1",
        "enableGlobal2",
        "count",
        "errMsg",
        "reqLevel",
        "reqStr",
        "reqDex",
        "reqInt",
        "naturalMaxLevel",
        "color",
        "isSupport",
        "isVaal",
        "fromItem",
        "fromTree",
        "triggered",
        "countVisible",
        "canEdit",
        "canDelete",
        "globalEffects",
        "displayLevel",
        "displayQuality",
      ]);
      assertNumber(gem.index, `${gemPath}.index`);
      assertNullableString(gem.gemId, `${gemPath}.gemId`);
      assertNullableString(gem.skillId, `${gemPath}.skillId`);
      assertString(gem.nameSpec, `${gemPath}.nameSpec`);
      assertString(gem.displayName, `${gemPath}.displayName`);
      assertNullableNumber(gem.level, `${gemPath}.level`);
      assertNullableNumber(gem.quality, `${gemPath}.quality`);
      assertBoolean(gem.enabled, `${gemPath}.enabled`);
      assertBoolean(gem.enableGlobal1, `${gemPath}.enableGlobal1`);
      assertBoolean(gem.enableGlobal2, `${gemPath}.enableGlobal2`);
      assertNumber(gem.count, `${gemPath}.count`);
      assertNullableString(gem.errMsg, `${gemPath}.errMsg`);
      assertNullableNumber(gem.reqLevel, `${gemPath}.reqLevel`);
      assertNullableNumber(gem.reqStr, `${gemPath}.reqStr`);
      assertNullableNumber(gem.reqDex, `${gemPath}.reqDex`);
      assertNullableNumber(gem.reqInt, `${gemPath}.reqInt`);
      assertNullableNumber(gem.naturalMaxLevel, `${gemPath}.naturalMaxLevel`);
      assertSkillGemColour(gem.color, `${gemPath}.color`);
      assertBoolean(gem.isSupport, `${gemPath}.isSupport`);
      assertBoolean(gem.isVaal, `${gemPath}.isVaal`);
      assertBoolean(gem.fromItem, `${gemPath}.fromItem`);
      assertBoolean(gem.fromTree, `${gemPath}.fromTree`);
      assertBoolean(gem.triggered, `${gemPath}.triggered`);
      assertBoolean(gem.countVisible, `${gemPath}.countVisible`);
      assertBoolean(gem.canEdit, `${gemPath}.canEdit`);
      assertBoolean(gem.canDelete, `${gemPath}.canDelete`);
      assertNullableNumber(gem.displayLevel, `${gemPath}.displayLevel`);
      assertNullableNumber(gem.displayQuality, `${gemPath}.displayQuality`);
      assertArray(gem.globalEffects, `${gemPath}.globalEffects`);
      gem.globalEffects.forEach((effect, effectIndex) => {
        const effectPath = `${gemPath}.globalEffects[${effectIndex}]`;
        assertRecord(effect, effectPath);
        assertKnownKeys(effect, effectPath, ["index", "name", "enabled"]);
        assertNumber(effect.index, `${effectPath}.index`);
        assertString(effect.name, `${effectPath}.name`);
        assertBoolean(effect.enabled, `${effectPath}.enabled`);
      });
    });
    assertArray(group.activeSkills, `${path}.activeSkills`);
    group.activeSkills.forEach((entry, entryIndex) => {
      const entryPath = `${path}.activeSkills[${entryIndex}]`;
      assertRecord(entry, entryPath);
      assertKnownKeys(entry, entryPath, [
        "index",
        "label",
        "skillPartName",
        "disableReason",
        "color",
      ]);
      assertNumber(entry.index, `${entryPath}.index`);
      assertString(entry.label, `${entryPath}.label`);
      assertNullableString(entry.skillPartName, `${entryPath}.skillPartName`);
      assertNullableString(entry.disableReason, `${entryPath}.disableReason`);
      assertSkillGemColour(entry.color, `${entryPath}.color`);
    });
  });
}

export function assertPobCalcsSnapshot(
  value: unknown,
): asserts value is PobCalcsSnapshot {
  assertRecord(value, "calcs");
  assertKnownKeys(value, "calcs", [
    "search",
    "skillSelect",
    "sections",
    "summary",
  ]);
  assertString(value.search, "calcs.search");
  assertRecord(value.skillSelect, "calcs.skillSelect");
  assertKnownKeys(value.skillSelect, "calcs.skillSelect", [
    "skillNumber",
    "buffMode",
    "buffModeOptions",
    "showMinion",
    "showMinionShown",
    "socketGroup",
    "mainSkill",
    "statSet",
    "skillPart",
    "skillStages",
    "mineCount",
    "minion",
    "spectreLibrary",
    "beastLibrary",
    "minionSkill",
    "minionSkillStatSet",
  ]);
  assertNumber(value.skillSelect.skillNumber, "calcs.skillSelect.skillNumber");
  assertString(value.skillSelect.buffMode, "calcs.skillSelect.buffMode");
  if (!calcsBuffModes.has(value.skillSelect.buffMode)) {
    fail("calcs.skillSelect.buffMode", "a PoB buff mode");
  }
  assertArray(
    value.skillSelect.buffModeOptions,
    "calcs.skillSelect.buffModeOptions",
  );
  const modes = value.skillSelect.buffModeOptions.map((option, index) => {
    assertRecord(option, `calcs.skillSelect.buffModeOptions[${index}]`);
    assertKnownKeys(option, `calcs.skillSelect.buffModeOptions[${index}]`, [
      "value",
      "label",
    ]);
    assertString(
      option.value,
      `calcs.skillSelect.buffModeOptions[${index}].value`,
    );
    assertString(
      option.label,
      `calcs.skillSelect.buffModeOptions[${index}].label`,
    );
    return option.value;
  });
  if (modes.join("|") !== POB_ORIGINAL_CALCS_BUFF_MODES.join("|")) {
    fail("calcs.skillSelect.buffModeOptions", "PoB buff mode order");
  }
  assertBoolean(value.skillSelect.showMinion, "calcs.skillSelect.showMinion");
  assertBoolean(
    value.skillSelect.showMinionShown,
    "calcs.skillSelect.showMinionShown",
  );
  assertCalcsDropdown(
    value.skillSelect.socketGroup,
    "calcs.skillSelect.socketGroup",
  );
  assertCalcsDropdown(
    value.skillSelect.mainSkill,
    "calcs.skillSelect.mainSkill",
  );
  assertCalcsDropdown(value.skillSelect.statSet, "calcs.skillSelect.statSet");
  assertCalcsDropdown(
    value.skillSelect.skillPart,
    "calcs.skillSelect.skillPart",
  );
  assertCalcsEditField(
    value.skillSelect.skillStages,
    "calcs.skillSelect.skillStages",
  );
  assertCalcsEditField(
    value.skillSelect.mineCount,
    "calcs.skillSelect.mineCount",
  );
  assertCalcsDropdown(value.skillSelect.minion, "calcs.skillSelect.minion");
  assertCalcsButton(
    value.skillSelect.spectreLibrary,
    "calcs.skillSelect.spectreLibrary",
  );
  assertCalcsButton(
    value.skillSelect.beastLibrary,
    "calcs.skillSelect.beastLibrary",
  );
  assertCalcsDropdown(
    value.skillSelect.minionSkill,
    "calcs.skillSelect.minionSkill",
  );
  assertCalcsDropdown(
    value.skillSelect.minionSkillStatSet,
    "calcs.skillSelect.minionSkillStatSet",
  );
  assertArray(value.sections, "calcs.sections");
  value.sections.forEach((section, index) => {
    const path = `calcs.sections[${index}]`;
    assertRecord(section, path);
    assertKnownKeys(section, path, [
      "id",
      "group",
      "widthCols",
      "colour",
      "enabled",
      "subSections",
    ]);
    assertString(section.id, `${path}.id`);
    assertNumber(section.group, `${path}.group`);
    if (!calcsGroups.has(section.group)) fail(`${path}.group`, "a calc group");
    assertNumber(section.widthCols, `${path}.widthCols`);
    assertBoolean(section.enabled, `${path}.enabled`);
    if (section.colour !== null) {
      assertString(section.colour, `${path}.colour`);
      if (!calcsColours.has(section.colour)) fail(`${path}.colour`, "a colour");
    }
    assertArray(section.subSections, `${path}.subSections`);
    section.subSections.forEach((sub, subIndex) => {
      const subPath = `${path}.subSections[${subIndex}]`;
      assertRecord(sub, subPath);
      assertKnownKeys(sub, subPath, [
        "id",
        "label",
        "collapsed",
        "defaultCollapsed",
        "extra",
        "colWidth",
        "rows",
      ]);
      assertString(sub.id, `${subPath}.id`);
      assertString(sub.label, `${subPath}.label`);
      assertBoolean(sub.collapsed, `${subPath}.collapsed`);
      assertBoolean(sub.defaultCollapsed, `${subPath}.defaultCollapsed`);
      assertNullableString(sub.extra, `${subPath}.extra`);
      assertNullableNumber(sub.colWidth, `${subPath}.colWidth`);
      assertArray(sub.rows, `${subPath}.rows`);
      sub.rows.forEach((row, rowIndex) => {
        const rowPath = `${subPath}.rows[${rowIndex}]`;
        assertRecord(row, rowPath);
        assertKnownKeys(row, rowPath, ["label", "cells"]);
        assertString(row.label, `${rowPath}.label`);
        assertArray(row.cells, `${rowPath}.cells`);
        row.cells.forEach((cell, cellIndex) => {
          const cellPath = `${rowPath}.cells[${cellIndex}]`;
          assertRecord(cell, cellPath);
          assertKnownKeys(cell, cellPath, ["text", "colour", "breakdownKey"]);
          assertString(cell.text, `${cellPath}.text`);
          assertNullableString(cell.breakdownKey, `${cellPath}.breakdownKey`);
          if (cell.colour !== null) {
            assertString(cell.colour, `${cellPath}.colour`);
            if (!calcsColours.has(cell.colour))
              fail(`${cellPath}.colour`, "a colour");
          }
        });
      });
    });
  });
  assertRecord(value.summary, "calcs.summary");
  assertKnownKeys(value.summary, "calcs.summary", [
    "combinedDPS",
    "fullDPS",
    "totalEHP",
    "life",
    "energyShield",
    "mana",
  ]);
  assertNullableNumber(value.summary.combinedDPS, "calcs.summary.combinedDPS");
  assertNullableNumber(value.summary.fullDPS, "calcs.summary.fullDPS");
  assertNullableNumber(value.summary.totalEHP, "calcs.summary.totalEHP");
  assertNullableNumber(value.summary.life, "calcs.summary.life");
  assertNullableNumber(
    value.summary.energyShield,
    "calcs.summary.energyShield",
  );
  assertNullableNumber(value.summary.mana, "calcs.summary.mana");
}

const assertNullableStringRecordArray = (
  value: unknown,
  path: string,
): void => {
  if (value === null) return;
  assertArray(value, path);
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    assertRecord(entry, entryPath);
    for (const [key, field] of Object.entries(entry)) {
      if (typeof field !== "string") fail(`${entryPath}.${key}`, "a string");
    }
  });
};

export function assertPobCalcsBreakdown(
  value: unknown,
): asserts value is PobCalcsBreakdown {
  assertRecord(value, "calcsBreakdown");
  assertKnownKeys(value, "calcsBreakdown", ["key", "sections"]);
  assertString(value.key, "calcsBreakdown.key");
  assertArray(value.sections, "calcsBreakdown.sections");
  value.sections.forEach((section, index) => {
    const path = `calcsBreakdown.sections[${index}]`;
    assertRecord(section, path);
    assertKnownKeys(section, path, ["type", "data"]);
    assertString(section.type, `${path}.type`);
    assertRecord(section.data, `${path}.data`);
    if (section.type === "MODS") {
      assertKnownKeys(section.data, `${path}.data`, [
        "label",
        "modName",
        "modType",
        "entries",
      ]);
      assertString(section.data.label, `${path}.data.label`);
      assertStringArray(section.data.modName, `${path}.data.modName`);
      assertString(section.data.modType, `${path}.data.modType`);
      assertArray(section.data.entries, `${path}.data.entries`);
      section.data.entries.forEach((entry, entryIndex) => {
        const entryPath = `${path}.data.entries[${entryIndex}]`;
        assertRecord(entry, entryPath);
        assertKnownKeys(entry, entryPath, [
          "name",
          "type",
          "value",
          "source",
          "sourceLine",
        ]);
        assertNullableString(entry.name, `${entryPath}.name`);
        assertNullableString(entry.type, `${entryPath}.type`);
        assertNullableNumber(entry.value, `${entryPath}.value`);
        assertNullableString(entry.source, `${entryPath}.source`);
        assertNullableString(entry.sourceLine, `${entryPath}.sourceLine`);
      });
      return;
    }
    if (section.type !== "BREAKDOWN") {
      fail(`${path}.type`, "a PoB breakdown section type");
    }
    assertKnownKeys(section.data, `${path}.data`, [
      "stat",
      "label",
      "footer",
      "lines",
      "rowList",
      "colList",
    ]);
    assertString(section.data.stat, `${path}.data.stat`);
    assertNullableString(section.data.label, `${path}.data.label`);
    assertNullableString(section.data.footer, `${path}.data.footer`);
    assertStringArray(section.data.lines, `${path}.data.lines`);
    assertNullableStringRecordArray(
      section.data.rowList,
      `${path}.data.rowList`,
    );
    if (section.data.colList !== null) {
      assertArray(section.data.colList, `${path}.data.colList`);
      section.data.colList.forEach((col, colIndex) => {
        const colPath = `${path}.data.colList[${colIndex}]`;
        assertRecord(col, colPath);
        assertKnownKeys(col, colPath, ["key", "label"]);
        assertString(col.key, `${colPath}.key`);
        assertString(col.label, `${colPath}.label`);
      });
    }
  });
}

export function assertPobBuildMetadataSnapshot(
  value: unknown,
): asserts value is PobBuildMetadataSnapshot {
  assertRecord(value, "buildMetadata");
  assertKnownKeys(value, "buildMetadata", [
    "level",
    "levelAutoMode",
    "classId",
    "className",
    "ascendClassId",
    "ascendClassName",
    "classes",
  ]);
  assertNumber(value.level, "buildMetadata.level");
  assertBoolean(value.levelAutoMode, "buildMetadata.levelAutoMode");
  assertNullableNumber(value.classId, "buildMetadata.classId");
  assertNullableString(value.className, "buildMetadata.className");
  assertNullableNumber(value.ascendClassId, "buildMetadata.ascendClassId");
  assertNullableString(value.ascendClassName, "buildMetadata.ascendClassName");
  assertArray(value.classes, "buildMetadata.classes");
  value.classes.forEach((classOption, classIndex) => {
    const classPath = `buildMetadata.classes[${classIndex}]`;
    assertRecord(classOption, classPath);
    assertKnownKeys(classOption, classPath, ["id", "label", "ascendancies"]);
    assertNumber(classOption.id, `${classPath}.id`);
    assertString(classOption.label, `${classPath}.label`);
    assertArray(classOption.ascendancies, `${classPath}.ascendancies`);
    classOption.ascendancies.forEach((ascendancy, ascendancyIndex) => {
      const ascendancyPath = `${classPath}.ascendancies[${ascendancyIndex}]`;
      assertRecord(ascendancy, ascendancyPath);
      assertKnownKeys(ascendancy, ascendancyPath, ["id", "label"]);
      assertNumber(ascendancy.id, `${ascendancyPath}.id`);
      assertString(ascendancy.label, `${ascendancyPath}.label`);
    });
  });
}

export function assertPobBuildMetadataActionResult(
  value: unknown,
): asserts value is PobBuildMetadataActionResult {
  assertRecord(value, "buildMetadataAction");
  assertKnownKeys(value, "buildMetadataAction", [
    "status",
    "snapshot",
    "confirmation",
    "reason",
  ]);
  assertString(value.status, "buildMetadataAction.status");

  if (value.status === "ok") {
    assertKnownKeys(value, "buildMetadataAction", ["status", "snapshot"]);
    assertPobBuildMetadataSnapshot(value.snapshot);
    return;
  }

  if (value.status === "confirm") {
    assertKnownKeys(value, "buildMetadataAction", [
      "status",
      "snapshot",
      "confirmation",
    ]);
    assertPobBuildMetadataSnapshot(value.snapshot);
    assertRecord(value.confirmation, "buildMetadataAction.confirmation");
    assertKnownKeys(value.confirmation, "buildMetadataAction.confirmation", [
      "type",
      "classId",
      "classLabel",
      "message",
      "confirmLabel",
      "alternateLabel",
    ]);
    if (value.confirmation.type !== "classChange") {
      fail("buildMetadataAction.confirmation.type", "classChange");
    }
    assertNumber(
      value.confirmation.classId,
      "buildMetadataAction.confirmation.classId",
    );
    assertString(
      value.confirmation.classLabel,
      "buildMetadataAction.confirmation.classLabel",
    );
    assertString(
      value.confirmation.message,
      "buildMetadataAction.confirmation.message",
    );
    assertString(
      value.confirmation.confirmLabel,
      "buildMetadataAction.confirmation.confirmLabel",
    );
    assertString(
      value.confirmation.alternateLabel,
      "buildMetadataAction.confirmation.alternateLabel",
    );
    return;
  }

  if (value.status === "error") {
    assertKnownKeys(value, "buildMetadataAction", ["status", "reason"]);
    assertString(value.reason, "buildMetadataAction.reason");
    return;
  }

  fail("buildMetadataAction.status", "ok|confirm|error");
}

export function assertPobMainSkillSummarySnapshot(
  value: unknown,
): asserts value is PobMainSkillSummarySnapshot {
  assertRecord(value, "mainSkillSummary");
  assertKnownKeys(value, "mainSkillSummary", [
    "socketGroupLabel",
    "mainSkillLabel",
    "rows",
    "warnings",
  ]);
  assertNullableString(
    value.socketGroupLabel,
    "mainSkillSummary.socketGroupLabel",
  );
  assertNullableString(value.mainSkillLabel, "mainSkillSummary.mainSkillLabel");
  assertArray(value.rows, "mainSkillSummary.rows");
  value.rows.forEach((row, index) => {
    const path = `mainSkillSummary.rows[${index}]`;
    assertRecord(row, path);
    assertKnownKeys(row, path, ["kind", "label", "value", "text", "height"]);
    assertString(row.kind, `${path}.kind`);
    if (row.kind !== "stat" && row.kind !== "text" && row.kind !== "spacer") {
      fail(`${path}.kind`, "a PoB main skill summary row kind");
    }
    assertNullableString(row.label, `${path}.label`);
    assertNullableString(row.value, `${path}.value`);
    assertNullableString(row.text, `${path}.text`);
    assertNumber(row.height, `${path}.height`);
  });
  assertStringArray(value.warnings, "mainSkillSummary.warnings");
}

const partySectionKeys = new Set<string>([
  "auras",
  "warcry",
  "link",
  "partyMemberStats",
  "enemyConditions",
  "enemyModifiers",
  "curses",
]);

const assertPartyButton = (value: unknown, path: string): void => {
  assertRecord(value, path);
  assertKnownKeys(value, path, ["label", "shown", "enabled", "tooltip"]);
  assertString(value.label, `${path}.label`);
  assertBoolean(value.shown, `${path}.shown`);
  assertBoolean(value.enabled, `${path}.enabled`);
  assertNullableString(value.tooltip, `${path}.tooltip`);
};

const assertPartyCheckbox = (value: unknown, path: string): void => {
  assertRecord(value, path);
  assertKnownKeys(value, path, [
    "label",
    "shown",
    "enabled",
    "tooltip",
    "checked",
  ]);
  assertString(value.label, `${path}.label`);
  assertBoolean(value.shown, `${path}.shown`);
  assertBoolean(value.enabled, `${path}.enabled`);
  assertNullableString(value.tooltip, `${path}.tooltip`);
  assertBoolean(value.checked, `${path}.checked`);
};

const assertPartySection = (value: unknown, path: string): void => {
  assertRecord(value, path);
  assertKnownKeys(value, path, [
    "key",
    "label",
    "text",
    "simpleText",
    "advancedVisible",
  ]);
  assertString(value.key, `${path}.key`);
  if (!partySectionKeys.has(value.key)) {
    fail(`${path}.key`, "a Party section key");
  }
  assertString(value.label, `${path}.label`);
  assertString(value.text, `${path}.text`);
  assertString(value.simpleText, `${path}.simpleText`);
  assertBoolean(value.advancedVisible, `${path}.advancedVisible`);
};

export function assertPobPartySnapshot(
  value: unknown,
): asserts value is PobPartySnapshot {
  assertRecord(value, "party");
  assertKnownKeys(value, "party", [
    "notes",
    "enableExportBuffs",
    "importControls",
    "leftSections",
    "rightSections",
  ]);
  assertString(value.notes, "party.notes");
  assertBoolean(value.enableExportBuffs, "party.enableExportBuffs");

  assertRecord(value.importControls, "party.importControls");
  assertKnownKeys(value.importControls, "party.importControls", [
    "inputLabel",
    "code",
    "detail",
    "valid",
    "fetching",
    "destinations",
    "selectedDestination",
    "destinationTooltip",
    "importButton",
    "append",
    "clear",
    "showAdvanced",
    "disableEffects",
    "rebuild",
  ]);
  assertString(
    value.importControls.inputLabel,
    "party.importControls.inputLabel",
  );
  assertString(value.importControls.code, "party.importControls.code");
  assertString(value.importControls.detail, "party.importControls.detail");
  assertBoolean(value.importControls.valid, "party.importControls.valid");
  assertBoolean(value.importControls.fetching, "party.importControls.fetching");
  assertStringArray(
    value.importControls.destinations,
    "party.importControls.destinations",
  );
  assertNumber(
    value.importControls.selectedDestination,
    "party.importControls.selectedDestination",
  );
  assertNullableString(
    value.importControls.destinationTooltip,
    "party.importControls.destinationTooltip",
  );
  assertPartyButton(
    value.importControls.importButton,
    "party.importControls.importButton",
  );
  assertPartyCheckbox(
    value.importControls.append,
    "party.importControls.append",
  );
  assertPartyButton(value.importControls.clear, "party.importControls.clear");
  assertPartyCheckbox(
    value.importControls.showAdvanced,
    "party.importControls.showAdvanced",
  );
  assertPartyButton(
    value.importControls.disableEffects,
    "party.importControls.disableEffects",
  );
  assertPartyButton(
    value.importControls.rebuild,
    "party.importControls.rebuild",
  );

  assertArray(value.leftSections, "party.leftSections");
  value.leftSections.forEach((section, index) =>
    assertPartySection(section, `party.leftSections[${index}]`),
  );
  assertArray(value.rightSections, "party.rightSections");
  value.rightSections.forEach((section, index) =>
    assertPartySection(section, `party.rightSections[${index}]`),
  );
}
