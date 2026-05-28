import { session } from "electron";

import { setupSessionSecurity } from "../security/permissions";

export const KAKAO_PARTITION = "persist:kakao_game";

/**
 * Initializes the Kakao Game session partition.
 * Applies security policies and other necessary configurations.
 */
export function initKakaoSession() {
  const sess = session.fromPartition(KAKAO_PARTITION);
  setupSessionSecurity(sess, KAKAO_PARTITION);

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
