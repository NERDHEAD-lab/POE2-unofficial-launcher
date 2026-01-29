import { app } from "electron";

import { AppConfig } from "../../../shared/types";
import { getConfig } from "../../store";
import { AppContext, EventHandler } from "../types";
import { ConfigChangeEvent, EventType } from "../types";

export const AutoLaunchHandler: EventHandler<ConfigChangeEvent> = {
  id: "AutoLaunchHandler",
  targetEvent: EventType.CONFIG_CHANGE,

  condition: (event) =>
    event.payload.key === "autoLaunch" ||
    event.payload.key === "startMinimized",

  handle: async (_event, _context: AppContext) => {
    // Current State Resolution
    // key가 무엇이든 최신 config 기반으로 재설정
    const currentConfig = getConfig() as AppConfig;
    const shouldAutoLaunch = currentConfig.autoLaunch === true;
    const shouldStartMinimized = currentConfig.startMinimized === true;

    console.log(
      `[AutoLaunch] Syncing settings: OpenAtLogin=${shouldAutoLaunch}, Minimized=${shouldStartMinimized}`,
    );

    if (!app.isPackaged) {
      console.log(
        `[AutoLaunch] Dev mode detected. Skipping OS registration. (HIDDEN_ARG=${shouldStartMinimized ? '"--hidden"' : "NONE"})`,
      );
      return;
    }

    app.setLoginItemSettings({
      openAtLogin: shouldAutoLaunch,
      openAsHidden: false, // Legacy macOS option (we use args instead for cross-platform control)
      path: app.getPath("exe"),
      args: shouldStartMinimized ? ["--hidden"] : [],
    });
  },
};
