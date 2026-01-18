import { BrowserWindow } from "electron";
import Store from "electron-store";

import { AppConfig } from "../../shared/types";

// Event Types
export enum EventType {
  UI_GAME_START_CLICK = "UI:GAME_START_CLICK",
  CONFIG_CHANGE = "CONFIG:CHANGE",
  PROCESS_START = "PROCESS:START",
  PROCESS_STOP = "PROCESS:STOP",
}

// Payload Interfaces
export interface ProcessPayload {
  name: string;
  // pid?: number; // Optional: Add later if needed
}

export interface ConfigPayload<T = unknown> {
  key: string;
  oldValue: T;
  newValue: T;
}

export interface UIPayload {
  action: string;
  [key: string]: unknown;
}

// Event Structure
export interface AppEvent<T = unknown> {
  type: EventType;
  payload?: T;
  timestamp: number;
}

// Context passed to handlers
export interface AppContext {
  mainWindow: BrowserWindow | null;
  gameWindow: BrowserWindow | null;
  store: Store<AppConfig>;
}

// Handler Interface
export interface EventHandler {
  id: string; // Identifier for debugging
  targetEvent: EventType;

  // Condition check (Return true if this handler should execute)
  condition?: (context: AppContext) => boolean;

  // Execution logic
  handle: (event: AppEvent, context: AppContext) => Promise<void>;
}
