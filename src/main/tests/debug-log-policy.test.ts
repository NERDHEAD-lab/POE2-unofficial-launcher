import { describe, expect, it } from "vitest";

import {
  buildErrorReportData,
  formatDebugLogLine,
  formatRelativeDebugLogTime,
  getDebugLogNotificationId,
  getDebugLogNotificationTitle,
  getRecentErrorLogs,
  isExceptionDebugLog,
} from "../../shared/debug-log-policy";

import type { DebugLogPayload } from "../../shared/types";

function log(input: Partial<DebugLogPayload>): DebugLogPayload {
  return {
    type: "GENERAL",
    content: "",
    isError: false,
    timestamp: 0,
    ...input,
  };
}

describe("debug log policy", () => {
  it("does not flag normal errors as exception notifications", () => {
    expect(
      isExceptionDebugLog(
        log({
          isError: true,
          content: "Install path not found.",
        }),
      ),
    ).toBe(false);
  });

  it("flags uncaught exception logs", () => {
    expect(
      isExceptionDebugLog(
        log({
          isError: true,
          type: "Fatal",
          content: "[uncaughtException] TypeError: Cannot read property",
        }),
      ),
    ).toBe(true);
  });

  it("flags error logs that include stack traces", () => {
    expect(
      isExceptionDebugLog(
        log({
          isError: true,
          content:
            'Failed to execute {"stack":"Error: boom\\n    at run (main.ts:1:1)"}',
        }),
      ),
    ).toBe(true);
  });

  it("formats a debug log line for reports", () => {
    expect(
      formatDebugLogLine(
        log({
          type: "PRELOAD",
          content: "Error: boom",
          timestamp: 0,
        }),
      ),
    ).toContain("[PRELOAD] Error: boom");
  });

  it("collects recent error logs for manual bug reports", () => {
    const logs = [
      log({ content: "normal" }),
      log({ isError: true, content: "first error", timestamp: 1 }),
      log({ isError: true, content: "second error", timestamp: 2 }),
    ];

    expect(getRecentErrorLogs(logs).map((entry) => entry.content)).toEqual([
      "first error",
      "second error",
    ]);
  });

  it("builds a user-facing summary with kakao dump archive path", () => {
    const selectedLog = log({
      type: "GENERAL",
      isError: true,
      timestamp: 10,
      content:
        "[KakaoStartFailure] 게임 실행 또는 로그인 절차 중 오류가 발생했습니다.\n오류 코드: KAKAO_AUTOMATION_HANDLER_FAILURE",
    });
    const dumpLog = log({
      type: "KakaoPageDump",
      isError: true,
      timestamp: 11,
      content:
        "게임 실행 실패 진단 덤프가 생성되었습니다: D:\\Launcher\\debug-dumps\\kakao-start.zip",
    });

    const report = buildErrorReportData([selectedLog, dumpLog], selectedLog);

    expect(report.errorDetails).toContain("KAKAO_AUTOMATION_HANDLER_FAILURE");
    expect(report.errorDetails).toContain("kakao-start.zip");
    expect(report.errorSummary).toContain(
      "게임 실행 또는 로그인 절차 중 오류가 발생했습니다.",
    );
    expect(report.errorSummary).toContain(
      "진단 덤프 파일: D:\\Launcher\\debug-dumps\\kakao-start.zip",
    );
    expect(report.occurredAt).toBe(selectedLog.timestamp);
  });

  it("uses the newest recent error timestamp for manual reports", () => {
    const report = buildErrorReportData([
      log({ isError: true, content: "first", timestamp: 10 }),
      log({ content: "normal", timestamp: 30 }),
      log({ isError: true, content: "latest", timestamp: 20 }),
    ]);

    expect(report.occurredAt).toBe(20);
  });

  it("does not invent an occurrence timestamp without an error", () => {
    const report = buildErrorReportData([
      log({ content: "normal", timestamp: 30 }),
    ]);

    expect(report.occurredAt).toBeUndefined();
  });

  it("uses concise notification labels and relative time", () => {
    const kakaoLog = log({
      isError: true,
      content:
        "[KakaoStartFailure] 게임 실행 또는 로그인 절차 중 오류가 발생했습니다.",
    });

    expect(getDebugLogNotificationTitle(kakaoLog)).toBe(
      "카카오 게임 실행 중 오류가 발생했습니다.",
    );
    expect(formatRelativeDebugLogTime(60_000, 180_000)).toBe("2분 전");
  });

  it("creates a stable compact notification id", () => {
    const target = log({
      type: "GENERAL",
      isError: true,
      timestamp: 123,
      content: "Error: boom",
    });

    expect(getDebugLogNotificationId(target)).toBe(
      getDebugLogNotificationId({ ...target }),
    );
    expect(getDebugLogNotificationId(target)).toMatch(
      /^123:GENERAL:[a-z0-9]+$/,
    );
  });
});
