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
  UI_UPDATE_DOWNLOAD = "UI:UPDATE_DOWNLOAD",
  UI_UPDATE_INSTALL = "UI:UPDATE_INSTALL",
  CONFIG_CHANGE = "CONFIG:CHANGE",
  PROCESS_START = "PROCESS:START",
  PROCESS_STOP = "PROCESS:STOP",
  MESSAGE_GAME_PROGRESS_INFO = "MESSAGE:GAME_PROGRESS_INFO",
  GAME_STATUS_CHANGE = "GAME:STATUS_CHANGE",
  DEBUG_LOG = "DEBUG:LOG",
  SYSTEM_WAKE_UP = "SYSTEM:WAKE_UP",
  LOG_SESSION_START = "LOG:SESSION_START",
  LOG_WEB_ROOT_FOUND = "LOG:WEB_ROOT_FOUND",
  LOG_BACKUP_WEB_ROOT_FOUND = "LOG:BACKUP_WEB_ROOT_FOUND",
  LOG_ERROR_DETECTED = "LOG:ERROR_DETECTED",
  PATCH_PROGRESS = "PATCH:PROGRESS",
  CONFIG_DELETE = "CONFIG:DELETE",
  // Changelog
  SHOW_CHANGELOG = "UI:SHOW_CHANGELOG",
  // DevTools Sync
  SYNC_DEVTOOLS_VISIBILITY = "DEVTOOLS:SYNC_VISIBILITY",
}

export interface LogBackupWebRootFoundEvent {
  type: EventType.LOG_BACKUP_WEB_ROOT_FOUND;
  payload: {
    gameId: AppConfig["activeGame"];
    serviceId: AppConfig["serviceChannel"];
    pid: number;
    backupWebRoot: string;
    timestamp: number;
  };
  timestamp?: number;
}

export interface LogSessionStartEvent {
  type: EventType.LOG_SESSION_START;
  payload: {
    gameId: AppConfig["activeGame"];
    serviceId: AppConfig["serviceChannel"];
    pid: number;
    timestamp: number;
  };
  timestamp?: number;
}

export interface LogWebRootFoundEvent {
  type: EventType.LOG_WEB_ROOT_FOUND;
  payload: {
    gameId: AppConfig["activeGame"];
    serviceId: AppConfig["serviceChannel"];
    pid: number;
    webRoot: string;
    timestamp: number;
  };
  timestamp?: number;
}

export interface LogErrorDetectedEvent {
  type: EventType.LOG_ERROR_DETECTED;
  payload: {
    gameId: AppConfig["activeGame"];
    serviceId: AppConfig["serviceChannel"];
    pid: number;
    errorCount: number;
    logPath: string;
  };
  timestamp?: number;
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

// 1.1 Config Delete Event
export interface ConfigDeleteEvent {
  type: EventType.CONFIG_DELETE;
  payload: {
    key: string;
    oldValue: unknown;
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
  payload?: void;
  timestamp?: number;
}

export interface UIUpdateCheckEvent {
  type: EventType.UI_UPDATE_CHECK;
  payload?: {
    isSilent?: boolean;
  };
  timestamp?: number;
}

export interface UIUpdateDownloadEvent {
  type: EventType.UI_UPDATE_DOWNLOAD;
  payload?: void;
  timestamp?: number;
}

export interface UIUpdateInstallEvent {
  type: EventType.UI_UPDATE_INSTALL;
  payload?: void;
  timestamp?: number;
}

// 4. Message Event
export interface MessageEvent {
  type: EventType.MESSAGE_GAME_PROGRESS_INFO;
  payload: {
    text: string;
  };
  timestamp?: number;
}

// 5. Game Status Change Event
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

export interface PatchProgressEvent {
  type: EventType.PATCH_PROGRESS;
  payload: {
    status: "waiting" | "downloading" | "done" | "error";
    total: number;
    current: number;
    overallProgress: number;
    files: {
      fileName: string;
      status: "waiting" | "downloading" | "done" | "error";
      progress: number;
      error?: string;
    }[];
    fileName?: string;
    progress?: number;
    error?: string;
  };
  timestamp?: number;
}

export interface SyncDevToolsVisibilityEvent {
  type: EventType.SYNC_DEVTOOLS_VISIBILITY;
  payload?: {
    source?: string;
  };
  timestamp?: number;
}

export interface ShowChangelogEvent {
  type: EventType.SHOW_CHANGELOG;
  payload: {
    changelogs: import("../../shared/types").ChangelogItem[];
    oldVersion?: string;
    newVersion?: string;
  };
  timestamp?: number;
}

// --- Discriminated Union ---
export type AppEvent =
  | ConfigChangeEvent
  | ProcessEvent
  | UIEvent
  | UIUpdateCheckEvent
  | UIUpdateDownloadEvent
  | UIUpdateInstallEvent
  | MessageEvent
  | GameStatusChangeEvent
  | DebugLogEvent
  | SystemWakeUpEvent
  | LogSessionStartEvent
  | LogWebRootFoundEvent
  | LogBackupWebRootFoundEvent
  | LogErrorDetectedEvent
  | PatchProgressEvent
  | ConfigDeleteEvent
  | SyncDevToolsVisibilityEvent
  | ShowChangelogEvent;

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
    isProcessRunning: (
      name: string,
      criteria?: (info: { pid: number; path: string }) => boolean,
    ) => boolean;
  };
  ensureGameWindow: (options?: { service: string }) => BrowserWindow;
  getConfig: (key?: string) => unknown;
  isForcedVisible?: (windowId: number) => boolean;
}

// Generic Handler Interface
export interface EventHandler<T extends AppEvent = AppEvent> {
  id: string;
  targetEvent: T["type"];
  condition?: (event: T, context: AppContext) => boolean;
  debug?: boolean;
  handle: (event: T, context: AppContext) => Promise<void>;
}
