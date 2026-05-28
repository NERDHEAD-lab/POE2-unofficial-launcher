import { describe, expect, it } from "vitest";

import type { PobTreeNode } from "@poe2-launcher/shared/types";

import {
  buildTreeSearchMatchIds,
  matchesTreeSearchQuery,
  parseTreeSearchQuery,
} from "./passiveTreeSearch";

const node = (overrides: Partial<PobTreeNode>): PobTreeNode => ({
  id: 1,
  x: 0,
  y: 0,
  name: "Test",
  type: "Normal",
  ascendancyName: null,
  isAscendancyStart: false,
  isKeystone: false,
  isNotable: false,
  isSocket: false,
  isMastery: false,
  isOnlyImage: false,
  alloc: false,
  linked: [],
  ...overrides,
});

describe("passiveTreeSearch", () => {
  it("parses quoted terms and whitespace terms like PoB tree search", () => {
    expect(parseTreeSearchQuery('"fire damage" attack').terms).toEqual([
      "fire damage",
      "attack",
    ]);
  });

  it("matches all search terms across name, stat lines, and type", () => {
    const query = parseTreeSearchQuery("damage notable");

    expect(
      matchesTreeSearchQuery(
        node({
          type: "Notable",
          statLines: ["25% increased Fire Damage"],
        }),
        query,
      ),
    ).toBe(true);
  });

  it("supports PoB dotted wildcard-style terms as normalized text", () => {
    const query = parseTreeSearchQuery("increased.fire.damage");

    expect(
      matchesTreeSearchQuery(
        node({ statLines: ["25% increased Fire Damage"] }),
        query,
      ),
    ).toBe(true);
  });

  it("supports oil recipe searches when node recipe data is present", () => {
    const query = parseTreeSearchQuery("oil: clear");

    expect(
      matchesTreeSearchQuery(
        node({ recipe: ["Clear Oil", "Distilled Fear"] }),
        query,
      ),
    ).toBe(true);
    expect(matchesTreeSearchQuery(node({ recipe: ["Sepia Oil"] }), query)).toBe(
      false,
    );
  });

  it("excludes ClassStart and OnlyImage nodes from highlight matches", () => {
    const ids = buildTreeSearchMatchIds(
      [
        node({ id: 1, type: "ClassStart", name: "Monk" }),
        node({ id: 2, type: "OnlyImage", name: "Fire" }),
        node({ id: 3, type: "Normal", name: "Fire" }),
      ],
      "fire",
    );

    expect([...ids]).toEqual([3]);
  });
});
