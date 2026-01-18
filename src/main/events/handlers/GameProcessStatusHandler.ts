import { eventBus } from "../EventBus";
import { EventHandler, EventType, MessageEvent, ProcessEvent } from "../types";

const TARGET_PROCESSES = ["poe2_launcher.exe", "pathofexile.exe"];

const isTargetProcess = (name: string) => {
  return TARGET_PROCESSES.includes(name.toLowerCase());
};

export const GameProcessStartHandler: EventHandler<ProcessEvent> = {
  id: "GameProcessStartHandler",
  targetEvent: EventType.PROCESS_START,

  handle: async (event, context) => {
    const { name } = event.payload;
    if (!isTargetProcess(name)) return;

    // Emit "Game Running" message
    eventBus.emit<MessageEvent>(EventType.MESSAGE_GAME_PROGRESS_INFO, context, {
      text: "게임이 실행 중입니다.",
    });
  },
};

export const GameProcessStopHandler: EventHandler<ProcessEvent> = {
  id: "GameProcessStopHandler",
  targetEvent: EventType.PROCESS_STOP,

  handle: async (event, context) => {
    const { name } = event.payload;
    if (!isTargetProcess(name)) return;

    // 1. Emit "Game Exited" message
    eventBus.emit<MessageEvent>(EventType.MESSAGE_GAME_PROGRESS_INFO, context, {
      text: "게임이 종료되었습니다.",
    });

    // 2. Wait 3 seconds and clear
    setTimeout(() => {
      // Re-check if context/app is still valid?
      // Just emit clear.
      eventBus.emit<MessageEvent>(
        EventType.MESSAGE_GAME_PROGRESS_INFO,
        context,
        { text: "" },
      );
    }, 3000);
  },
};
