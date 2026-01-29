export const CONFIG_CATEGORIES = [
  "General",
  "Game",
  "Appearance",
  "Patch",
  "Debug",
] as const;

export type ConfigCategory = (typeof CONFIG_CATEGORIES)[number];

export interface ConfigDefinition {
  key: string;
  name: string;
  category: ConfigCategory;
  description: string;
}

export interface AppConfig {
  [key: string]: unknown;
  serviceChannel: "Kakao Games" | "GGG";
  activeGame: "POE1" | "POE2";
  themeCache: Partial<
    Record<
      "POE1" | "POE2",
      { text: string; accent: string; footer: string; hash: string }
    >
  >;
  autoFixPatchError: boolean;
  autoGameStartAfterFix: boolean;
  backupPatchFiles: boolean;
  autoLaunch: boolean;
  startMinimized: boolean;
  closeAction: "minimize" | "close";
  quitOnGameStart: boolean;
  showOnboarding: boolean;
}

// Granular Status Codes for granular UI feedback
export type RunStatus =
  | "idle"
  | "uninstalled" // "게시판이나 공식 홈페이지를 통해 먼저 설치해주세요."
  | "preparing" // "실행 절차 준비"
  | "processing" // "실행 절차 진행 중"
  | "authenticating" // "지정 PC 확인"
  | "ready" // "게임실행 준비가 완료되었습니다!"
  | "running" // "게임 실행 중"
  | "error";

export interface GameStatusState {
  gameId: AppConfig["activeGame"];
  serviceId: AppConfig["serviceChannel"];
  status: RunStatus;
  errorCode?: string;
  timestamp?: number;
}

export interface FileProgress {
  fileName: string;
  status: "waiting" | "downloading" | "done" | "error";
  progress: number;
  error?: string;
}

export interface BackupMetadata {
  timestamp: string; // ISO Date String
  pid?: number;
  files: string[];
  version?: string;
}

export interface PatchProgress {
  status: "waiting" | "downloading" | "done" | "error";
  total: number;
  current: number;
  overallProgress: number; // New: Overall percentage
  files: FileProgress[]; // New: Detailed list
  // Legacy/Convenience helpers for single-file view (optional, can be derived)
  fileName?: string;
  progress?: number;
  error?: string;
}

export interface DebugLogPayload {
  type: string; // Allow dynamic types (e.g., "process_normal", "process_admin")
  content: string;
  isError: boolean;
  timestamp: number;
  typeColor?: string; // Hex color for the [TYPE] label
  textColor?: string; // Hex color for the content text
}

export interface ElectronAPI {
  triggerGameStart: () => void;
  minimizeWindow: () => void;
  closeWindow: () => void;
  getConfig: (key?: string) => Promise<unknown>;
  setConfig: (key: string, value: unknown) => Promise<void>;
  getFileHash: (path: string) => Promise<string>;
  onConfigChange: (
    callback: (key: string, value: unknown) => void,
  ) => () => void;
  onProgressMessage?: (callback: (text: string) => void) => void; // Deprecated
  onGameStatusUpdate?: (callback: (status: GameStatusState) => void) => void;
  onDebugLog?: (callback: (log: DebugLogPayload) => void) => () => void;
  onPatchProgress?: (callback: (progress: PatchProgress) => void) => () => void; // New
  onShowPatchFixModal?: (
    callback: (data: {
      autoStart: boolean;
      serviceId?: string;
      gameId?: string;
    }) => void,
  ) => () => void; // New
  triggerManualPatchFix: (
    serviceId?: AppConfig["serviceChannel"],
    gameId?: AppConfig["activeGame"],
  ) => void; // New
  triggerPatchCancel: () => void; // New
  checkBackupAvailability?: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ) => Promise<boolean | BackupMetadata>; // New
  saveReport: (files: { name: string; content: string }[]) => Promise<boolean>;
  getNews: (
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ) => Promise<NewsItem[]>;
  getNewsCache: (
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ) => Promise<NewsItem[]>;
  getNewsContent: (id: string, link: string) => Promise<string>;
  markNewsAsRead: (id: string) => Promise<void>;
  markMultipleNewsAsRead: (ids: string[]) => Promise<void>;
  onNewsUpdated: (callback: () => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  checkForUpdates: () => Promise<void>; // Manually trigger check
  downloadUpdate: () => void; // Trigger download
  installUpdate: () => void; // Trigger install & restart
  onUpdateStatusChange: (
    callback: (status: UpdateStatus) => void,
  ) => () => void;

  // [UAC Bypass API]
  isUACBypassEnabled: () => Promise<boolean>;
  enableUACBypass: () => Promise<boolean>;
  disableUACBypass: () => Promise<boolean>;

  // [App Control]
  relaunchApp: () => void;
  logoutSession: () => Promise<boolean>;
}

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking"; isSilent?: boolean }
  | { state: "available"; version: string; isSilent?: boolean }
  | { state: "not-available"; isSilent?: boolean }
  | { state: "error"; message?: string; isSilent?: boolean }
  | { state: "downloading"; progress: number; isSilent?: boolean }
  | { state: "downloaded"; version: string; isSilent?: boolean };

export interface NewsItem {
  id: string; // Thread ID or unique hash
  title: string;
  link: string;
  date: string;
  type: NewsCategory;
  isNew?: boolean;
  isSticky?: boolean;
}

export type NewsCategory = "notice" | "news" | "patch-notes" | "dev-notice";

export interface NewsContent {
  id: string;
  content: string;
  lastUpdated: number;
}

export interface NewsServiceState {
  items: Record<string, NewsItem[]>; // Key: "game-service-category"
  contents: Record<string, NewsContent>; // Key: threadId
  lastReadIds: string[]; // For 'N' marker logic
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
