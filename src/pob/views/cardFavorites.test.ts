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
});

describe("cardFavorites.toggleFavoriteId", () => {
  it("adds and removes one id", () => {
    const first = toggleFavoriteId(new Set(["a"]), "b");
    expect([...first]).toEqual(["a", "b"]);

    const second = toggleFavoriteId(first, "a");
    expect([...second]).toEqual(["b"]);
  });
});
