import { AppConfig } from "../../../shared/types";
import { eventBus } from "../EventBus";
import {
  AppContext,
  EventHandler,
  EventType,
  GameStatusChangeEvent,
  ProcessEvent,
} from "../types";

// --- Callback Definitions ---

type ProcessCallback = (
  event: ProcessEvent,
  context: AppContext,
) => void | Promise<void>;

interface ProcessStrategy {
  processName: string;
  onStart?: ProcessCallback;
  onStop?: ProcessCallback;
}

// --- Helper: Status Emitters ---

const emitGameStatus = (
  context: AppContext,
  gameId: AppConfig["activeGame"],
  serviceId: AppConfig["serviceChannel"],
  status: "running" | "idle" | "stopping", // [Update] Added 'stopping'
) => {
  eventBus.emit<GameStatusChangeEvent>(EventType.GAME_STATUS_CHANGE, context, {
    gameId,
    serviceId,
    status,
  });
};

// ...

const PROCESS_STRATEGIES: ProcessStrategy[] = [
  // 1. Kakao PoE2 Launcher
  {
    processName: "POE2_Launcher.exe",
    onStart: (event, context) => {
      emitGameStatus(context, "POE2", "Kakao Games", "running");
    },
    onStop: (event, context) => {
      // [Update] Transition: running -> stopping -> (3s) -> idle
      emitGameStatus(context, "POE2", "Kakao Games", "stopping");
      setTimeout(() => {
        emitGameStatus(context, "POE2", "Kakao Games", "idle");
      }, 3000);
    },
  },

  // 2. Kakao PoE1 Launcher
  {
    processName: "POE_Launcher.exe",
    onStart: (event, context) => {
      emitGameStatus(context, "POE1", "Kakao Games", "running");
    },
    onStop: (event, context) => {
      // [Update] Transition: running -> stopping -> (3s) -> idle
      emitGameStatus(context, "POE1", "Kakao Games", "stopping");
      setTimeout(() => {
        emitGameStatus(context, "POE1", "Kakao Games", "idle");
      }, 3000);
    },
  },

  // 3. ... (Unchanged)

  // 4. GGG / Generic Client (PathOfExile.exe)
  {
    processName: "PathOfExile.exe",
    onStart: (event, context) => {
      const { path } = event.payload;
      const lowerPath = path?.toLowerCase() || "";

      let gameId: AppConfig["activeGame"];

      if (lowerPath.includes("path of exile 2")) {
        gameId = "POE2";
      } else if (lowerPath.includes("path of exile")) {
        gameId = "POE1";
      } else {
        return;
      }

      emitGameStatus(context, gameId, "GGG", "running");
    },
    onStop: (event, context) => {
      const { path } = event.payload;
      const lowerPath = path?.toLowerCase() || "";

      let gameId: AppConfig["activeGame"];
      if (lowerPath.includes("path of exile 2")) {
        gameId = "POE2";
      } else if (lowerPath.includes("path of exile")) {
        gameId = "POE1";
      } else {
        return;
      }

      // [Update] Transition: running -> stopping -> (3s) -> idle
      emitGameStatus(context, gameId, "GGG", "stopping");
      setTimeout(() => {
        emitGameStatus(context, gameId, "GGG", "idle");
      }, 3000);
    },
  },
];

// --- Exported List for Watcher ---
export const SUPPORTED_PROCESS_NAMES = PROCESS_STRATEGIES.map(
  (s) => s.processName,
);

const isTargetProcess = (name: string) => {
  return SUPPORTED_PROCESS_NAMES.some(
    (n) => n.toLowerCase() === name.toLowerCase(),
  );
};

// --- Handlers ---

export const GameProcessStartHandler: EventHandler<ProcessEvent> = {
  id: "GameProcessStartHandler",
  targetEvent: EventType.PROCESS_START,

  condition: (event) => isTargetProcess(event.payload.name),

  handle: async (event, context) => {
    const processName = event.payload.name.toLowerCase();
    const strategy = PROCESS_STRATEGIES.find(
      (s) => s.processName.toLowerCase() === processName,
    );

    if (strategy?.onStart) {
      await strategy.onStart(event, context);
    }

    // [New] Close/Minimize launcher on game start if configured
    // [Fix] Retrieve 'quitOnGameStart' directly as it is a root-level config key
    const quitOnGameStart = context.getConfig("quitOnGameStart") === true;
    if (
      quitOnGameStart &&
      context.mainWindow &&
      !context.mainWindow.isDestroyed()
    ) {
      console.log(
        "[GameProcess] quitOnGameStart is enabled. Closing main window.",
      );
      context.mainWindow.close();
    }
  },
};

export const GameProcessStopHandler: EventHandler<ProcessEvent> = {
  id: "GameProcessStopHandler",
  targetEvent: EventType.PROCESS_STOP,

  condition: (event) => isTargetProcess(event.payload.name),

  handle: async (event, context) => {
    const processName = event.payload.name.toLowerCase();
    const strategy = PROCESS_STRATEGIES.find(
      (s) => s.processName.toLowerCase() === processName,
    );

    if (strategy?.onStop) {
      await strategy.onStop(event, context);
    }
  },
};
