import { describe, expect, it } from "vitest";

import { sortSectionsByFavorites, toggleFavoriteId } from "./cardFavorites";

describe("cardFavorites.sortSectionsByFavorites", () => {
  it("moves favorite sections to the front without changing relative order", () => {
    const sections = ["a", "b", "c", "d"].map((id) => ({ id }));

    const result = sortSectionsByFavorites(
      sections,
      new Set(["d", "b", "missing"]),
    );

    expect(result.map((section) => section.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("only reorders the sections supplied by the current filter", () => {
    const filteredSections = ["offence-a", "offence-b", "offence-c"].map(
      (id) => ({ id }),
    );

    const result = sortSectionsByFavorites(
      filteredSections,
      new Set(["defence-a", "offence-c"]),
    );

    expect(result.map((section) => section.id)).toEqual([
      "offence-c",
      "offence-a",
      "offence-b",
    ]);
  });
});

describe("cardFavorites.toggleFavoriteId", () => {
  it("adds and removes one id", () => {
    const first = toggleFavoriteId(new Set(["a"]), "b");
    expect([...first]).toEqual(["a", "b"]);

    const second = toggleFavoriteId(first, "a");
    expect([...second]).toEqual(["b"]);
  });
});
