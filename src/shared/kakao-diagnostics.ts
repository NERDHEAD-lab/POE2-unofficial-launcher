/** Allowlisted diagnostics: never pass page text, input values or raw errors. */
export const KAKAO_DIAGNOSTIC_PREFIX = "[KakaoDiag] ";

const EVENTS = new Set([
  "ipc.sent",
  "ipc.suppressed",
  "ipc.accepted",
  "ipc.rejected",
  "visibility.request",
  "visibility.suppressed",
  "visibility.applied",
  "visibility.observed",
  "navigation.start",
  "navigation.commit",
  "navigation.failed",
  "navigation.stopped",
  "navigation.in-page",
  "request.sent",
  "request.response",
  "request.failed",
  "task.bound",
  "task.removed",
  "page.dispatch",
  "page.deferred",
  "page.paused",
  "page.resumed",
  "security.state",
  "security.pc-info-click",
  "security.reveal-scheduled",
  "security.reveal-cancelled",
  "security.reveal-fired",
  "observer.started",
  "observer.stopped",
]);
const ENUMS: Record<string, readonly string[]> = {
  reason: [
    "accepted",
    "frame-mismatch",
    "retired",
    "task-challenged",
    "document-uncommitted",
    "document-mismatch",
    "paused",
    "validation",
    "already-requested",
    "timeout",
    "matched",
    "disconnected",
    "url-changed",
    "auto-progress",
    "user-required",
    "unresolved",
    "restored",
    "untracked",
    "no-request",
    "request-mismatch",
    "show",
    "hide",
    "closed",
  ],
  state: ["auto-progress", "user-required", "unresolved"],
  trigger: [
    "ACCOUNT_VALIDATION",
    "ACCOUNT_MANUAL_LOGIN",
    "GAME_START_POE1",
    "GAME_START_POE2",
  ],
  channel: [
    "window-visibility-request",
    "game-status-update",
    "automation:update-timeout",
    "account:update-timeout",
    "kakao:automation-failure",
    "account:clear-trigger",
    "account:trigger-validation",
    "kakao:account-id-fetched",
    "kakao:login-required",
  ],
  handler: [
    "PoeMainHandler",
    "Poe2MainHandler",
    "AccountValidationHandler",
    "DaumGameLoginValidationHandler",
    "SecurityCenterHandler",
    "LauncherCompletionHandler",
    "LauncherCheckHandler",
    "KakaoLoginHandler",
    "KakaoQRLoginHandler",
    "DaumLoginHandler",
    "KakaoGamesMemberLoginHandler",
    "KakaoSimpleLoginHandler",
    "KakaoGamesAgreementHandler",
    "KakaoAuthHandler",
    "StarterInstallPopupHandler",
    "DaumMemberCertHandler",
    "KCBAuthHandler",
    "KCBCardAuthHandler",
    "KakaoLoginValidationHandler",
    "KakaoManualValidationHandler",
  ],
  status: [
    "idle",
    "preparing",
    "processing",
    "authenticating",
    "ready",
    "running",
    "error",
  ],
};
const NUMBERS = new Set([
  "webContentsId",
  "windowId",
  "parentId",
  "taskId",
  "documentId",
  "receivedDocumentId",
  "gateDocumentId",
  "committedDocumentId",
  "requestId",
  "eventRequestId",
  "previousDocumentId",
  "statusCode",
  "errorCode",
  "timeoutMs",
  "elapsedMs",
  "occurrences",
]);
const BOOLEANS = new Set([
  "tracked",
  "retired",
  "challenge",
  "taskBlocked",
  "revealPending",
  "isMainFrame",
  "isSameDocument",
  "visible",
  "focused",
  "minimized",
  "destroyed",
  "requestedVisible",
  "forcedVisible",
  "paused",
  "validation",
  "clicked",
]);
const HOSTS = new Set([
  "security-center.kakaogames.com",
  "pubsvc.kakaogames.com",
  "member.kakaogames.com",
  "poe.kakaogames.com",
  "pathofexile.kakaogames.com",
  "pathofexile2.kakaogames.com",
  "accounts.kakao.com",
  "logins.daum.net",
  "service.kakaogames.com",
]);
const PATHS = new Set([
  "/",
  "/auth",
  "/login",
  "/login/",
  "/login/simple",
  "/main",
  "/inspection",
  "/gamestart/poe.html",
  "/gamestart/poe2.html",
  "/securitycenter/completed.html",
  "/launcher/completed.html",
]);

