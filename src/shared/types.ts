export type ConfigCategory = "General" | "Game" | "Appearance";

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
  onUpdateStatusChange: (
    callback: (status: UpdateStatus) => void,
  ) => () => void;

  // [UAC Bypass API]
  isUACBypassEnabled: () => Promise<boolean>;
  enableUACBypass: () => Promise<boolean>;
  disableUACBypass: () => Promise<boolean>;

  // [App Control]
  relaunchApp: () => void;
}

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available" }
  | { state: "error"; message?: string }
  | { state: "downloading"; progress: number }
  | { state: "downloaded" };

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
