export const CONFIG_CATEGORIES = [
  "Info",
  "General",
  "Game",
  "Appearance",
  "Patch",
  "Debug",
  "Performance",
  "Display",
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
  dev_mode: boolean;
  debug_console: boolean;
  themeCache: Partial<
    Record<
      "POE1" | "POE2",
      {
        text: string;
        accent: string;
        footer: string;
        hash: string;
        assetPath?: string;
      }
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
  /**
   * - "resource-saving": Optimization Mode (Background Scan OFF)
   * - "always-on": High Performance Mode (Background Scan ON)
   * Default: "resource-saving"
   */
  processWatchMode: "resource-saving" | "always-on";
  launcherVersion: string;
  aggressivePatchMode: boolean;
  skipDaumGameStarterUac: boolean;
  autoResolution: boolean;
  resolutionMode: "1440x960" | "1080x720" | "fullscreen";
  // Account Caching
  kakaoAccountId?: string;
  gggAccountId?: string;

  // Version Tracking
  knownGameVersions: Record<
    string, // Key: "${gameId}_${serviceId}"
    { version: string; webRoot: string; timestamp: number }
  >;

  // Remote Theme Settings
  remoteThemeSettings: {
    autoApply: boolean;
    selectedThemes: Record<"POE1" | "POE2", string | "auto">;
    lastSync?: number; // 24h caching timestamp
    lastModified?: string; // For themes.json caching
  };
  patchReservations: PatchReservation[];
  silentPatchNotification: boolean;
  terminateAfterPatch: boolean;
  /**
   * Service specific applied font IDs.
   * Key: ServiceChannel ("Kakao Games", "GGG")
   * Value: Font ID (UUID)
   */
  appliedFonts?: Record<string, string>;
  /**
   * 커스텀 폰트 크기 보정 (%). 범위 50~150, 기본 100.
   * 게임 본체 폰트 metrics를 100% 기준으로 비례 조정한다.
   * (scratch/font-mutation-analysis.md 9.4)
   */
  fontScaleNoto?: number;
  fontScaleSpoqa?: number;
  /**
   * 마지막으로 폰트를 설치한 변조 스키마 버전 (FONT_MUTATION_SCHEMA).
   * 미설정이면 구버전(1)으로 간주. 설치된 폰트가 없으면 의미 없음.
   */
  fontMutationSchema?: number;
}

export interface PatchReservation {
  id: string; // 고유 ID (UUID 또는 timestamp)
  gameId: AppConfig["activeGame"];
  serviceId: AppConfig["serviceChannel"];
  targetTime: string; // ISO String
  createdAt: string; // 생성일시
  retryCount?: number; // [v45] 패치 시도 횟수 추적용
}

export interface ThemeAssets {
  background: string;
  logo: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  assets: ThemeAssets;
  assetsHashes?: Partial<ThemeAssets>;
  startDate?: string;
  endDate?: string;
  isLocalTime?: boolean;
}

export interface ThemesRemoteData {
  poe1: ThemeDefinition[];
  poe2: ThemeDefinition[];
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
  | "stopping" // "게임 종료 중..." (3초 대기)
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
  priority?: number;
}

export interface ChangelogItem {
  version: string;
  date: string;
  body: string;
  htmlUrl: string;
}

export interface AccountUpdateData {
  id?: string;
  loginRequired?: boolean;
}