export function summarizeKakaoDiagnosticUrl(value: string): string {
  if (
    ["https:[other]", "http:[other]", "[other-protocol]", "[invalid]"].includes(
      value,
    )
  )
    return value;
  try {
    const url = new URL(value);
    if (url.protocol === "about:" && url.pathname === "blank")
      return "about:blank";
    if (["kakaogamestarter:", "daumgamestarter:"].includes(url.protocol))
      return url.protocol;
    if (!["http:", "https:"].includes(url.protocol)) return "[other-protocol]";
    if (!HOSTS.has(url.hostname)) return `${url.protocol}[other]`;
    return `${url.protocol}//${url.hostname}${PATHS.has(url.pathname) ? url.pathname : "/[other]"}`;
  } catch {
    return "[invalid]";
  }
}

export type KakaoDiagnosticFields = Record<string, unknown>;
export type KakaoDiagnosticSink = (
  webContentsId: number,
  event: string,
  fields?: KakaoDiagnosticFields,
) => void;

export function formatKakaoDiagnostic(
  event: string,
  fields: KakaoDiagnosticFields = {},
): string {
  const safe: Record<string, string | number | boolean | null> = {
    v: 1,
    event: EVENTS.has(event) ? event : "invalid",
  };
  for (const [key, value] of Object.entries(fields)) {
    if (
      NUMBERS.has(key) &&
      (value === null ||
        (typeof value === "number" && Number.isSafeInteger(value)))
    )
      safe[key] = value;
    else if (BOOLEANS.has(key) && typeof value === "boolean") safe[key] = value;
    else if (ENUMS[key]?.includes(value as string)) safe[key] = value as string;
    else if (
      (key === "runId" || key === "appVersion") &&
      typeof value === "string" &&
      /^[a-zA-Z0-9.-]{1,64}$/.test(value)
    )
      safe[key] = value;
    else if (key === "url" && typeof value === "string")
      safe[key] = summarizeKakaoDiagnosticUrl(value);
  }
  return KAKAO_DIAGNOSTIC_PREFIX + JSON.stringify(safe);
}

export function parseKakaoDiagnostic(
  content: string,
): KakaoDiagnosticFields | null {
  if (!content.startsWith(KAKAO_DIAGNOSTIC_PREFIX) || content.length > 4096)
    return null;
  try {
    const parsed = JSON.parse(content.slice(KAKAO_DIAGNOSTIC_PREFIX.length));
    if (!parsed || !EVENTS.has(parsed.event)) return null;
    return JSON.parse(
      formatKakaoDiagnostic(parsed.event, parsed).slice(
        KAKAO_DIAGNOSTIC_PREFIX.length,
      ),
    );
  } catch {
    return null;
  }
}

/** First occurrence and powers of two; no timers, bounded memory, distinct states retained. */
export class KakaoDiagnosticLimiter {
  private counts = new Map<
    string,
    { owner: unknown; fingerprint: string; count: number }
  >();
  include(event: string, fields: KakaoDiagnosticFields): number | null {
    const identity = { ...fields };
    delete identity.elapsedMs;
    delete identity.occurrences;
    const key = `${fields.webContentsId ?? "preload"}:${event}:${fields.handler ?? ""}:${fields.channel ?? ""}`;
    const fingerprint = formatKakaoDiagnostic(event, identity);
    const previous = this.counts.get(key);
    const entry =
      previous?.fingerprint === fingerprint
        ? previous
        : {
            owner: fields.webContentsId,
            fingerprint,
            count: 0,
          };
    entry.count++;
    if (this.counts.size >= 512 && !this.counts.has(key))
      this.counts.delete(this.counts.keys().next().value!);
    this.counts.set(key, entry);
    return Number.isInteger(Math.log2(entry.count)) ? entry.count : null;
  }
  forget(webContentsId: number) {
    for (const [key, entry] of this.counts)
      if (entry.owner === webContentsId) this.counts.delete(key);
  }
}
