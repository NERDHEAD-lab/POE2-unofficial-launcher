export interface NoteTemplate {
  id: string;
  name: string;
  body: string;
  builtIn?: boolean;
}

const STORAGE_KEY = "pobWrapper.notes.templates.v1";

export const DEFAULT_NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "build-summary",
    name: "Build summary",
    body: [
      "# {buildName}",
      "",
      "## Goals",
      "- Main skill:",
      "- Defensive layer:",
      "- Next upgrade:",
      "",
      "## Notes",
      "- ",
    ].join("\n"),
    builtIn: true,
  },
  {
    id: "upgrade-checklist",
    name: "Upgrade checklist",
    body: [
      "# Upgrade checklist",
      "",
      "- [ ] Weapon",
      "- [ ] Body armour",
      "- [ ] Rings / amulet",
      "- [ ] Jewels",
      "- [ ] Passive respec",
    ].join("\n"),
    builtIn: true,
  },
  {
    id: "mapping-log",
    name: "Mapping log",
    body: [
      "# Mapping notes",
      "",
      "## Atlas",
      "- Current target:",
      "- Problem mods:",
      "",
      "## Loot / upgrades",
      "- ",
    ].join("\n"),
    builtIn: true,
  },
];

const canUseLocalStorage = (): boolean =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const normalizeTemplate = (value: unknown): NoteTemplate | null => {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string") return null;
  if (typeof record.name !== "string") return null;
  if (typeof record.body !== "string") return null;
  return {
    id: record.id,
    name: record.name,
    body: record.body,
  };
};

export const loadUserNoteTemplates = (): NoteTemplate[] => {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const template = normalizeTemplate(entry);
      return template ? [template] : [];
    });
  } catch {
    return [];
  }
};

export const saveUserNoteTemplates = (templates: NoteTemplate[]): void => {
  if (!canUseLocalStorage()) return;
  const userTemplates = templates
    .filter((template) => !template.builtIn)
    .map(({ id, name, body }) => ({ id, name, body }));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(userTemplates));
};

export const getAllNoteTemplates = (): NoteTemplate[] => [
  ...DEFAULT_NOTE_TEMPLATES,
  ...loadUserNoteTemplates(),
];

export const createNoteTemplateId = (): string =>
  `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const extractTemplateVariables = (body: string): string[] => {
  const variables = new Set<string>();
  for (const match of body.matchAll(/\{([A-Za-z][A-Za-z0-9_.-]*)\}/g)) {
    variables.add(match[1]);
  }
  return [...variables];
};

export const applyTemplateVariables = (
  body: string,
  values: Record<string, string>,
): string =>
  body.replace(/\{([A-Za-z][A-Za-z0-9_.-]*)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
