import { BrowserWindow } from "electron";
import Store from "electron-store";

import {
  AppConfig,
  GameStatusState,
  DebugLogPayload,
  ChangelogItem,
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
  LOG_PATCH_CHECK_COMPLETE = "LOG:PATCH_CHECK_COMPLETE",
  LOG_GAME_STARTUP = "LOG:GAME_STARTUP",
  // Changelog
  SHOW_CHANGELOG = "UI:SHOW_CHANGELOG",
  UPDATE_WINDOW_TITLE = "APP:UPDATE_WINDOW_TITLE",

  // Tool Events
  TOOL_FORCE_REPAIR = "TOOL:FORCE_REPAIR",

  // DevTools Sync
  SYNC_DEVTOOLS_VISIBILITY = "DEVTOOLS:SYNC_VISIBILITY",

  // Patch Reservation & Process Meta
  PROCESS_WILL_TERMINATE = "PROCESS:WILL_TERMINATE",
  PATCH_RETRY_REQUESTED = "PATCH:RETRY_REQUESTED",
  PATCH_RESERVATION_FAILED = "PATCH:RESERVATION_FAILED",
  PATCH_RESERVATION_SUCCESS = "PATCH:RESERVATION_SUCCESS",
  PATCH_UI_TITLE_TICK = "PATCH:UI_TITLE_TICK",
}

export interface ToolForceRepairEvent {
  type: EventType.TOOL_FORCE_REPAIR;
  payload: {
    installPath: string;
    serviceId: AppConfig["serviceChannel"];
    webRoot: string;
  };
  timestamp?: number;
}

export interface UpdateWindowTitleEvent {
  type: EventType.UPDATE_WINDOW_TITLE;
  payload?: void;
  timestamp?: number;
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

export interface LogPatchCheckCompleteEvent {
  type: EventType.LOG_PATCH_CHECK_COMPLETE;
  payload: {
    gameId: AppConfig["activeGame"];
    serviceId: AppConfig["serviceChannel"];
    pid: number;
    timestamp: number;
  };
  timestamp?: number;
}

export interface LogGameStartupEvent {
  type: EventType.LOG_GAME_STARTUP;
  payload: {
    gameId: AppConfig["activeGame"];
    serviceId: AppConfig["serviceChannel"];
    pid: number;
    timestamp: number;
    startupTime: number; // seconds
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
  payload?: {
    isSilent?: boolean;
  };
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
    changelogs: ChangelogItem[];
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
  | UpdateWindowTitleEvent
  | ShowChangelogEvent
  | LogGameStartupEvent
  | LogPatchCheckCompleteEvent
  | ToolForceRepairEvent
  | ProcessWillTerminateEvent
  | PatchRetryRequestedEvent
  | PatchReservationFailedEvent
  | PatchReservationSuccessEvent
  | PatchUiTitleTickEvent;

export interface PatchUiTitleTickEvent {
  type: EventType.PATCH_UI_TITLE_TICK;
  payload: {
    processName: string;
    pid: number;
    title: string;
    gameId?: string;
    serviceId?: string;
    timestamp: number;
  };
  timestamp?: number;
}

export interface ProcessWillTerminateEvent {
  type: EventType.PROCESS_WILL_TERMINATE;
  payload: { pid: number };
  timestamp?: number;
}

export interface PatchRetryRequestedEvent {
  type: EventType.PATCH_RETRY_REQUESTED;
  payload: {
    gameId: string;
    serviceId: string;
    retryCount: number;
  };
  timestamp?: number;
}

export interface PatchReservationFailedEvent {
  type: EventType.PATCH_RESERVATION_FAILED;
  payload: {
    gameId: string;
    serviceId: string;
    reason: string;
  };
  timestamp?: number;
}

export interface PatchReservationSuccessEvent {
  type: EventType.PATCH_RESERVATION_SUCCESS;
  payload: {
    gameId: string;
    serviceId: string;
  };
  timestamp?: number;
}

/**
 * Interface for background services with life-cycle management.
 * Similar to Java's Closeable, but for async Electron environment.
 */
export interface IService {
  readonly id: string;
  init?(): Promise<void> | void;
  stop(): Promise<void> | void;
}

/**
 * Manager to handle multiple IService instances.
 */
export interface IServiceManager {
  register(service: IService): void;
  get<T extends IService>(id: string): T | undefined;
  stopAll(): Promise<void>;
}

/**
 * Interface for the ProcessWatcher functionality within AppContext.
 * This describes the public API used by handlers.
 */
export interface IProcessWatcher {
  startWatching: (intervalMs?: number) => void;
  stopWatching: () => void;
  scheduleSuspension: () => void;
  cancelSuspension: () => void;
  wakeUp: (reason: string) => void;
  isProcessRunning: (
    name: string,
    criteria?: (info: { pid: number; path: string }) => boolean,
  ) => boolean;
}

// Context passed to handlers
export interface AppContext {
  mainWindow: BrowserWindow | null;
  gameWindow: BrowserWindow | null;
  debugWindow: BrowserWindow | null;
  store: Store<AppConfig>;
  // [v43] Unified service manager instead of individual fields
  serviceManager: IServiceManager;
  // Keep legacy individual field for now to avoid massive refactoring,
  // but typed properly to avoid 'any' lint warnings.
  processWatcher?: IProcessWatcher;
  ensureGameWindow: (options?: { service: string }) => BrowserWindow;
  getConfig: (key?: string) => unknown;
  isForcedVisible?: (windowId: number) => boolean;
  disableValidationMode: () => void;
  getActiveAutomationWindow: () => BrowserWindow | null;
}

// Generic Handler Interface
export interface EventHandler<T extends AppEvent = AppEvent> {
  id: string;
  targetEvent: T["type"];
  condition?: (event: T, context: AppContext) => boolean;
  debug?: boolean;
  handle: (event: T, context: AppContext) => Promise<void>;
}
