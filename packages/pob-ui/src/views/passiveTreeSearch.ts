import type { PobTreeNode } from "@poe2-launcher/shared/types";

export interface TreeSearchQuery {
  raw: string;
  terms: string[];
  oilRecipe: boolean;
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const parseTreeSearchQuery = (raw: string): TreeSearchQuery => {
  let search = raw.toLowerCase();
  const terms: string[] = [];
  search = search.replace(/"([^"]*)"/g, (_match, quoted: string) => {
    const term = normalize(quoted);
    if (term) terms.push(term);
    return " ";
  });
  for (const word of search.split(/\s+/)) {
    const term = normalize(word);
    if (term) terms.push(term);
  }
  return {
    raw,
    terms,
    oilRecipe: terms[0] === "oil:",
  };
};

const termAlternates = (term: string): string[] =>
  term.replace(/[()]/g, "").split("|").map(normalize).filter(Boolean);

const termMatches = (haystack: string, term: string): boolean => {
  const options = termAlternates(term);
  return options.some((option) => haystack.includes(option));
};

const nodeHaystacks = (node: PobTreeNode): string[] => [
  normalize(node.name ?? ""),
  normalize(node.type ?? ""),
  ...(node.statLines ?? []).map(normalize),
];

export const matchesTreeSearchQuery = (
  node: PobTreeNode,
  query: TreeSearchQuery,
): boolean => {
  if (query.terms.length === 0) return false;
  if (node.type === "ClassStart" || node.type === "OnlyImage") return false;

  if (query.oilRecipe) {
    if (!node.recipe || node.recipe.length === 0) return false;
    const recipes = node.recipe.map((recipe) =>
      normalize(recipe.replace(/oil/gi, "")),
    );
    return query.terms.every((term) =>
      term === "oil:"
        ? true
        : recipes.some((recipe) => termMatches(recipe, term)),
    );
  }

  const haystacks = nodeHaystacks(node);
  return query.terms.every((term) =>
    haystacks.some((haystack) => termMatches(haystack, term)),
  );
};

export const buildTreeSearchMatchIds = (
  nodes: PobTreeNode[],
  rawSearch: string,
): Set<number> => {
  const query = parseTreeSearchQuery(rawSearch);
  if (query.terms.length === 0) return new Set();
  return new Set(
    nodes
      .filter((node) => matchesTreeSearchQuery(node, query))
      .map((node) => node.id),
  );
};
