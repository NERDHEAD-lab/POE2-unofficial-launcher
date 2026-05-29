import { type CSSProperties, type ReactNode, useMemo } from "react";

import { tooltipLineClasses } from "./pobTooltipMetadata";

import type { PobTooltipHeaderTitleEntry } from "./pobTooltipAssetParts";

export function PobTooltipAssetHeader({
  className,
  lineBaseClass,
  titleEntries,
  style,
  children,
}: {
  className: string;
  lineBaseClass: string;
  titleEntries: PobTooltipHeaderTitleEntry[];
  style: CSSProperties;
  children?: ReactNode;
}) {
  const titleContent = useMemo(
    () =>
      titleEntries.length > 0 ? (
        <div className="pob-tooltip-header-title">
          {titleEntries.map(({ line, index }) => (
            <div
              key={`header-title-${index}`}
              className={
                tooltipLineClasses(lineBaseClass, line) +
                " is-header-title-line"
              }
            >
              {line.text}
            </div>
          ))}
        </div>
      ) : null,
    [lineBaseClass, titleEntries],
  );

  return (
    <div
      className={`${className} pob-tooltip-asset-header has-asset-header`}
      style={style}
    >
      <span className="pob-tooltip-header-slice is-left" />
      <span className="pob-tooltip-header-slice is-middle" />
      <span className="pob-tooltip-header-slice is-right" />
      {titleContent}
      {children}
    </div>
  );
}
