export const GAME_PATH_DIAGNOSTIC_QA_FIXTURE_MODES = [
  "diagnostic",
  "selection",
  "partial",
  "delete",
] as const;

export type GamePathDiagnosticQaFixtureMode =
  (typeof GAME_PATH_DIAGNOSTIC_QA_FIXTURE_MODES)[number];

const GAME_PATH_DIAGNOSTIC_QA_QUERY_KEYS = new Set([
  "codexQaRun",
  "codexQaFixture",
]);
const QA_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

export const isGamePathDiagnosticQaFixtureMode = (
  value: unknown,
): value is GamePathDiagnosticQaFixtureMode =>
  typeof value === "string" &&
  GAME_PATH_DIAGNOSTIC_QA_FIXTURE_MODES.some((mode) => mode === value);

export const isGamePathDiagnosticQaRunId = (value: unknown): value is string =>
  typeof value === "string" && QA_RUN_ID_PATTERN.test(value);

export const parseGamePathDiagnosticQaSearch = (
  search: string,
): {
  readonly runId: string;
  readonly fixtureMode: GamePathDiagnosticQaFixtureMode;
} | null => {
  const params = new URLSearchParams(search);
  const keys = [...params.keys()];
  if (
    keys.some((key) => !GAME_PATH_DIAGNOSTIC_QA_QUERY_KEYS.has(key)) ||
    params.getAll("codexQaRun").length !== 1 ||
    params.getAll("codexQaFixture").length !== 1
  ) {
    return null;
  }

  const runId = params.get("codexQaRun");
  const fixtureMode = params.get("codexQaFixture");
  if (
    !isGamePathDiagnosticQaRunId(runId) ||
    !isGamePathDiagnosticQaFixtureMode(fixtureMode)
  ) {
    return null;
  }

  return { runId, fixtureMode };
};
