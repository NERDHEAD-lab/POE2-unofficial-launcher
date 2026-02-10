import { BrowserWindow } from "electron";

import { logger } from "../../utils/logger";
import {
  AppContext,
  ConfigChangeEvent,
  EventHandler,
  EventType,
} from "../types";

export const InactiveWindowVisibilityHandler: EventHandler<ConfigChangeEvent> =
  {
    id: "InactiveWindowVisibilityHandler",
    targetEvent: EventType.CONFIG_CHANGE,
    condition: (event) => event.payload.key === "show_inactive_windows",

    handle: async (event, context: AppContext) => {
      const { mainWindow } = context;
      const showInactive = event.payload.newValue === true;

      logger.log(
        `[InactiveWindowVisibilityHandler] Config changed. Show Inactive: ${showInactive}`,
      );

      // Apply to ALL Windows
      BrowserWindow.getAllWindows().forEach((win) => {
        if (win.isDestroyed()) return;

        // Skip Main Window (Always handled by its own logic/user)
        if (mainWindow && win.id === mainWindow.id) return;

        // Skip Debug Window (Handled by DevToolsVisibilityHandler or separate logic if needed)
        if (context.debugWindow && win.id === context.debugWindow.id) return;

        // But usually, debug window is also "inactive" context, so we might want to show it.
        // For now, let's treat all non-main windows as target.

        if (showInactive) {
          if (!win.isVisible()) {
            logger.log(
              `[InactiveWindowVisibilityHandler] Showing window: ${win.title} (ID: ${win.id})`,
            );

            win.showInactive(); // Revert to showInactive as requested
            win.moveTop(); // Prioritize Z-order
          }
        } else {
          // Check if this window is Forced Visible (e.g. Homepage via PageHandler)
          if (context.isForcedVisible && context.isForcedVisible(win.id)) {
            // Do NOT hide
            return;
          }

          if (win.isVisible()) {
            // [Safety] Don't hide if it's the Game Window and user is playing?
            // Actually, gameWindow is managed by game status.
            // If it's "inactive" but visible, it might be the actual game stream.
            // However, the "Game Window" is usually the main interaction point.
            // Let's refine:

            // If it is the Game Window, we should NOT hide it if the game is running/active.
            // But this option is "show_inactive_windows".
            // The original intent of this option was to show BACKGROUND/HIDDEN windows (like authentication popups).

            // If we blindly hide everything, we might hide the Game Window if it's considered "secondary".
            // Let's check if it's the gameWindow.
            if (context.gameWindow && win.id === context.gameWindow.id) {
              // GameWindow visibility is controlled by GameStatus (e.g. show when game starts).
              // We should NOT forcefully hide it just because this debug option is turned off.
              return;
            }

            logger.log(
              `[InactiveWindowVisibilityHandler] Hiding window: ${win.title} (ID: ${win.id})`,
            );
            win.hide();
          }
        }
      });
    },
  };
