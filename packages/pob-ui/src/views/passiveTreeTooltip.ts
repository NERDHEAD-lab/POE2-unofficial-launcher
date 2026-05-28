const TOOLTIP_WIDTH = 440;
const TOOLTIP_MARGIN = 8;
const TOOLTIP_OFFSET = 12;
const TOOLTIP_MAX_HEIGHT = 620;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export interface PassiveTreeTooltipHeightInput {
  hasHeader: boolean;
  lineCount: number;
  separatorCount?: number;
}

export interface PassiveTreeTooltipPlacementInput {
  viewportWidth: number;
  viewportHeight: number;
  anchorX: number;
  anchorY: number;
  estimatedHeight: number;
  width?: number;
  margin?: number;
  offset?: number;
  maxHeight?: number;
}

export interface PassiveTreeTooltipPlacement {
  left: number;
  top: number;
  maxHeight: number;
}

export function estimatePassiveTreeTooltipHeight({
  hasHeader,
  lineCount,
  separatorCount = 0,
}: PassiveTreeTooltipHeightInput): number {
  return (
    16 +
    (hasHeader ? 24 : 0) +
    (lineCount > 0 ? 6 : 0) +
    lineCount * 18 +
    separatorCount * 7
  );
}

export function resolvePassiveTreeTooltipPlacement({
  viewportWidth,
  viewportHeight,
  anchorX,
  anchorY,
  estimatedHeight,
  width = TOOLTIP_WIDTH,
  margin = TOOLTIP_MARGIN,
  offset = TOOLTIP_OFFSET,
  maxHeight = TOOLTIP_MAX_HEIGHT,
}: PassiveTreeTooltipPlacementInput): PassiveTreeTooltipPlacement {
  const availableHeight = Math.max(0, viewportHeight - margin * 2);
  const resolvedMaxHeight = Math.min(maxHeight, availableHeight);
  const resolvedHeight = Math.min(
    Math.max(0, estimatedHeight),
    resolvedMaxHeight,
  );

  const rightLimit = Math.max(margin, viewportWidth - width - margin);
  const preferredLeft = anchorX + offset;
  const left = clamp(
    preferredLeft <= rightLimit ? preferredLeft : anchorX - width - offset,
    margin,
    rightLimit,
  );

  const bottomLimit = Math.max(
    margin,
    viewportHeight - resolvedHeight - margin,
  );
  const preferredTop = anchorY + offset;
  const top = clamp(
    preferredTop + resolvedHeight <= viewportHeight - margin
      ? preferredTop
      : anchorY - resolvedHeight - offset,
    margin,
    bottomLimit,
  );

  return {
    left,
    top,
    maxHeight: resolvedMaxHeight,
  };
}
