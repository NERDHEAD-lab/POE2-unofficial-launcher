import path from "node:path";

import {
  isGamePathDiagnosticQaFixtureMode,
  isGamePathDiagnosticQaRunId,
  parseGamePathDiagnosticQaSearch,
  type GamePathDiagnosticQaFixtureMode,
} from "../../shared/qa/game-path-diagnostic";

export interface GamePathDiagnosticQaLaunchInput {
  readonly isPackaged: boolean;
  readonly devServerUrl?: string;
  readonly startHidden?: string;
  readonly runId?: string;
  readonly userDataPath?: string;
  readonly fixtureMode?: string;
}

export interface GamePathDiagnosticQaLaunchRequest {
  readonly runId: string;
  readonly userDataPath: string;
  readonly fixtureMode: GamePathDiagnosticQaFixtureMode;
  readonly devServerUrl: string;
}

export type GamePathDiagnosticQaLaunchDecision =
  | { readonly kind: "inactive" }
  | {
      readonly kind: "active";
      readonly request: GamePathDiagnosticQaLaunchRequest;
    };

const isOwnedQaUserDataPath = (
  userDataPath: string,
  runId: string,
): boolean => {
  if (!path.win32.isAbsolute(userDataPath)) return false;
  const normalizedPath = path.win32.normalize(userDataPath);
  const runDirectory = path.win32.basename(normalizedPath);
  const qaRoot = path.win32.basename(path.win32.dirname(normalizedPath));
  return runDirectory === runId && qaRoot.toLowerCase().endsWith("codex-qa");
};

const normalizeDevServerUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "localhost" ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

export const resolveGamePathDiagnosticQaLaunch = (
  input: GamePathDiagnosticQaLaunchInput,
): GamePathDiagnosticQaLaunchDecision => {
  const devServerUrl = input.devServerUrl
    ? normalizeDevServerUrl(input.devServerUrl)
    : null;
  if (
    input.isPackaged ||
    input.startHidden !== "true" ||
    !devServerUrl ||
    !isGamePathDiagnosticQaRunId(input.runId) ||
    !input.userDataPath ||
    !isOwnedQaUserDataPath(input.userDataPath, input.runId) ||
    !isGamePathDiagnosticQaFixtureMode(input.fixtureMode)
  ) {
    return { kind: "inactive" };
  }

  return {
    kind: "active",
    request: {
      runId: input.runId,
      userDataPath: input.userDataPath,
      fixtureMode: input.fixtureMode,
      devServerUrl,
    },
  };
};

export const buildGamePathDiagnosticQaRendererUrl = (
  request: GamePathDiagnosticQaLaunchRequest,
): string => {
  const url = new URL(request.devServerUrl);
  url.searchParams.set("codexQaFixture", request.fixtureMode);
  url.searchParams.set("codexQaRun", request.runId);
  return url.toString();
};

export const isAllowedGamePathDiagnosticQaRendererUrl = (
  candidate: string,
  devServerUrl: string,
  runId: string,
): boolean => {
  try {
    const candidateUrl = new URL(candidate);
    const baseUrl = new URL(devServerUrl);
    const fixture = parseGamePathDiagnosticQaSearch(candidateUrl.search);
    return (
      candidateUrl.origin === baseUrl.origin &&
      candidateUrl.pathname === baseUrl.pathname &&
      candidateUrl.hash === "" &&
      fixture?.runId === runId
    );
  } catch {
    return false;
  }
};
