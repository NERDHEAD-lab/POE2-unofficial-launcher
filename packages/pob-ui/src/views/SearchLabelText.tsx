import type {
  PobSearchLabelProjection,
  PobTextRange,
} from "./repoeTranslations";
import type { ReactNode } from "react";

interface HighlightedSearchTextProps {
  text: string;
  ranges: PobTextRange[];
}

function HighlightedSearchText({ text, ranges }: HighlightedSearchTextProps) {
  if (ranges.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    const start = Math.max(0, Math.min(range.start, text.length));
    const end = Math.max(start, Math.min(range.end, text.length));
    if (start > cursor) {
      parts.push(
        <span key={`text-${index}`}>{text.slice(cursor, start)}</span>,
      );
    }
    if (end > start) {
      parts.push(
        <mark key={`match-${index}`} className="pob-search-highlight">
          {text.slice(start, end)}
        </mark>,
      );
    }
    cursor = end;
  });

  if (cursor < text.length) {
    parts.push(<span key="text-tail">{text.slice(cursor)}</span>);
  }

  return <>{parts}</>;
}

interface SearchLabelTextProps {
  projection: PobSearchLabelProjection;
}

export function SearchLabelText({ projection }: SearchLabelTextProps) {
  return (
    <>
      <HighlightedSearchText
        text={projection.localizedLabel}
        ranges={projection.localizedHighlightRanges}
      />
      {projection.showSourceEnglish && projection.sourceEnglishLabel ? (
        <span className="pob-search-source-label">
          {" ("}
          <HighlightedSearchText
            text={projection.sourceEnglishLabel}
            ranges={projection.sourceEnglishHighlightRanges}
          />
          {")"}
        </span>
      ) : null}
    </>
  );
}
