import { app } from "electron";

import { EventHandler } from "../types";
import { ConfigChangeEvent, EventType } from "../types";
import { AppContext } from "../types";

export const AutoLaunchHandler: EventHandler<ConfigChangeEvent> = {
  id: "AutoLaunchHandler",
  targetEvent: EventType.CONFIG_CHANGE,

  condition: (event) => event.payload.key === "autoLaunch",

  handle: async (event, _context: AppContext) => {
    const shouldAutoLaunch = event.payload.newValue as boolean;
    console.log(`[AutoLaunch] Setting openAtLogin to ${shouldAutoLaunch}`);

    if (!app.isPackaged) {
      console.log(
        `[AutoLaunch] Dev mode detected. Skipping OS registration (openAtLogin=${shouldAutoLaunch}).`,
      );
      return;
    }

    app.setLoginItemSettings({
      openAtLogin: shouldAutoLaunch,
      openAsHidden: false,
      path: app.getPath("exe"),
    });
  },
};
