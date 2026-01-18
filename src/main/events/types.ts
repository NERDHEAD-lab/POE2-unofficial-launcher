import { BrowserWindow } from "electron";
import Store from "electron-store";

import { AppConfig } from "../../shared/types";

// Event Enums
export enum EventType {
  UI_GAME_START_CLICK = "UI:GAME_START_CLICK",
  CONFIG_CHANGE = "CONFIG:CHANGE",
  PROCESS_START = "PROCESS:START",
  PROCESS_STOP = "PROCESS:STOP",
  MESSAGE_GAME_PROGRESS_INFO = "MESSAGE:GAME_PROGRESS_INFO",
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
  };
  timestamp?: number;
}

// 3. UI Event (Game Start Click, etc.)
export interface UIEvent {
  type: EventType.UI_GAME_START_CLICK;
  payload?: void; // No payload needed for now
  timestamp?: number;
}

// 4. Message Event (Game Progress Info, etc.)
export interface MessageEvent {
  type: EventType.MESSAGE_GAME_PROGRESS_INFO;
  payload: {
    text: string;
  };
  timestamp?: number;
}

// --- Discriminated Union ---
export type AppEvent =
  | ConfigChangeEvent
  | ProcessEvent
  | UIEvent
  | MessageEvent;

// --- Context & Handler Interfaces ---

// Context passed to handlers
export interface AppContext {
  mainWindow: BrowserWindow | null;
  gameWindow: BrowserWindow | null;
  store: Store<AppConfig>;
  ensureGameWindow: () => BrowserWindow;
}

// Generic Handler Interface
// T extends AppEvent allows us to narrow down the specific event type.
export interface EventHandler<T extends AppEvent = AppEvent> {
  id: string;
  // The specific event type this handler listens to
  targetEvent: T["type"];

  // Optional condition check
  condition?: (context: AppContext) => boolean;

  // Execution logic
  handle: (event: T, context: AppContext) => Promise<void>;
}
