import { ipcMain } from "electron";

import { eventBus } from "../events/EventBus";
import { EventType } from "../events/types";
import { getGameStatus } from "../state/GameStatusStore";
import { logger } from "../utils/logger";

import type { AppConfig, RunStatus } from "../../shared/types";
import type { AppContext, GameStatusChangeEvent } from "../events/types";
import type { SessionContext } from "../game/GameSessionTracker";

interface RegisterGameStatusIpcOptions {
  getAppContext: () => AppContext | undefined;
  getActiveSessionContext: () => SessionContext | null;
  getWindowContext: (webContentsId: number) => SessionContext | undefined;
  acceptsPage?: (
    event: Electron.IpcMainEvent,
    documentId?: number | null,
  ) => boolean;
}

export function registerGameStatusIpc({
  getAppContext,
  getActiveSessionContext,
  getWindowContext,
  acceptsPage,
}: RegisterGameStatusIpcOptions) {
  ipcMain.handle(
    "game:get-status",
    (_event, gameId: string, serviceId: string) => {
      return getGameStatus(gameId, serviceId);
    },
  );

  ipcMain.on(
    "game-status-update",
    (
      event,
      status: unknown,
      msgContext: {
        gameId: AppConfig["activeGame"];
        serviceId: AppConfig["serviceChannel"];
      } | null,
      documentId?: number | null,
    ) => {
      if (acceptsPage && !acceptsPage(event, documentId)) return;
      const appContext = getAppContext();
      if (!appContext) {
        return;
      }

      const senderId = event.sender.id;
      const mappedContext = getWindowContext(senderId);
      const activeSessionContext = getActiveSessionContext();

      // Determine context (Priority: IPC Payload > Window Map > Global Active Session > Defaults)
      const gameId =
        msgContext?.gameId ||
        mappedContext?.gameId ||
        activeSessionContext?.gameId ||
        "POE2";
      const serviceId =
        msgContext?.serviceId ||
        mappedContext?.serviceId ||
        activeSessionContext?.serviceId ||
        "Kakao Games";

      // Only log error if we absolutely don't know the context and had to use hard-coded defaults
      if (
        !msgContext &&
        !mappedContext &&
        !activeSessionContext &&
        (!gameId || !serviceId)
      ) {
        logger.error(
          `[Main] IPC "game-status-update" received from unknown window (${senderId}) with no active session context!`,
        );
      }

      eventBus.emit<GameStatusChangeEvent>(
        EventType.GAME_STATUS_CHANGE,
        appContext,
        {
          gameId: gameId as AppConfig["activeGame"],
          serviceId: serviceId as AppConfig["serviceChannel"],
          status: status as RunStatus,
        },
      );
    },
  );
}
