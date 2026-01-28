import { BrowserWindow } from "electron";
import Store from "electron-store";

import {
  AppConfig,
  GameStatusState,
  DebugLogPayload,
} from "../../shared/types";

// Event Enums
export enum EventType {
  UI_GAME_START_CLICK = "UI:GAME_START_CLICK",
  UI_UPDATE_CHECK = "UI:UPDATE_CHECK",
  CONFIG_CHANGE = "CONFIG:CHANGE",
  PROCESS_START = "PROCESS:START",
  PROCESS_STOP = "PROCESS:STOP",
  MESSAGE_GAME_PROGRESS_INFO = "MESSAGE:GAME_PROGRESS_INFO",
  GAME_STATUS_CHANGE = "GAME:STATUS_CHANGE",
  DEBUG_LOG = "DEBUG:LOG",
  SYSTEM_WAKE_UP = "SYSTEM:WAKE_UP",
  LOG_ERROR_DETECTED = "LOG:ERROR_DETECTED",
  PATCH_PROGRESS = "PATCH:PROGRESS",
}

// --- Payload Definitions & Specific Event Interfaces ---

// 1. Config Change Event
export interface ConfigChangeEvent {
  type: EventType.CONFIG_CHANGE;
  payload: {
    key: string;
    oldValue: unknown;
    newValue: unknown;
  };
  timestamp?: number;
}

// 2. Process Event (Start/Stop)
export interface ProcessEvent {
  type: EventType.PROCESS_START | EventType.PROCESS_STOP;
  payload: {
    name: string;
    path?: string;
    pid: number;
  };
  timestamp?: number;
}

// 3. UI Event (Game Start Click, etc.)
export interface UIEvent {
  type: EventType.UI_GAME_START_CLICK;
  payload?: void; // No payload needed for now
  timestamp?: number;
}

export interface UIUpdateCheckEvent {
  type: EventType.UI_UPDATE_CHECK;
  payload?: void;
  timestamp?: number;
}

// 4. Message Event (Legacy - to be phased out or kept for generic msgs)
export interface MessageEvent {
  type: EventType.MESSAGE_GAME_PROGRESS_INFO;
  payload: {
    text: string;
  };
  timestamp?: number;
}

// 5. Game Status Change Event (New State-Driven)
export interface GameStatusChangeEvent {
  type: EventType.GAME_STATUS_CHANGE;
  payload: GameStatusState;
  timestamp?: number;
}

export interface DebugLogEvent {
  type: EventType.DEBUG_LOG;
  payload: DebugLogPayload;
  timestamp?: number;
}

export interface SystemWakeUpEvent {
  type: EventType.SYSTEM_WAKE_UP;
  payload: {
    reason: string;
  };
  timestamp?: number;
}

export interface LogErrorDetectedEvent {
  type: EventType.LOG_ERROR_DETECTED;
  payload: {
    gameId: AppConfig["activeGame"];
    serviceId: AppConfig["serviceChannel"];
    errorCount: number;
    logPath: string;
  };
  timestamp?: number;
}

export interface PatchProgressEvent {
  type: EventType.PATCH_PROGRESS;
  payload: {
    fileName: string;
    status: "waiting" | "downloading" | "done" | "error";
    progress: number;
    error?: string;
  };
  timestamp?: number;
}

// --- Discriminated Union ---
export type AppEvent =
  | ConfigChangeEvent
  | ProcessEvent
  | UIEvent
  | UIUpdateCheckEvent
  | MessageEvent
  | GameStatusChangeEvent
  | DebugLogEvent
  | SystemWakeUpEvent
  | LogErrorDetectedEvent
  | PatchProgressEvent;

// --- Context & Handler Interfaces ---

// Context passed to handlers
export interface AppContext {
  mainWindow: BrowserWindow | null;
  gameWindow: BrowserWindow | null;
  debugWindow: BrowserWindow | null;
  store: Store<AppConfig>;
  // We use a loose type or interface to avoid strict circular dependency with class
  processWatcher?: {
    startWatching: () => void;
    stopWatching: () => void;
    scheduleSuspension: () => void;
    cancelSuspension: () => void;
    wakeUp: (reason: string) => void;
  };
  ensureGameWindow: () => BrowserWindow;
}

// Generic Handler Interface
// T extends AppEvent allows us to narrow down the specific event type.
export interface EventHandler<T extends AppEvent = AppEvent> {
  id: string;
  // The specific event type this handler listens to
  targetEvent: T["type"];

  // Optional condition check
  // FIXED: Condition now receives the event to make payload-based decisions
  condition?: (event: T, context: AppContext) => boolean;

  // Optional: If false, suppresses "Executing Handler" log in EventBus (Default: true)
  debug?: boolean;

  // Execution logic
  handle: (event: T, context: AppContext) => Promise<void>;
}
