import { GameId, ServiceId } from "../../../shared/types";
import { eventBus } from "../EventBus";
import {
  EventHandler,
  EventType,
  GameStatusChangeEvent,
  MessageEvent, // Unused but kept for now to avoid breaking other files if any (though linter complains)
  ProcessEvent,
} from "../types";

const TARGET_PROCESSES = [
  "poe2_launcher.exe",
  "pathofexile.exe",
  "poe_launcher.exe",
];

const isTargetProcess = (name: string) => {
  return TARGET_PROCESSES.includes(name.toLowerCase());
};

const getGameIdFromProcess = (processName: string): GameId | null => {
  const lower = processName.toLowerCase();
  if (lower.includes("poe2") || lower.includes("pathofexile_kg")) return "POE2";
  if (lower.includes("poe_launcher") || lower.includes("pathofexile.exe"))
    return "POE1"; // poe_launcher is often PoE1 Kakao
  return null;
};

// Note: Process Watcher mostly catches Kakao or GGG.
// Since we don't know ServiceId purely from process name easily (unless path check),
// We default to what matches the config if possible, or emit a generic status.
// HOWEVER, to be safe and simple: process watcher usually confirms "Running".
// We will emit status for BOTH services if needed, or rely on the UI to filter.
// Better approach: We emit the GameId. The ServiceId might be tricky.
// Let's assume active context's service channel for now OR emit for both?
// Actually, UI filters by (ActiveGame && ServiceChannel).
// If I emit ServiceId="Kakao Games" but user is on GGG, UI hides it.
// Issue: If I launch GGG, I want to see running.
// Solution: Process Name mapping to Service is hard without path.
// Compromise: We check the STORE to see what was last launched?
// Or: Just emit for the CURRENTLY SELECTED service in store?
// Let's try to grab Service from Store.

export const GameProcessStartHandler: EventHandler<ProcessEvent> = {
  id: "GameProcessStartHandler",
  targetEvent: EventType.PROCESS_START,

  condition: (event, _context) => {
    return isTargetProcess(event.payload.name);
  },

  handle: async (event, context) => {
    const processName = event.payload.name;
    const gameId = getGameIdFromProcess(processName);

    if (!gameId) return;

    // Get current configured service for this game to ensure UI matches?
    // Or just emit.
    // Let's rely on the Store's current selection to "guess" the service if ambiguous,
    // OR we just emit to the active one.
    const serviceChannel = context.store.get("serviceChannel") as ServiceId;

    eventBus.emit<GameStatusChangeEvent>(
      EventType.GAME_STATUS_CHANGE,
      context,
      {
        gameId,
        serviceId: serviceChannel, // Assume the running process belongs to current channel for feedback
        status: "running",
      },
    );
  },
};

export const GameProcessStopHandler: EventHandler<ProcessEvent> = {
  id: "GameProcessStopHandler",
  targetEvent: EventType.PROCESS_STOP,

  condition: (event, _context) => {
    return isTargetProcess(event.payload.name);
  },

  handle: async (event, context) => {
    const processName = event.payload.name;
    const gameId = getGameIdFromProcess(processName);

    if (!gameId) return;

    const serviceChannel = context.store.get("serviceChannel") as ServiceId;

    // Emit Idle
    eventBus.emit<GameStatusChangeEvent>(
      EventType.GAME_STATUS_CHANGE,
      context,
      {
        gameId,
        serviceId: serviceChannel,
        status: "idle",
      },
    );
  },
};
