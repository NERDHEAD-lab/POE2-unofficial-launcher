import { POB_ORIGINAL_CALCS_GROUP_FILTERS } from "../../shared/pobOriginalContract";

import type { PobCalcsSection } from "../../shared/types";

export type CalcsGroupFilter = keyof typeof POB_ORIGINAL_CALCS_GROUP_FILTERS;

export function matchesGroupFilter(
  section: PobCalcsSection,
  filter: CalcsGroupFilter,
): boolean {
  const key = POB_ORIGINAL_CALCS_GROUP_FILTERS[filter];
  return key === null || section.group === key;
}

export function matchesSearch(
  section: PobCalcsSection,
  query: string,
): PobCalcsSection | null {
  if (!query.trim()) return section;
  const needle = query.trim().toLowerCase();
  const sectionMatched = section.id.toLowerCase().includes(needle);
  const subs: PobCalcsSection["subSections"] = [];
  for (const sub of section.subSections) {
    const subLabelMatch = sub.label.toLowerCase().includes(needle);
    const rows = sub.rows.filter((row) => {
      if (subLabelMatch || sectionMatched) return true;
      if (row.label.toLowerCase().includes(needle)) return true;
      return row.cells.some((cell) => cell.text.toLowerCase().includes(needle));
    });
    if (subLabelMatch || sectionMatched || rows.length > 0) {
      subs.push({ ...sub, rows });
    }
  }
  if (subs.length === 0 && !sectionMatched) return null;
  return { ...section, subSections: subs };
}

export function filterSections(
  sections: PobCalcsSection[],
  filter: CalcsGroupFilter,
  search: string,
): PobCalcsSection[] {
  return sections
    .filter((s) => s.enabled)
    .filter((s) => matchesGroupFilter(s, filter))
    .map((s) => matchesSearch(s, search))
    .filter((s): s is PobCalcsSection => s !== null);
}

function sectionHeight(
  sectionId: string,
  heights: ReadonlyMap<string, number>,
): number {
  const measured = heights.get(sectionId);
  if (measured === undefined || !Number.isFinite(measured) || measured <= 0) {
    return 1;
  }
  return measured;
}

export function distributeSectionsIntoColumns(
  sections: Pick<PobCalcsSection, "id">[],
  heights: ReadonlyMap<string, number>,
  requestedColumnCount: number,
): string[][] {
  if (sections.length === 0) return [];
  const columnCount = Math.max(
    1,
    Math.min(sections.length, Math.floor(requestedColumnCount)),
  );
  if (columnCount === 1) return [sections.map((s) => s.id)];

  const ids = sections.map((s) => s.id);
  const weights = ids.map((id) => sectionHeight(id, heights));
  const prefix = [0];
  for (const weight of weights) {
    prefix.push(prefix[prefix.length - 1] + weight);
  }
  const rangeSum = (from: number, to: number) => prefix[to] - prefix[from];

  const dp = Array.from({ length: columnCount + 1 }, () =>
    Array<number>(ids.length + 1).fill(Number.POSITIVE_INFINITY),
  );
  const split = Array.from({ length: columnCount + 1 }, () =>
    Array<number>(ids.length + 1).fill(0),
  );

  for (let i = 1; i <= ids.length; i++) {
    dp[1][i] = rangeSum(0, i);
  }

  for (let col = 2; col <= columnCount; col++) {
    for (let i = col; i <= ids.length; i++) {
      for (let pivot = col - 1; pivot < i; pivot++) {
        const cost = Math.max(dp[col - 1][pivot], rangeSum(pivot, i));
        if (
          cost < dp[col][i] ||
          (cost === dp[col][i] && pivot > split[col][i])
        ) {
          dp[col][i] = cost;
          split[col][i] = pivot;
        }
      }
    }
  }

  const columns: string[][] = Array.from({ length: columnCount }, () => []);
  let end = ids.length;
  for (let col = columnCount; col >= 2; col--) {
    const start = split[col][end];
    columns[col - 1] = ids.slice(start, end);
    end = start;
  }
  columns[0] = ids.slice(0, end);
  return columns;
}
