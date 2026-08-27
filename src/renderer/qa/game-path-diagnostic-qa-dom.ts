import type { GamePathDiagnosticQaFixtureMode } from "../../shared/qa/game-path-diagnostic";

export const removeLauncherSplashForGamePathDiagnosticQaFixture = (
  fixture: {
    readonly runId: string;
    readonly fixtureMode: GamePathDiagnosticQaFixtureMode;
  } | null,
  targetDocument: Document = document,
): boolean => {
  if (!fixture) return false;
  const splash = targetDocument.getElementById("launcher-splash");
  if (!splash) return false;
  splash.remove();
  return true;
};
