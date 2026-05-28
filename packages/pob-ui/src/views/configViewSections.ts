import type {
  PobConfigOption,
  PobConfigSection,
} from "@poe2-launcher/shared/types";

const normalise = (value: string): string => value.trim().toLowerCase();

const scalarText = (value: PobConfigOption["value"] | undefined): string =>
  value === null || value === undefined ? "" : String(value);

function optionMatchesSearch(
  option: PobConfigOption,
  section: PobConfigSection,
  query: string,
): boolean {
  if (!query) return true;
  if (normalise(section.label).includes(query)) return true;
  if (normalise(section.id).includes(query)) return true;
  if (normalise(option.label).includes(query)) return true;
  if (option.var && normalise(option.var).includes(query)) return true;
  if (normalise(scalarText(option.value)).includes(query)) return true;
  return option.options.some((entry) => normalise(entry.label).includes(query));
}

export function filterConfigSections(
  sections: PobConfigSection[],
  search: string,
): PobConfigSection[] {
  const query = normalise(search);
  return sections
    .map((section) => {
      const options = section.options.filter(
        (option) => option.shown && optionMatchesSearch(option, section, query),
      );
      return options.length > 0 ? { ...section, options } : null;
    })
    .filter((section): section is PobConfigSection => section !== null);
}

export function groupConfigSectionsByColumn(
  sections: PobConfigSection[],
  requestedColumnCount: number,
): PobConfigSection[][] {
  const columnCount = Math.max(1, Math.floor(requestedColumnCount));
  const columns = Array.from(
    { length: columnCount },
    () => [] as PobConfigSection[],
  );
  for (const section of sections) {
    const preferred = Number.isInteger(section.col) ? (section.col ?? 1) : 1;
    const index = Math.max(0, Math.min(columnCount - 1, preferred - 1));
    columns[index].push(section);
  }
  return columns;
}