export interface RemoteFontItem {
  id: string; // 폰트 바이너리 해시 (SHA-256)
  fullNames: { [lang: string]: string };
  familyNames: { [lang: string]: string };
  fileName: string;
  previewPath: string; // preview/${id}.png
  fileSize: number;
  license: { [lang: string]: string };
  licenseUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFontData {
  id: string; // UUID
  alias: string; // 폰트 표시명 (예: "내 커스텀 폰트")
  fileName: string; // "fake_spoqa.ttf"
  originalName: string; // 메타데이터 원본 이름
  previewDataUrl?: string; // 미리보기 이미지 Data URI (base64)
  previewVersion?: number; // 미리보기 스타일 버전
  createdAt: number;
  updatedAt: number;
  remoteSourceId?: string | null; // 원격 서버(Catalog) 출처 식별자 (중복 방지용)
}

export interface UnifiedFontData extends CustomFontData {
  appliedServices: string[];
  isUnknown?: boolean;
  isDefault: boolean;
}

/**
 * 시스템 스캔을 통해 발견된 외부 변조 폰트 정보
 */
export interface DetectedExternalFont {
  path: string;
  hash: string;
  sourceServices: string[]; // ["Kakao Games", "GGG"] 형태의 배열
  originalName: string; // 시스템에서 추출한 (변조된) 이름
  previewDataUrl: string; // 추출된 SVG 썸네일
}

/**
 * 가져오기 마법사에서 확정된 개별 폰트 처리 정보
 */
export interface ImportSelection {
  path: string;
  alias: string;
  originalName: string;
}

/**
 * 폰트 파일 분석 결과 메타데이터
 */
export interface FontMetadata {
  id: string;
  originalName: string;
  fullNames: { [lang: string]: string };
  familyNames: { [lang: string]: string };
  previewDataUrl?: string;
  isKrSupported: boolean;
}

export interface FontAPI {
  getFonts: () => Promise<CustomFontData[]>;
  getUnifiedFonts: () => Promise<UnifiedFontData[]>;
  pickFontFile: () => Promise<string | null>;
  readFile: (filePath: string) => Promise<string | null>;
  analyzeFile: (filePath: string) => Promise<FontMetadata>;
  addFont: (
    filePath: string,
    previewDataUrl?: string,
    customAlias?: string,
    remoteSourceId?: string | null,
  ) => Promise<CustomFontData>;
  removeFont: (id: string) => Promise<void>;
  updateAlias: (id: string, newAlias: string) => Promise<void>;
  applyBatch: (assignments: Record<string, string | null>) => Promise<void>;
  reapply: () => Promise<void>;
  checkMigration: () => Promise<{ prompt: boolean }>;
  completeMigration: () => Promise<void>;
  downloadRemote: (
    item: RemoteFontItem,
    customAlias?: string,
  ) => Promise<boolean>;
  openCustomFontsFolder: () => Promise<void>;
  getCatalog: () => Promise<RemoteFontItem[]>;
  syncCatalog: (force?: boolean) => Promise<void>;
  onFontUpdated: (callback: () => void) => () => void;
  onDownloadProgress: (
    callback: (data: { id: string; progress: number }) => void,
  ) => () => void;
  importExternalFont: (service: string) => Promise<boolean>; // Legacy (UI cleanup needed later)
  cleanupExternalFont: (service: string) => Promise<void>;
  // [Interactive Wizard APIs]
  detectExternalFontsDetail: () => Promise<DetectedExternalFont[]>;
  importSelectedExternalFonts: (selection: ImportSelection[]) => Promise<void>;
}

export interface RevalidateThemeColorsEventDetail {
  game: "POE1" | "POE2";
  assetPath: string;
}

export interface ElectronAPI {
  getAllChangelogs: () => Promise<ChangelogItem[]>;
  onShowChangelog?: (
    callback: (
      data:
        | ChangelogItem[]
        | {
            changelogs: ChangelogItem[];
            oldVersion?: string;
            newVersion?: string;
          },
    ) => void,
  ) => () => void;

