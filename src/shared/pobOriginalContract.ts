import type {
  PobCalcsSnapshot,
  PobItemsDbList,
  PobItemsSnapshot,
  PobSkillsSnapshot,
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

const itemRarities = new Set<string>(POB_ORIGINAL_ITEM_RARITIES);
const skillGemColours = new Set<string>(POB_ORIGINAL_SKILL_GEM_COLORS);
const calcsColours = new Set<string>(POB_ORIGINAL_CALCS_COLOURS);
const calcsGroups = new Set<number>();
for (const value of Object.values(POB_ORIGINAL_CALCS_GROUP_FILTERS)) {
  if (value !== null) calcsGroups.add(value);
}

const assertStringArray = (value: unknown, path: string): void => {
  assertArray(value, path);
  value.forEach((entry, index) => assertString(entry, `${path}[${index}]`));
};

const assertNumberArray = (value: unknown, path: string): void => {
  assertArray(value, path);
  value.forEach((entry, index) => assertNumber(entry, `${path}[${index}]`));
};

const assertItemSummary = (
  value: unknown,
  path: string,
  expectedIdType: "number" | "string",
): void => {
  assertRecord(value, path);
  if (expectedIdType === "number") assertNumber(value.id, `${path}.id`);
  else assertString(value.id, `${path}.id`);
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
  assertStringArray(value.implicitLines, `${path}.implicitLines`);
  assertStringArray(value.explicitLines, `${path}.explicitLines`);
};

export function assertPobTreeSnapshot(
  value: unknown,
): asserts value is PobTreeSnapshot {
  assertRecord(value, "tree");
  assertNullableString(value.treeVersion, "tree.treeVersion");
  assertNullableNumber(value.classId, "tree.classId");
  assertNullableString(value.className, "tree.className");
  assertNumber(value.allocCount, "tree.allocCount");
  assertArray(value.nodes, "tree.nodes");
  value.nodes.forEach((node, index) => {
    const path = `tree.nodes[${index}]`;
    assertRecord(node, path);
    assertNumber(node.id, `${path}.id`);
    assertNumber(node.x, `${path}.x`);
    assertNumber(node.y, `${path}.y`);
    assertNullableString(node.name, `${path}.name`);
    assertNullableString(node.type, `${path}.type`);
    assertBoolean(node.alloc, `${path}.alloc`);
    assertBoolean(node.isKeystone, `${path}.isKeystone`);
    assertBoolean(node.isNotable, `${path}.isNotable`);
    assertBoolean(node.isSocket, `${path}.isSocket`);
    assertNumberArray(node.linked, `${path}.linked`);
  });
}

export function assertPobItemsSnapshot(
  value: unknown,
): asserts value is PobItemsSnapshot {
  assertRecord(value, "items");
  assertNumber(value.activeSetId, "items.activeSetId");
  assertBoolean(value.useSecondWeaponSet, "items.useSecondWeaponSet");
  assertArray(value.sets, "items.sets");
  assertArray(value.slots, "items.slots");
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
  assertArray(value.entries, "itemsDb.entries");
  value.entries.forEach((item, index) =>
    assertItemSummary(item, `itemsDb.entries[${index}]`, "string"),
  );
}

export function assertPobSkillsSnapshot(
  value: unknown,
): asserts value is PobSkillsSnapshot {
  assertRecord(value, "skills");
  assertNumber(value.activeSetId, "skills.activeSetId");
  assertNumber(value.mainSocketGroup, "skills.mainSocketGroup");
  assertNumber(value.calcsSocketGroup, "skills.calcsSocketGroup");
  assertArray(value.groups, "skills.groups");
  assertArray(value.availableGems, "skills.availableGems");
  value.availableGems.forEach((gem, index) => {
    const path = `skills.availableGems[${index}]`;
    assertRecord(gem, path);
    assertString(gem.id, `${path}.id`);
    assertString(gem.name, `${path}.name`);
    assertString(gem.color, `${path}.color`);
    if (!skillGemColours.has(gem.color)) fail(`${path}.color`, "a gem colour");
  });
  value.groups.forEach((group, index) => {
    const path = `skills.groups[${index}]`;
    assertRecord(group, path);
    assertArray(group.gems, `${path}.gems`);
    assertArray(group.activeSkills, `${path}.activeSkills`);
    [...group.gems, ...group.activeSkills].forEach((entry, entryIndex) => {
      assertRecord(entry, `${path}.entries[${entryIndex}]`);
      assertString(entry.color, `${path}.entries[${entryIndex}].color`);
      if (!skillGemColours.has(entry.color)) {
        fail(`${path}.entries[${entryIndex}].color`, "a gem colour");
      }
    });
  });
}

export function assertPobCalcsSnapshot(
  value: unknown,
): asserts value is PobCalcsSnapshot {
  assertRecord(value, "calcs");
  assertRecord(value.skillSelect, "calcs.skillSelect");
  assertArray(
    value.skillSelect.buffModeOptions,
    "calcs.skillSelect.buffModeOptions",
  );
  const modes = value.skillSelect.buffModeOptions.map((option, index) => {
    assertRecord(option, `calcs.skillSelect.buffModeOptions[${index}]`);
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
  assertArray(value.sections, "calcs.sections");
  value.sections.forEach((section, index) => {
    const path = `calcs.sections[${index}]`;
    assertRecord(section, path);
    assertString(section.id, `${path}.id`);
    assertNumber(section.group, `${path}.group`);
    if (!calcsGroups.has(section.group)) fail(`${path}.group`, "a calc group");
    if (section.colour !== null) {
      assertString(section.colour, `${path}.colour`);
      if (!calcsColours.has(section.colour)) fail(`${path}.colour`, "a colour");
    }
    assertArray(section.subSections, `${path}.subSections`);
    section.subSections.forEach((sub, subIndex) => {
      const subPath = `${path}.subSections[${subIndex}]`;
      assertRecord(sub, subPath);
      assertArray(sub.rows, `${subPath}.rows`);
      sub.rows.forEach((row, rowIndex) => {
        const rowPath = `${subPath}.rows[${rowIndex}]`;
        assertRecord(row, rowPath);
        assertString(row.label, `${rowPath}.label`);
        assertArray(row.cells, `${rowPath}.cells`);
        row.cells.forEach((cell, cellIndex) => {
          const cellPath = `${rowPath}.cells[${cellIndex}]`;
          assertRecord(cell, cellPath);
          assertString(cell.text, `${cellPath}.text`);
          if (cell.colour !== null) {
            assertString(cell.colour, `${cellPath}.colour`);
            if (!calcsColours.has(cell.colour))
              fail(`${cellPath}.colour`, "a colour");
          }
        });
      });
    });
  });
}
