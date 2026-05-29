import { describe, expect, it } from "vitest";

import {
  shouldSkipHeaderSeparator,
  tooltipHeaderClasses,
  tooltipInfluenceClasses,
  tooltipLineClasses,
  tooltipSeparatorClasses,
} from "./pobTooltipMetadata";

describe("pobTooltipMetadata", () => {
  it("projects PoB tooltip line metadata into stable style classes", () => {
    expect(
      tooltipLineClasses("pob-skills-tooltip-line", {
        kind: "line",
        text: "Converts 80% of Physical Damage to Cold Damage",
        colour: "MAGIC",
        size: 16,
        font: "FONTIN SC",
        center: true,
        background: "GemHoverModBg",
        block: 2,
      }),
    ).toBe(
      "pob-skills-tooltip-line is-colour-magic is-centered is-font-fontin-sc is-comparison-block has-background has-background-gemhovermodbg",
    );
  });

  it("projects tooltipHeader into a stable container theme class", () => {
    expect(tooltipHeaderClasses("pob-item-tooltip", "ORACLE_KEYSTONE")).toBe(
      "pob-item-tooltip is-tooltip-header-oracle-keystone",
    );
  });

  it("projects item separator and influence metadata into stable classes", () => {
    expect(
      tooltipSeparatorClasses(
        "pob-item-tooltip-separator",
        {
          kind: "separator",
          text: "",
          colour: null,
          size: 10,
          separatorTheme: "RARE",
        },
        "NORMAL",
      ),
    ).toBe("pob-item-tooltip-separator is-separator-rare");
    expect(shouldSkipHeaderSeparator("RARE")).toBe(true);
    expect(shouldSkipHeaderSeparator("NORMAL")).toBe(false);
    expect(shouldSkipHeaderSeparator("ORACLE_KEYSTONE")).toBe(true);
    expect(
      tooltipInfluenceClasses(
        "pob-item-tooltip-influence",
        "Desecrated",
        "left",
      ),
    ).toBe("pob-item-tooltip-influence is-left is-influence-desecrated");
  });
});
