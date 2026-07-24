import type { DebugLogPayload } from "./types";

export interface ErrorReportData {
  errorDetails: string;
  errorSummary: string;
  occurredAt?: number;
}

const EXCEPTION_LOG_PATTERNS = [
  /exception/i,
  /uncaught/i,
  /unhandled\s*rejection/i,
  /"stack"\s*:/i,
  /\bstack\b/i,
  /\n\s*at\s+/i,
] as const;

const MAX_RECENT_ERROR_LOGS = 20;

export function isExceptionDebugLog(log: DebugLogPayload): boolean {
  if (!log.isError) return false;

  const haystack = `${log.type}\n${log.content}`;
  return EXCEPTION_LOG_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function formatDebugLogLine(log: DebugLogPayload): string {
  const time = new Date(log.timestamp).toLocaleTimeString();
  return `[${time}] [${log.type}] ${log.content}`;
}

export function getRecentErrorLogs(
  logs: DebugLogPayload[],
  limit = MAX_RECENT_ERROR_LOGS,
): DebugLogPayload[] {
  return logs.filter((log) => log.isError).slice(-limit);
}

export function getExceptionDebugLogs(
  logs: DebugLogPayload[],
  limit = MAX_RECENT_ERROR_LOGS,
): DebugLogPayload[] {
  return logs.filter(isExceptionDebugLog).slice(-limit);
}

export function buildErrorReportData(
  logs: DebugLogPayload[],
  selectedLog?: DebugLogPayload,
): ErrorReportData {
  const recentErrorLogs = getRecentErrorLogs(logs);
  const reportLogs = selectedLog
    ? [
        selectedLog,
        ...recentErrorLogs.filter((log) => !isSameDebugLog(log, selectedLog)),
      ].slice(0, MAX_RECENT_ERROR_LOGS)
    : recentErrorLogs;

  return {
    errorDetails: reportLogs.map(formatDebugLogLine).join("\n"),
    errorSummary: buildUserErrorSummary(reportLogs),
    occurredAt: selectedLog?.timestamp ?? recentErrorLogs.at(-1)?.timestamp,
  };
}

export function getDebugLogNotificationTitle(log: DebugLogPayload): string {
  if (log.content.includes("KakaoPageDump")) {
    return "진단 덤프 파일이 생성되었습니다.";
  }

  if (isKakaoGameStartFailure(log)) {
    return "카카오 게임 실행 중 오류가 발생했습니다.";
  }

  if (isExceptionDebugLog(log)) {
    return "런처 오류가 발생했습니다.";
  }

  return "오류 로그가 기록되었습니다.";
}

export function getDebugLogPreview(log: DebugLogPayload): string {
  return log.content.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function getDebugLogNotificationId(log: DebugLogPayload): string {
  return `${log.timestamp}:${log.type}:${hashDebugLogContent(log.content)}`;
}

export function formatRelativeDebugLogTime(
  timestamp: number,
  now = Date.now(),
): string {
  const elapsedMs = Math.max(0, now - timestamp);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (elapsedMinutes < 1) return "방금 전";
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}시간 전`;

  return new Date(timestamp).toLocaleString();
}

function buildUserErrorSummary(logs: DebugLogPayload[]): string {
  if (logs.length === 0) {
    return "최근에 기록된 오류 로그가 없습니다.";
  }

  const dumpArchivePath = findDumpArchivePath(logs);
  const hasKakaoGameStartFailure = logs.some(isKakaoGameStartFailure);
  const hasKakaoDump = logs.some((log) =>
    log.content.includes("KakaoPageDump"),
  );

  const lines: string[] = [];
  if (hasKakaoGameStartFailure || hasKakaoDump) {
    lines.push("게임 실행 또는 로그인 절차 중 오류가 발생했습니다.");
  } else {
    lines.push("런처 사용 중 오류가 발생했습니다.");
  }

  if (dumpArchivePath) {
    lines.push(`진단 덤프 파일: ${dumpArchivePath}`);
    lines.push("문의 시 위 파일을 함께 첨부해 주세요.");
  } else if (hasKakaoGameStartFailure || hasKakaoDump) {
    lines.push(
      "진단 덤프 파일 경로는 아직 확인되지 않았습니다. 아래 최근 오류 정보를 함께 전달해 주세요.",
    );
  } else {
    lines.push("아래 최근 오류 정보를 함께 전달해 주세요.");
  }

  return lines.join("\n");
}

function findDumpArchivePath(logs: DebugLogPayload[]): string | null {
  for (const log of [...logs].reverse()) {
    const match =
      log.content.match(/([A-Za-z]:\\[^\n\r"]+?\.zip)/) ||
      log.content.match(/(\/[^\n\r"]+?\.zip)/);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function hashDebugLogContent(content: string): string {
  let hash = 5381;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 33) ^ content.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function isKakaoGameStartFailure(log: DebugLogPayload): boolean {
  return (
    log.content.includes("Kakao game start failure") ||
    log.content.includes("KakaoStartFailure") ||
    log.content.includes("카카오") ||
    log.content.includes("KakaoPageDump")
  );
}

function isSameDebugLog(a: DebugLogPayload, b: DebugLogPayload): boolean {
  return (
    a.timestamp === b.timestamp && a.type === b.type && a.content === b.content
  );
}
