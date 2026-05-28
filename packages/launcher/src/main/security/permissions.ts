import { Session } from "electron";

import { logger } from "../utils/logger";

// Security: Explicitly blocked permissions
export const BLOCKED_PERMISSIONS = [
  // WebAuthn (Passkey)
  "authenticator",
  // Camera/Microphone
  "media",
  // Location
  "geolocation",
  // Browser Notifications
  "notifications",
  "midi",
  "midiSysex",
  "pointerLock",
  "fullscreen",
  // "openExternal",
  // Programmatic clipboard read
  "clipboard-read",
];

// Session Security Setup Helper
export function setupSessionSecurity(
  sess: Session,
  partitionName: string = "default",
) {
  logger.log(`[Security] Applying policy to partition: ${partitionName}`);

  sess.setPermissionRequestHandler((webContents, permission, callback) => {
    // 1. Block defined permissions
    if (BLOCKED_PERMISSIONS.includes(permission)) {
      // logger.log(`[Security] Blocked permission: ${permission} (${partitionName})`);
      return callback(false);
    }

    // 2. Allow others
    callback(true);
  });
}
