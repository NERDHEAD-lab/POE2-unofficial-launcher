type ErrorReportContextValue = string | number | boolean | null | undefined;

export type PobErrorReportContext = Record<string, ErrorReportContextValue>;

export interface PobErrorReportInput {
  message: string;
  source?: string;
  details?: string;
  context?: PobErrorReportContext;
  timestamp?: Date;
}

const formatContextValue = (value: ErrorReportContextValue): string =>
  value === null || value === undefined || value === "" ? "-" : String(value);

export const buildPobErrorReport = ({
  message,
  source,
  details,
  context,
  timestamp = new Date(),
}: PobErrorReportInput): string => {
  const lines = [
    "PoB Wrapper Error Report",
    `Time: ${timestamp.toISOString()}`,
  ];

  if (source) lines.push(`Source: ${source}`);

  const contextLines = Object.entries(context ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${formatContextValue(value)}`);

  if (contextLines.length > 0) {
    lines.push("", "Context:", ...contextLines);
  }

  lines.push("", "Message:", message);

  if (details) {
    lines.push("", "Details:", details);
  }

  return lines.join("\n");
};
