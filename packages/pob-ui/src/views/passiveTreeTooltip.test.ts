import { describe, expect, it } from "vitest";

import {
  estimatePassiveTreeTooltipHeight,
  resolvePassiveTreeTooltipPlacement,
} from "./passiveTreeTooltip";

describe("passiveTreeTooltip", () => {
  it("keeps the tooltip below the hovered node when it fits", () => {
    expect(
      resolvePassiveTreeTooltipPlacement({
        viewportWidth: 900,
        viewportHeight: 700,
        anchorX: 120,
        anchorY: 160,
        estimatedHeight: 220,
      }),
    ).toMatchObject({
      left: 132,
      top: 172,
    });
  });

  it("moves the tooltip above the hovered node when the bottom would overflow", () => {
    const placement = resolvePassiveTreeTooltipPlacement({
      viewportWidth: 900,
      viewportHeight: 520,
      anchorX: 120,
      anchorY: 470,
      estimatedHeight: 220,
    });

    expect(placement.top).toBe(238);
    expect(placement.top).toBeLessThan(470);
    expect(placement.top + 220).toBeLessThanOrEqual(512);
  });

  it("caps very tall tooltips to the viewport without creating panel overflow", () => {
    const placement = resolvePassiveTreeTooltipPlacement({
      viewportWidth: 900,
      viewportHeight: 500,
      anchorX: 120,
      anchorY: 470,
      estimatedHeight: 900,
    });

    expect(placement.top).toBe(8);
    expect(placement.maxHeight).toBe(484);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(492);
  });

  it("keeps the tooltip inside the right viewport edge", () => {
    expect(
      resolvePassiveTreeTooltipPlacement({
        viewportWidth: 900,
        viewportHeight: 700,
        anchorX: 880,
        anchorY: 160,
        estimatedHeight: 220,
      }).left,
    ).toBe(428);
  });

  it("estimates rich tooltip height from headers, lines, and separators", () => {
    expect(
      estimatePassiveTreeTooltipHeight({
        hasHeader: true,
        lineCount: 10,
        separatorCount: 2,
      }),
    ).toBe(240);
  });
});
