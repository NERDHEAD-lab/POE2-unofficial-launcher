import { describe, expect, it } from "vitest";

import type { PobTreeTooltipLine } from "@poe2-launcher/shared/types";

import {
  collectPobTooltipHeaderTitleEntries,
  collectPobTreeTooltipHeaderTitleEntries,
} from "./pobTooltipAssetParts";

const line = (
  text: string,
  overrides: Partial<PobTreeTooltipLine> = {},
): PobTreeTooltipLine => ({
  kind: "line",
  text,
  colour: null,
  size: 24,
  font: "FONTIN",
  center: true,
  background: null,
  block: 1,
  ...overrides,
});

const separator = (): PobTreeTooltipLine => ({
  kind: "separator",
  text: "",
  colour: null,
  size: 10,
  font: null,
  center: true,
  background: null,
  block: 1,
  separatorTheme: "GEM",
});

describe("pobTooltipAssetParts", () => {
  it("keeps item/skill header title extraction separator-bound", () => {
    const entries = collectPobTooltipHeaderTitleEntries(
      [line("Storm Wave"), line("Attack"), separator(), line("Level: 20")],
      true,
    );

    expect(entries.map((entry) => [entry.index, entry.line.text])).toEqual([
      [0, "Storm Wave"],
      [1, "Attack"],
    ]);
  });

  it("uses only the first non-empty tree tooltip line as asset header title", () => {
    const entries = collectPobTreeTooltipHeaderTitleEntries(
      [
        line("Killer Instinct"),
        line("", { size: null }),
        line("40% increased Attack Damage while on Full Life", { size: 16 }),
        line("60% increased Attack Damage while on Low Life", { size: 16 }),
      ],
      true,
    );

    expect(entries.map((entry) => [entry.index, entry.line.text])).toEqual([
      [0, "Killer Instinct"],
    ]);
  });
});
