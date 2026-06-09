import { describe, expect, it } from "vitest";

import {
  getGameStartButtonLabel,
  shouldShowUpdateLabel,
} from "./game-start-label";
import { RunStatus } from "../../shared/types";

const launchActiveStatuses: RunStatus[] = [
  "preparing",
  "processing",
  "authenticating",
  "ready",
  "running",
];

describe("game start button label", () => {
  it("shows install label when the selected game is not installed", () => {
    expect(getGameStartButtonLabel("uninstalled", true)).toBe("설치하기");
    expect(shouldShowUpdateLabel("uninstalled", true)).toBe(false);
  });

  it("shows update label only while the launcher can present a version action", () => {
    expect(getGameStartButtonLabel("idle", true)).toBe("업데이트");
    expect(getGameStartButtonLabel("error", true)).toBe("업데이트");
    expect(getGameStartButtonLabel("stopping", true)).toBe("업데이트");
  });

  it("does not show update label while game launch or play is already active", () => {
    for (const status of launchActiveStatuses) {
      expect(getGameStartButtonLabel(status, true)).toBe("게임 시작");
      expect(shouldShowUpdateLabel(status, true)).toBe(false);
    }
  });

  it("returns game start label when no update is needed", () => {
    expect(getGameStartButtonLabel("idle", false)).toBe("게임 시작");
    expect(getGameStartButtonLabel("running", false)).toBe("게임 시작");
  });
});