  triggerGameStart: () => void;
  minimizeWindow: () => void;
  closeWindow: () => void;
  getConfig: (
    key?: string,
    ignoreDependencies?: boolean,
    includeForced?: boolean,
  ) => Promise<unknown>;
  isConfigForced: (key: string) => Promise<boolean>;
  setConfig: (key: string, value: unknown) => Promise<void>;
  getFileHash: (path: string) => Promise<string>;
  onConfigChange: (
    callback: (key: string, value: unknown) => void,
  ) => () => void;
  onProgressMessage?: (callback: (text: string) => void) => void; // Deprecated
  onGameStatusUpdate?: (callback: (status: GameStatusState) => void) => void;
  onDebugLog?: (callback: (log: DebugLogPayload) => void) => () => void;
  onPatchProgress?: (callback: (progress: PatchProgress) => void) => () => void; // New
  getGameStatus: (
    gameId: string,
    serviceId: string,
  ) => Promise<GameStatusState>;
  onShowPatchFixModal?: (
    callback: (data: {
      autoStart: boolean;
      serviceId?: string;
      gameId?: string;
    }) => void,
  ) => () => void; // New
  onShowPatchReservationModal?: (callback: () => void) => () => void; // New
  triggerPatchReservation: (reservation: PatchReservation) => void; // New
  deletePatchReservation: (id: string) => void; // New
  triggerManualPatchFix: (
    serviceId?: AppConfig["serviceChannel"],
    gameId?: AppConfig["activeGame"],
  ) => void; // New
  triggerRestoreBackup: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ) => void; // New
  triggerPatchCancel: () => void; // New
  triggerForceRepair: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    manualVersion?: string,
    remoteWebRoot?: string, // [Hotfix] 원격/수동 웹 루트 전달용
  ) => Promise<boolean>; // New
  checkBackupAvailability?: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ) => Promise<boolean | BackupMetadata>; // New
  getDebugHistory: () => Promise<DebugLogPayload[]>;
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
  getNewsContentCache: (id: string) => Promise<string | null>;
  markNewsAsRead: (id: string) => Promise<void>;
  markMultipleNewsAsRead: (ids: string[]) => Promise<void>;
  onNewsUpdated: (callback: () => void) => () => void;
  onWindowShow: (callback: () => void) => () => void;
  sendDebugLog: (log: DebugLogPayload) => void;
  checkForUpdates: () => Promise<void>; // Manually trigger check
  downloadUpdate: () => void; // Trigger download
  installUpdate: (isSilent?: boolean) => void; // Trigger install & restart
  onUpdateStatusChange: (
    callback: (status: UpdateStatus) => void,
  ) => () => void;
  getActiveTheme: (game: AppConfig["activeGame"]) => Promise<
    | (ThemeDefinition & {
        assets: Record<string, string>;
        isRemote: boolean;
      })
    | null
  >;
  getThemes: () => Promise<ThemesRemoteData | null>;
  syncThemesForce: () => Promise<boolean>;
  onThemeSynced: (callback: () => void) => () => void;

  // [UAC Bypass API]
  isUACBypassEnabled: () => Promise<boolean>;
  enableUACBypass: () => Promise<boolean>;
  disableUACBypass: () => Promise<boolean>;

  // Admin / UAC
  isAdmin: () => Promise<boolean>;
  relaunchAsAdmin: () => void;
  ensureAdminSession: () => Promise<boolean>;
  isAdminSessionActive: () => Promise<boolean>;

  // [App Control]
  relaunchApp: () => void;
  logoutSession: () => Promise<boolean>;
  deleteConfig: (key: string) => Promise<void>;
  onScalingModeChange?: (callback: (enabled: boolean) => void) => () => void;
  getPath: (name: string) => Promise<string>;
  openPath: (path: string) => Promise<void>;
  setWindowTitle: (title: string) => void;
  onTitleUpdated: (callback: (title: string) => void) => () => void;
  requestTitleUpdate: () => void;
  initialGameName: string;

  // [Account ID & Validation]
  triggerAccountValidation: (serviceId: AppConfig["serviceChannel"]) => void;
  showLoginWindow: (serviceId: AppConfig["serviceChannel"]) => void;
  onAccountUpdate: (callback: (data: AccountUpdateData) => void) => () => void;

  // [UAC Migration]
  onUacMigrationRequest: (callback: () => void) => () => void;
  reportUacMigrationReady: () => void;
  confirmUacMigration: () => void;

  // [Fatal Error Handling]
  onFatalError: (callback: (errorDetails: string) => void) => () => void;
  reportFatalReady: () => void;

  // [Font Management]
  font: FontAPI;

  // [Remote Version] master socket / gh-pages fallback, refreshed on window focus
  remoteVersion: {
    resolve: (
      gameId: AppConfig["activeGame"],
    ) => Promise<RemoteWebRootPayload | null>;
    peek: (
      gameId: AppConfig["activeGame"],
    ) => Promise<RemoteWebRootPayload | null>;
    onUpdated: (
      callback: (payload: RemoteWebRootPayload) => void,
    ) => () => void;
  };
}

export interface RemoteWebRootPayload {
  gameId: AppConfig["activeGame"];
  webRoot: string;
  version: string;
  source: "master-socket" | "gh-pages";
  fetchedAt: number;
}

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking"; isSilent?: boolean }
  | {
      state: "available";
      version: string;
      isSilent?: boolean;
      changelogs?: ChangelogItem[];
    }
  | { state: "not-available"; isSilent?: boolean }
  | { state: "error"; message?: string; isSilent?: boolean }
  | {
      state: "downloading";
      progress: number;
      version?: string;
      isSilent?: boolean;
    }
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
