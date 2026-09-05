import { session } from "electron";

import { setupSessionSecurity } from "../security/permissions";

import type { KakaoChallengeGate } from "./cloudflare-challenge";
import type { KakaoDiagnosticSink } from "../../shared/kakao-diagnostics";

export const KAKAO_PARTITION = "persist:kakao_game";

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
