import { session } from "electron";

import { setupSessionSecurity } from "../security/permissions";

import type { KakaoChallengeGate } from "./cloudflare-challenge";

export const KAKAO_PARTITION = "persist:kakao_game";

/**
 * Initializes the Kakao Game session partition.
 * Applies security policies and other necessary configurations.
 */
export function initKakaoSession(challengeGate: KakaoChallengeGate) {
  const sess = session.fromPartition(KAKAO_PARTITION);
  setupSessionSecurity(sess, KAKAO_PARTITION);

  // Read-only events; keep the independent passkey cancellation listener below.
  sess.webRequest.onSendHeaders((details) =>
    challengeGate.requestStarted(details),
  );
  sess.webRequest.onResponseStarted((details) =>
    challengeGate.responseStarted(details),
  );
  sess.webRequest.onErrorOccurred((details) =>
    challengeGate.requestFailed(details),
  );

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
