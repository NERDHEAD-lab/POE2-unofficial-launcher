import { session } from "electron";

import {
  classifyLoginRequired,
  COOKIE_CHANGE_CAUSES,
  COOKIE_DOMAIN_GROUPS,
} from "../../shared/kakao-diagnostics";
import { setupSessionSecurity } from "../security/permissions";

import type { KakaoChallengeGate } from "./cloudflare-challenge";
import type { KakaoDiagnosticSink } from "../../shared/kakao-diagnostics";

export const KAKAO_PARTITION = "persist:kakao_game";
const observedSessions = new WeakSet<Electron.Session>();

/** Account outcomes are meaningful only after the current Kakao main frame is accepted. */
export function createKakaoPageFilter(
  gate: KakaoChallengeGate,
  diagnostic: KakaoDiagnosticSink,
) {
  return (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
    documentId?: number | null,
    channel?: string,
    loginRequiredUrl?: string,
  ) => {
    if (event.sender.session !== session.fromPartition(KAKAO_PARTITION))
      return true;
    const id = event.sender.id;
    const isMainFrame = event.senderFrame === event.sender.mainFrame;
    const accepted = isMainFrame && gate.accepts(id, documentId);
    try {
      diagnostic(id, accepted ? "ipc.accepted" : "ipc.rejected", {
        channel,
        receivedDocumentId: documentId ?? null,
        reason: isMainFrame
          ? gate.diagnosticState(id, documentId).reason
          : "frame-mismatch",
        isMainFrame,
      });
      // Untracked legacy pages may pass the existing gate with a null document.
      // Keep their IPC behavior, without attributing a confirmed outcome to them.
      if (
        accepted &&
        documentId != null &&
        channel === "kakao:account-id-fetched"
      )
        diagnostic(id, "account.result", {
          accountResult: "account-confirmed",
        });
      if (accepted && documentId != null && channel === "kakao:login-required")
        diagnostic(id, "account.result", {
          accountResult: classifyLoginRequired(loginRequiredUrl),
        });
    } catch {
      /* Diagnostics must not change whether the existing IPC handler runs. */
    }
    return accepted;
  };
}

function observeCookieChanges(
  sess: Electron.Session,
  diagnostic: KakaoDiagnosticSink,
) {
  if (observedSessions.has(sess)) return;
  // The partition outlives its windows. Counters have only finite, allowlisted keys.
  const counts = new Map<string, number>();
  try {
    sess.cookies.on("changed", (_event, cookie, cause, removed) => {
      try {
        const domain = cookie.domain?.toLowerCase().replace(/^\./, "");
        const cookieGroup = COOKIE_DOMAIN_GROUPS.find(
          (group) => domain === group || domain?.endsWith(`.${group}`),
        );
        if (!cookieGroup) return;
        const cookieLife =
          cookie.session === undefined
            ? "unknown"
            : cookie.session
              ? "session"
              : "persistent";
        const cookieCause = COOKIE_CHANGE_CAUSES.includes(cause)
          ? cause
          : "unknown";
        const key = `${cookieGroup}:${cookieLife}:${cookieCause}:${removed}`;
        const cookieCount = (counts.get(key) ?? 0) + 1;
        counts.set(key, cookieCount);
        if (Number.isInteger(Math.log2(cookieCount)))
          diagnostic(null, "session.cookie", {
            cookieGroup,
            cookieLife,
            cookieCause,
            removed,
            cookieCount,
          });
      } catch {
        /* Cookie observation must not interrupt other consumers of this event. */
      }
    });
    observedSessions.add(sess);
  } catch {
    /* Authentication and security setup still run if observation is unavailable. */
  }
}

/**
 * Initializes the Kakao Game session partition.
 * Applies security policies and other necessary configurations.
 */
export function initKakaoSession(
  challengeGate: KakaoChallengeGate,
  diagnostic: KakaoDiagnosticSink = () => {},
) {
  const sess = session.fromPartition(KAKAO_PARTITION);
  setupSessionSecurity(sess, KAKAO_PARTITION);
  observeCookieChanges(sess, diagnostic);

  // Read-only events; keep the independent passkey cancellation listener below.
  sess.webRequest.onSendHeaders((details) => {
    challengeGate.requestStarted(details);
    if (details.resourceType === "mainFrame")
      diagnostic(details.webContentsId ?? -1, "request.sent", {
        url: details.url,
        eventRequestId: details.id,
      });
  });
  sess.webRequest.onResponseStarted((details) => {
    challengeGate.responseStarted(details);
    if (details.resourceType === "mainFrame")
      diagnostic(details.webContentsId ?? -1, "request.response", {
        url: details.url,
        eventRequestId: details.id,
        statusCode: details.statusCode,
      });
  });
  sess.webRequest.onErrorOccurred((details) => {
    const id = details.webContentsId ?? -1;
    const before = challengeGate.diagnosticState(id);
    challengeGate.requestFailed(details);
    if (details.resourceType === "mainFrame")
      diagnostic(id, "request.failed", {
        ...challengeGate.diagnosticState(id),
        url: details.url,
        eventRequestId: details.id,
        reason: !before.tracked
          ? "untracked"
          : before.requestId === null
            ? "no-request"
            : before.requestId !== details.id
              ? "request-mismatch"
              : "restored",
      });
  });

  // --- FINAL SECURITY: Block Passkey API requests (Kakao Specific) ---
  // This prevents the Kakao login page from even attempting to start the Passkey auth sequence.
  sess.webRequest.onBeforeRequest(
    { urls: ["https://accounts.kakao.com/api/v2/passkey/*"] },
    (details, callback) => {
      // logger.log(`[Security] Blocked Passkey API request: ${details.url}`);
      callback({ cancel: true });
    },
  );
}
