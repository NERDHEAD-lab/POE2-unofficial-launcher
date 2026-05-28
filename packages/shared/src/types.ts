import type {
  PobOriginalCalcsBuffMode,
  PobOriginalCalcsGroup,
  PobOriginalCalcsColour,
  PobOriginalConfigOptionKind,
  PobOriginalItemsDbKey,
  PobOriginalItemRarity,
  PobOriginalNotesColourControl,
  PobOriginalSkillDefaultGemLevel,
  PobOriginalSkillGemColor,
  PobOriginalSkillSortGemField,
  PobOriginalSkillSupportGemType,
  PobOriginalTreeTooltipColour,
} from "./pobOriginalContract";

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

export interface PobInstallEntry {
  installLocation: string;
  source: "manual" | "HKCU" | "HKLM";
}

export type PobGame = "POE1" | "POE2";

export interface PobSettings {
  autosaveDrafts: boolean;
  sidebarCollapsed: boolean;
  autoVaultUpdate: boolean;
  vaultGenerationLimit: number;
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

  /**
   * PoB i18n (BETA) — Path of Building Community 설치 위치. PoE1/PoE2 PoB 가
   * 별도 빌드라서 게임별로 분리 보관. PR-2 단계는 PoE2 만 실제 구현.
   * source 가 "manual" 이면 사용자가 폴더 직접 지정, "HKCU" | "HKLM" 이면
   * 자동 감지 후 사용자가 확인 모달에서 등록한 경로.
   */
  pob?: {
    poe1?: PobInstallEntry;
    poe2?: PobInstallEntry;
    settings?: Partial<PobSettings>;
  };
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

export type PobOpenResult =
  | { status: "ready"; installLocation: string }
  | { status: "missing" }
  | {
      status: "detected";
      installLocation: string;
      source: "HKCU" | "HKLM";
    };

export interface BuildEntry {
  kind: "file" | "folder";
  name: string;
  mtime: number;
  size: number;
  level?: number;
  className?: string;
  ascendClassName?: string;
}

export interface BuildsListResult {
  subPath: string;
  entries: BuildEntry[];
}

export type BuildsMutationResult =
  | { status: "ok" }
  | { status: "error"; reason: string };

export type BuildXmlReadResult =
  | { status: "ok"; xml: string }
  | { status: "error"; reason: string };

export interface BuildsAPI {
  list: (subPath: string) => Promise<BuildsListResult>;
  newFolder: (subPath: string, name: string) => Promise<BuildsMutationResult>;
  renameBuild: (
    subPath: string,
    oldName: string,
    newName: string,
  ) => Promise<BuildsMutationResult>;
  deleteBuild: (
    subPath: string,
    name: string,
    kind: "file" | "folder",
  ) => Promise<BuildsMutationResult>;
  copyBuild: (
    srcSubPath: string,
    srcName: string,
    dstSubPath: string,
    dstName: string,
  ) => Promise<BuildsMutationResult>;
  moveBuild: (
    srcSubPath: string,
    name: string,
    kind: "file" | "folder",
    dstSubPath: string,
  ) => Promise<BuildsMutationResult>;
  saveStub: (
    subPath: string,
    fileName: string,
  ) => Promise<BuildsMutationResult>;
  readXml: (subPath: string, fileName: string) => Promise<BuildXmlReadResult>;
  saveXml: (
    subPath: string,
    fileName: string,
    xml: string,
  ) => Promise<BuildsMutationResult>;
}

export interface PobBuildSummary {
  ok: boolean;
  className: string;
  ascendClassName: string;
  level: number;
  mainSkillName: string | null;
  mainSkillDPS: number | null;
  playerStats: Record<string, number>;
}

export interface PobBuildMetadataAscendancyOption {
  id: number;
  label: string;
}

export interface PobBuildMetadataClassOption {
  id: number;
  label: string;
  ascendancies: PobBuildMetadataAscendancyOption[];
}

export interface PobBuildMetadataSnapshot {
  level: number;
  levelAutoMode: boolean;
  classId: number | null;
  className: string | null;
  ascendClassId: number | null;
  ascendClassName: string | null;
  classes: PobBuildMetadataClassOption[];
}

export type PobBuildMetadataClassConfirmationMode = "continue" | "connectPath";

export interface PobBuildMetadataClassChangeConfirmation {
  type: "classChange";
  classId: number;
  classLabel: string;
  message: string;
  confirmLabel: string;
  alternateLabel: string;
}

export type PobBuildMetadataAction =
  | { type: "setLevelAutoMode"; value: boolean }
  | { type: "setLevel"; value: number }
  | {
      type: "setClass";
      classId: number;
      confirmation?: PobBuildMetadataClassConfirmationMode;
    }
  | { type: "setAscendClass"; ascendClassId: number };

export type PobMainSkillSummaryRowKind = "stat" | "text" | "spacer";

export interface PobMainSkillSummaryRow {
  kind: PobMainSkillSummaryRowKind;
  label: string | null;
  value: string | null;
  text: string | null;
  height: number;
}

export interface PobMainSkillSummarySnapshot {
  socketGroupLabel: string | null;
  mainSkillLabel: string | null;
  rows: PobMainSkillSummaryRow[];
  warnings: string[];
}

export type PobSessionResult =
  | { status: "ok" }
  | { status: "error"; reason: string };

export type PobLoadBuildResult =
  | { status: "ok"; summary: PobBuildSummary }
  | { status: "error"; reason: string };

export type PobSaveBuildResult =
  | { status: "ok"; xml: string }
  | { status: "error"; reason: string };

export interface PobLoadBuildRequest {
  xml: string;
  name?: string;
}

export interface PobLoadBuildCodeRequest {
  code: string;
  name?: string;
}

export type PobExportBuildCodeResult =
  | { status: "ok"; code: string }
  | { status: "error"; reason: string };

export type PobBuildImportMode = "current" | "new" | "comparison";

export type PobImportExportUnsupportedFeature =
  | "urlShare"
  | "urlDownload"
  | "characterImport"
  | "comparisonImport";

export interface PobImportExportButton {
  label: string;
  shown: boolean;
  enabled: boolean;
  tooltip: string | null;
}

export interface PobImportExportCheckbox extends PobImportExportButton {
  checked: boolean;
}

export interface PobImportExportSite {
  id: string;
  label: string;
  canImport: boolean;
  canExport: boolean;
  matchPattern: string | null;
}

export interface PobBuildImportModeOption {
  id: PobBuildImportMode;
  label: string;
  enabled: boolean;
}

export interface PobBuildSharingControls {
  sectionLabel: string;
  generateLabel: string;
  generateButton: PobImportExportButton;
  copyButton: PobImportExportButton;
  shareButton: PobImportExportButton;
  exportSupport: PobImportExportCheckbox;
  exportSites: PobImportExportSite[];
  selectedExportSiteId: string | null;
  output: string;
  outputPlaceholder: string;
  note: string;
}

export interface PobBuildImportControls {
  inputLabel: string;
  input: string;
  detail: string;
  valid: boolean;
  fetching: boolean;
  importButton: PobImportExportButton;
  modes: PobBuildImportModeOption[];
  selectedMode: PobBuildImportMode;
  supportedSites: PobImportExportSite[];
}

export type PobCharacterImportMode =
  | "AUTHENTICATION"
  | "GETACCOUNTNAME"
  | "DOWNLOADCHARLIST"
  | "SELECTCHAR"
  | "IMPORTING"
  | "GETSESSIONID";

export interface PobCharacterImportControls {
  sectionLabel: string;
  statusLabel: string;
  status: string;
  mode: PobCharacterImportMode | string;
  authenticateButton: PobImportExportButton;
  logoutButton: PobImportExportButton;
  startButton: PobImportExportButton;
  realmOptions: PobImportExportSite[];
  selectedRealmId: string | null;
  leagueOptions: string[];
  characterOptions: string[];
  importTreeButton: PobImportExportButton;
  importItemsButton: PobImportExportButton;
  clearJewels: PobImportExportCheckbox;
  clearSkills: PobImportExportCheckbox;
  clearItems: PobImportExportCheckbox;
  ignoreWeaponSwap: PobImportExportCheckbox;
}

export interface PobImportExportSnapshot {
  exportControls: PobBuildSharingControls;
  importControls: PobBuildImportControls;
  characterImport: PobCharacterImportControls;
  unsupportedFeatures: PobImportExportUnsupportedFeature[];
}

export type PobImportExportSnapshotResult =
  | { status: "ok"; snapshot: PobImportExportSnapshot }
  | { status: "error"; reason: string };

export type PobImportExportAction =
  | { type: "setExportSupport"; value: boolean }
  | {
      type: "importBuildCode";
      code: string;
      mode: PobBuildImportMode;
      name?: string;
    };

export type PobImportExportActionResult =
  | {
      status: "ok";
      snapshot: PobImportExportSnapshot;
      mode?: PobBuildImportMode;
      summary?: PobBuildSummary;
    }
  | {
      status: "unsupported";
      feature: PobImportExportUnsupportedFeature;
      reason: string;
      snapshot: PobImportExportSnapshot;
    }
  | { status: "error"; reason: string };

export type PobNotesColourControlId = PobOriginalNotesColourControl;

export interface PobNotesColourControl {
  id: PobNotesColourControlId;
  label: string;
  code: string;
  shown: boolean;
  enabled: boolean;
}

export interface PobNotesButton {
  label: string;
  shown: boolean;
  enabled: boolean;
  tooltip: string | null;
}

export interface PobNotesSnapshot {
  text: string;
  showColorCodes: boolean;
  dirty: boolean;
  description: string[];
  colorControls: PobNotesColourControl[];
  toggleButton: PobNotesButton;
}

export type PobNotesSnapshotResult =
  | { status: "ok"; snapshot: PobNotesSnapshot }
  | { status: "error"; reason: string };

export type PobNotesAction =
  | { type: "setText"; value: string }
  | { type: "setShowColorCodes"; value: boolean }
  | {
      type: "insertColor";
      code: string;
      selectionStartByte: number;
      selectionEndByte: number;
    };

export type PobMainSkillSummaryResult =
  | { status: "ok"; snapshot: PobMainSkillSummarySnapshot }
  | { status: "error"; reason: string };

export type PobBuildMetadataResult =
  | { status: "ok"; snapshot: PobBuildMetadataSnapshot }
  | { status: "error"; reason: string };

export type PobBuildMetadataActionResult =
  | { status: "ok"; snapshot: PobBuildMetadataSnapshot }
  | {
      status: "confirm";
      snapshot: PobBuildMetadataSnapshot;
      confirmation: PobBuildMetadataClassChangeConfirmation;
    }
  | { status: "error"; reason: string };

export interface PobTreeNode {
  id: number;
  x: number;
  y: number;
  name: string | null;
  statLines?: string[];
  recipe?: string[];
  type: string | null;
  ascendancyName: string | null;
  isAscendancyStart: boolean;
  isKeystone: boolean;
  isNotable: boolean;
  isSocket: boolean;
  isMastery: boolean;
  isOnlyImage: boolean;
  alloc: boolean;
  icon?: string | null;
  activeEffectImage?: string | null;
  overlay?: {
    alloc?: string | null;
    unalloc?: string | null;
    path?: string | null;
  } | null;
  targetSize?: {
    width?: number | null;
    height?: number | null;
    overlay?: {
      width?: number | null;
      height?: number | null;
    } | null;
    effect?: {
      width?: number | null;
      height?: number | null;
    } | null;
  } | null;
  linked: number[];
  path?: number[];
  depends?: number[];
}

export interface PobTreeViewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PobTreeSnapshot {
  treeVersion: string | null;
  classId: number | null;
  className: string | null;
  ascendClassId: number | null;
  ascendClassName: string | null;
  allocCount: number;
  viewport: PobTreeViewport | null;
  treeSize: number | null;
  nodes: PobTreeNode[];
}

export type PobTreeResult =
  | { status: "ok"; snapshot: PobTreeSnapshot }
  | { status: "error"; reason: string };

export type PobTreeTooltipColour = PobOriginalTreeTooltipColour;

export interface PobTreeTooltipLine {
  kind: "line" | "separator";
  text: string;
  colour: PobTreeTooltipColour | null;
  size: number | null;
}

export interface PobTreeNodeTooltip {
  nodeId: number;
  header: string | null;
  lines: PobTreeTooltipLine[];
}

export type PobTreeNodeTooltipResult =
  | { status: "ok"; tooltip: PobTreeNodeTooltip }
  | { status: "error"; reason: string };

export type PobSkillsTooltipMode = "gem" | "quality" | "enabled";

export interface PobSkillsGemTooltip {
  groupIndex: number;
  gemIndex: number;
  mode: PobSkillsTooltipMode;
  header: string | null;
  lines: PobTreeTooltipLine[];
}

export type PobSkillsGemTooltipResult =
  | { status: "ok"; tooltip: PobSkillsGemTooltip }
  | { status: "error"; reason: string };

export type PobTreeMetadataResult =
  | { status: "ok"; metadata: unknown; vaultPath: string }
  | { status: "error"; reason: string };

export type PobVaultVersionSource = "manifest" | "executable" | "unknown";

export interface PobVaultDetectedVersion {
  version: string;
  source: PobVaultVersionSource;
}

export interface PobVaultActiveEntry {
  version: string;
  vaultPath: string;
}

export type PobVaultStatusState =
  | "ok"
  | "fallback"
  | "uninitialized"
  | "not-configured";

export interface PobVaultStatusSnapshot {
  state: PobVaultStatusState;
  installLocation: string | null;
  installVersion: PobVaultDetectedVersion | null;
  active: PobVaultActiveEntry | null;
  checkedAt: string;
}

export type PobVaultStatusResult =
  | { status: "ok"; snapshot: PobVaultStatusSnapshot }
  | { status: "error"; reason: string };

export interface PobVaultGenerationSnapshot {
  version: string;
  vaultPath: string;
  sizeBytes: number;
  active: boolean;
  copiedAt: string | null;
  smokeTestPassedAt: string | null;
}

export type PobVaultGenerationsResult =
  | { status: "ok"; generations: PobVaultGenerationSnapshot[] }
  | { status: "error"; reason: string };

export type PobVaultRefreshStatus =
  | "up-to-date"
  | "update-available"
  | "promoted"
  | "fallback";

export type PobVaultSmokeStepId =
  | "ping"
  | "build-dps"
  | "xml-roundtrip"
  | "build-code-decode";

export interface PobVaultSmokeStepSnapshot {
  id: PobVaultSmokeStepId;
  label: string;
  ok: boolean;
  durationMs: number;
  detail: string | null;
}

export interface PobVaultSmokeTestSnapshot {
  ok: boolean;
  vaultPath: string;
  steps: PobVaultSmokeStepSnapshot[];
}

export interface PobVaultRefreshSnapshot {
  status: PobVaultRefreshStatus;
  installVersion: PobVaultDetectedVersion;
  previousActive: PobVaultActiveEntry | null;
  active: PobVaultActiveEntry | null;
  promoted: PobVaultActiveEntry | null;
  smokeTest: PobVaultSmokeTestSnapshot | null;
  error: string | null;
}

export interface PobVaultRefreshRequest {
  autoUpdate?: boolean;
  generationLimit?: number;
  force?: boolean;
}

export type PobVaultRefreshResult =
  | { status: "ok"; result: PobVaultRefreshSnapshot }
  | { status: "error"; reason: string };

export type PobItemRarity = PobOriginalItemRarity;

export interface PobItemSummary {
  id: number;
  raw: string;
  name: string;
  rarity: PobItemRarity;
  baseName: string | null;
  title: string | null;
  itemLevel: number | null;
  quality: number | null;
  corrupted: boolean;
  mirrored: boolean;
  shaper: boolean;
  elder: boolean;
  fractured: boolean;
  influences: Record<string, unknown> | null;
  baseType: string | null;
  baseSubType: string | null;
  implicitLines: string[];
  explicitLines: string[];
}

export interface PobItemDbSummary extends Omit<PobItemSummary, "id"> {
  id: string;
}

export interface PobItemSet {
  id: number;
  title: string;
  useSecondWeaponSet: boolean;
}

export interface PobItemSlot {
  name: string;
  label: string;
  slotType: string | null;
  weaponSet: number | null;
  nodeId: number | null;
  selItemId: number;
  visible: boolean;
  active: boolean;
  canActivate: boolean;
  validItemIds: number[];
}

export interface PobItemsSnapshot {
  activeSetId: number;
  useSecondWeaponSet: boolean;
  sets: PobItemSet[];
  slots: PobItemSlot[];
  items: PobItemSummary[];
  sharedItems: PobItemSummary[];
}

export type PobItemsSnapshotResult =
  | { status: "ok"; snapshot: PobItemsSnapshot }
  | { status: "error"; reason: string };

export type PobItemsDbKey = PobOriginalItemsDbKey;

export type PobItemsTooltipSource = "custom" | "shared" | "db";

export interface PobItemsTooltipRequest {
  source: PobItemsTooltipSource;
  itemId: number | string;
  db?: PobItemsDbKey | null;
  slotName?: string | null;
}

export interface PobItemsTooltip {
  source: PobItemsTooltipSource;
  itemId: number | string;
  db: PobItemsDbKey | null;
  slotName: string | null;
  header: string | null;
  lines: PobTreeTooltipLine[];
}

export type PobItemsTooltipResult =
  | { status: "ok"; tooltip: PobItemsTooltip }
  | { status: "error"; reason: string };

export type PobItemsAction =
  | { type: "setActiveSet"; setId: number }
  | { type: "setWeaponSet"; weaponSet: 1 | 2 }
  | { type: "equip"; slotName: string; itemId: number }
  | { type: "setSlotActive"; slotName: string; active: boolean }
  | { type: "equipBest"; itemId: number }
  | { type: "sortItems" }
  | { type: "deleteItem"; itemId: number }
  | { type: "deleteUnused" }
  | { type: "deleteAll" }
  | { type: "addDbItem"; db: PobItemsDbKey; itemId: string; equip: boolean }
  | { type: "addSharedItem"; index: number; equip: boolean }
  | { type: "deleteSharedItem"; index: number }
  | { type: "createCustom"; raw: string; equip: boolean }
  | { type: "saveCustom"; itemId: number; raw: string };

export interface PobItemsDbList {
  entries: PobItemDbSummary[];
}

export type PobItemsDbListResult =
  | { status: "ok"; list: PobItemsDbList }
  | { status: "error"; reason: string };

export type PobItemCopyLocale = Extract<PobRepoeLocale, "en" | "ko">;

export interface PobItemsParseCopyTextRequest {
  rawText: string;
  localeHint?: PobItemCopyLocale;
}

export type PobItemsParseCopyTextResult =
  | {
      status: "ok";
      locale: PobItemCopyLocale;
      englishText: string;
      warnings: string[];
    }
  | {
      status: "error";
      locale: PobItemCopyLocale;
      reason: string;
      originalText: string;
    };

export interface PobItemsParseAndAddRequest extends PobItemsParseCopyTextRequest {
  equip: boolean;
}

export type PobItemsParseAndAddResult =
  | {
      status: "ok";
      snapshot: PobItemsSnapshot;
      locale: PobItemCopyLocale;
      englishText: string;
      warnings: string[];
    }
  | {
      status: "error";
      locale: PobItemCopyLocale;
      reason: string;
      originalText: string;
    };

export type PobSkillGemColor = PobOriginalSkillGemColor;

export type PobSkillDefaultGemLevel = PobOriginalSkillDefaultGemLevel;

export type PobSkillSupportGemType = PobOriginalSkillSupportGemType;

export type PobSkillSortGemField = PobOriginalSkillSortGemField;

export interface PobSkillSet {
  id: number;
  title: string;
}

export interface PobSkillSlotOption {
  label: string;
  slotName?: string;
}

export interface PobSkillOption {
  label: string;
  value: string;
}

export interface PobSkillTypedOption<TValue extends string> {
  label: string;
  value: TValue;
}

export interface PobSkillGemCatalogEntry {
  id: string;
  name: string;
  color: PobSkillGemColor;
  isSupport: boolean;
  naturalMaxLevel: number | null;
  tagString: string | null;
}

export interface PobSkillGemGlobalEffect {
  index: number;
  name: string;
  enabled: boolean;
}

export interface PobSkillGem {
  index: number;
  gemId: string | null;
  skillId: string | null;
  nameSpec: string;
  displayName: string;
  level: number | null;
  quality: number | null;
  enabled: boolean;
  enableGlobal1: boolean;
  enableGlobal2: boolean;
  count: number;
  errMsg: string | null;
  reqLevel: number | null;
  reqStr: number | null;
  reqDex: number | null;
  reqInt: number | null;
  naturalMaxLevel: number | null;
  color: PobSkillGemColor;
  isSupport: boolean;
  isVaal: boolean;
  fromItem: boolean;
  fromTree: boolean;
  triggered: boolean;
  countVisible: boolean;
  canEdit: boolean;
  canDelete: boolean;
  globalEffects: PobSkillGemGlobalEffect[];
  displayLevel: number | null;
  displayQuality: number | null;
}

export interface PobSkillActiveSkill {
  index: number;
  label: string;
  skillPartName: string | null;
  disableReason: string | null;
  color: PobSkillGemColor;
}

export interface PobSkillGroup {
  index: number;
  label: string;
  displayLabel: string;
  slot: string | null;
  source: string | null;
  sourceNote: string | null;
  enabled: boolean;
  slotEnabled: boolean;
  includeInFullDPS: boolean;
  groupCount: number;
  mainActiveSkill: number;
  mainActiveSkillCalcs: number;
  isMain: boolean;
  canDelete: boolean;
  noSupports: boolean;
  gems: PobSkillGem[];
  activeSkills: PobSkillActiveSkill[];
}

export interface PobSkillsGemOptions {
  sortGemsByDPS: boolean;
  sortGemsByDPSField: PobSkillSortGemField;
  defaultGemLevel: PobSkillDefaultGemLevel;
  defaultGemQuality: number;
  showSupportGemTypes: PobSkillSupportGemType;
}

export interface PobSkillsSnapshot {
  activeSetId: number;
  mainSocketGroup: number;
  calcsSocketGroup: number;
  sets: PobSkillSet[];
  groups: PobSkillGroup[];
  availableGems: PobSkillGemCatalogEntry[];
  slotOptions: PobSkillSlotOption[];
  defaultGemLevelOptions: PobSkillTypedOption<PobSkillDefaultGemLevel>[];
  supportGemTypeOptions: PobSkillTypedOption<PobSkillSupportGemType>[];
  sortGemFieldOptions: PobSkillTypedOption<PobSkillSortGemField>[];
  options: PobSkillsGemOptions;
}

export type PobSkillsSnapshotResult =
  | { status: "ok"; snapshot: PobSkillsSnapshot }
  | { status: "error"; reason: string };

export type PobRepoeLocale = "en" | "ko";

export interface PobRepoeStatLineTemplate {
  english: string;
  localized: string;
}

export interface PobRepoeTranslationsSnapshot {
  locale: PobRepoeLocale;
  available: boolean;
  nodeNamesById: Record<string, string>;
  nodeStatLinesById: Record<string, string[]>;
  statLinesByEnglishLine: Record<string, string>;
  statLineTemplates: PobRepoeStatLineTemplate[];
  itemNamesById: Record<string, string>;
  itemNamesByEnglishName: Record<string, string>;
  gemNamesById: Record<string, string>;
  gemNamesBySkillId: Record<string, string>;
  gemNamesByEnglishName: Record<string, string>;
}

export type PobRepoeTranslationsResult =
  | { status: "ok"; snapshot: PobRepoeTranslationsSnapshot }
  | { status: "error"; reason: string };

export interface PobSkillGroupPatch {
  label?: string;
  slot?: string;
  enabled?: boolean;
  includeInFullDPS?: boolean;
  groupCount?: number;
  mainActiveSkill?: number;
}

export interface PobSkillGemPatch {
  gemId?: string;
  nameSpec?: string;
  level?: number;
  quality?: number;
  enabled?: boolean;
  enableGlobal1?: boolean;
  enableGlobal2?: boolean;
  count?: number;
}

export type PobSkillsAction =
  | { type: "setActiveSkillSet"; setId: number }
  | { type: "newSkillSet"; title: string }
  | { type: "copySkillSet"; setId: number }
  | { type: "renameSkillSet"; setId: number; title: string }
  | { type: "deleteSkillSet"; setId: number }
  | { type: "setOptions"; options: Partial<PobSkillsGemOptions> }
  | { type: "addGroup"; label?: string }
  | { type: "deleteGroup"; groupIndex: number }
  | { type: "deleteAllGroups" }
  | { type: "setMainGroup"; groupIndex: number }
  | { type: "setGroup"; groupIndex: number; patch: PobSkillGroupPatch }
  | {
      type: "setGem";
      groupIndex: number;
      gemIndex: number;
      patch: PobSkillGemPatch;
    }
  | { type: "deleteGem"; groupIndex: number; gemIndex: number };

export type PobCalcsBuffMode = PobOriginalCalcsBuffMode;

export type PobCalcsColour = PobOriginalCalcsColour;

export interface PobCalcsDropdownOption {
  index: number;
  label: string;
}

export interface PobCalcsDropdown {
  selected: number | null;
  shown?: boolean;
  enabled?: boolean;
  options: PobCalcsDropdownOption[];
}

export interface PobCalcsEditField {
  value: string | null;
  shown: boolean;
}

export interface PobCalcsButton {
  label: string;
  shown: boolean;
  enabled: boolean;
}

export interface PobCalcsSkillSelect {
  skillNumber: number;
  buffMode: PobCalcsBuffMode;
  buffModeOptions: { value: PobCalcsBuffMode; label: string }[];
  showMinion: boolean;
  showMinionShown: boolean;
  socketGroup: PobCalcsDropdown;
  mainSkill: PobCalcsDropdown;
  statSet: PobCalcsDropdown;
  skillPart: PobCalcsDropdown;
  skillStages: PobCalcsEditField;
  mineCount: PobCalcsEditField;
  minion: PobCalcsDropdown;
  spectreLibrary: PobCalcsButton;
  beastLibrary: PobCalcsButton;
  minionSkill: PobCalcsDropdown;
  minionSkillStatSet: PobCalcsDropdown;
}

export interface PobCalcsCell {
  text: string;
  colour: PobCalcsColour | null;
  breakdownKey: string | null;
}

export interface PobCalcsRow {
  label: string;
  cells: PobCalcsCell[];
}

export interface PobCalcsSubSection {
  id: string;
  label: string;
  collapsed: boolean;
  defaultCollapsed: boolean;
  extra: string | null;
  colWidth: number | null;
  rows: PobCalcsRow[];
}

export interface PobCalcsSection {
  id: string;
  group: PobOriginalCalcsGroup;
  widthCols: number;
  colour: PobCalcsColour | null;
  enabled: boolean;
  subSections: PobCalcsSubSection[];
}

export interface PobCalcsSummary {
  combinedDPS: number | null;
  fullDPS: number | null;
  totalEHP: number | null;
  life: number | null;
  energyShield: number | null;
  mana: number | null;
}

export interface PobCalcsSnapshot {
  search: string;
  skillSelect: PobCalcsSkillSelect;
  sections: PobCalcsSection[];
  summary: PobCalcsSummary;
}

export type PobCalcsSnapshotResult =
  | { status: "ok"; snapshot: PobCalcsSnapshot }
  | { status: "error"; reason: string };

export interface PobCalcsBreakdownModEntry {
  name: string | null;
  type: string | null;
  value: number | null;
  source: string | null;
  sourceLine: string | null;
}

export interface PobCalcsBreakdownModsSection {
  type: "MODS";
  data: {
    label: string;
    modName: string[];
    modType: string;
    entries: PobCalcsBreakdownModEntry[];
  };
}

export interface PobCalcsBreakdownStatSection {
  type: "BREAKDOWN";
  data: {
    stat: string;
    label: string | null;
    footer: string | null;
    lines: string[];
    rowList: Array<Record<string, string>> | null;
    colList: { key: string; label: string }[] | null;
  };
}

export type PobCalcsBreakdownSection =
  | PobCalcsBreakdownModsSection
  | PobCalcsBreakdownStatSection;

export interface PobCalcsBreakdown {
  key: string;
  sections: PobCalcsBreakdownSection[];
}

export type PobCalcsBreakdownResult =
  | { status: "ok"; breakdown: PobCalcsBreakdown }
  | { status: "error"; reason: string };

export type PobCalcsAction =
  | { type: "setSkillNumber"; value: number }
  | { type: "setBuffMode"; value: PobCalcsBuffMode }
  | { type: "setShowMinion"; value: boolean }
  | { type: "setMainActiveSkill"; value: number }
  | { type: "setStatSet"; value: number }
  | { type: "setSkillPart"; value: number }
  | { type: "setSkillStages"; value: string }
  | { type: "setMines"; value: string }
  | { type: "setMinion"; value: number }
  | { type: "setMinionSkill"; value: number }
  | { type: "setMinionSkillStatSet"; value: number }
  | { type: "toggleSubsection"; sectionId: string; subSectionId: string };

export type PobConfigScalar = string | number | boolean | null;

export type PobConfigOptionKind = PobOriginalConfigOptionKind;

export interface PobConfigSet {
  id: number;
  index: number;
  title: string;
  active: boolean;
}

export interface PobConfigListOption {
  index: number;
  value: PobConfigScalar;
  label: string;
}

export interface PobConfigOption {
  id: string;
  var: string | null;
  kind: PobConfigOptionKind;
  label: string;
  value: PobConfigScalar;
  defaultValue: PobConfigScalar;
  placeholder: PobConfigScalar;
  shown: boolean;
  enabled: boolean;
  modified: boolean;
  tooltip: string | null;
  options: PobConfigListOption[];
  selectedIndex: number | null;
  resizable: boolean;
  hideIfInvalid: boolean;
  doNotHighlight: boolean;
}

export interface PobConfigSection {
  id: string;
  label: string;
  col: number | null;
  shown: boolean;
  options: PobConfigOption[];
}

export interface PobConfigSnapshot {
  activeConfigSetId: number;
  configSets: PobConfigSet[];
  search: string;
  showAll: boolean;
  sections: PobConfigSection[];
}

export type PobConfigSnapshotResult =
  | { status: "ok"; snapshot: PobConfigSnapshot }
  | { status: "error"; reason: string };

export type PobConfigAction =
  | { type: "setActiveConfigSet"; setId: number }
  | { type: "setSearch"; value: string }
  | { type: "setShowAll"; value: boolean }
  | { type: "setOption"; var: string; value: PobConfigScalar }
  | { type: "newConfigSet"; title: string }
  | { type: "copyConfigSet"; setId: number; title: string }
  | { type: "renameConfigSet"; setId: number; title: string }
  | { type: "deleteConfigSet"; setId: number };

export type PobPartySectionKey =
  | "auras"
  | "warcry"
  | "link"
  | "partyMemberStats"
  | "enemyConditions"
  | "enemyModifiers"
  | "curses";

export interface PobPartyButton {
  label: string;
  shown: boolean;
  enabled: boolean;
  tooltip: string | null;
}

export interface PobPartyCheckbox extends PobPartyButton {
  checked: boolean;
}

export interface PobPartyImportControls {
  inputLabel: string;
  code: string;
  detail: string;
  valid: boolean;
  fetching: boolean;
  destinations: string[];
  selectedDestination: number;
  destinationTooltip: string | null;
  importButton: PobPartyButton;
  append: PobPartyCheckbox;
  clear: PobPartyButton;
  showAdvanced: PobPartyCheckbox;
  disableEffects: PobPartyButton;
  rebuild: PobPartyButton;
}

export interface PobPartySection {
  key: PobPartySectionKey;
  label: string;
  text: string;
  simpleText: string;
  advancedVisible: boolean;
}

export interface PobPartySnapshot {
  notes: string;
  enableExportBuffs: boolean;
  importControls: PobPartyImportControls;
  leftSections: PobPartySection[];
  rightSections: PobPartySection[];
}

export type PobPartySnapshotResult =
  | { status: "ok"; snapshot: PobPartySnapshot }
  | { status: "error"; reason: string };

export type PobPartyAction =
  | { type: "setDestination"; value: string }
  | { type: "setAppend"; value: boolean }
  | { type: "setShowAdvanced"; value: boolean }
  | { type: "setExportSupport"; value: boolean }
  | { type: "setSectionText"; key: PobPartySectionKey; value: string }
  | { type: "clear" }
  | { type: "disableEffects" }
  | { type: "rebuild" };

export interface PobSessionAPI {
  ensure: () => Promise<PobSessionResult>;
  loadBuild: (request: PobLoadBuildRequest) => Promise<PobLoadBuildResult>;
  loadBuildCode: (
    request: PobLoadBuildCodeRequest,
  ) => Promise<PobLoadBuildResult>;
  newBuild: (name?: string) => Promise<PobLoadBuildResult>;
  saveBuildXml: () => Promise<PobSaveBuildResult>;
  exportBuildCode: () => Promise<PobExportBuildCodeResult>;
  importExportSnapshot: () => Promise<PobImportExportSnapshotResult>;
  importExportAction: (
    action: PobImportExportAction,
  ) => Promise<PobImportExportActionResult>;
  buildMetadata: () => Promise<PobBuildMetadataResult>;
  buildMetadataAction: (
    action: PobBuildMetadataAction,
  ) => Promise<PobBuildMetadataActionResult>;
  mainSkillSummary: () => Promise<PobMainSkillSummaryResult>;
  treeSnapshot: () => Promise<PobTreeResult>;
  treeMetadata: () => Promise<PobTreeMetadataResult>;
  treeNodeTooltip: (nodeId: number) => Promise<PobTreeNodeTooltipResult>;
  treeAllocate: (nodeId: number) => Promise<PobTreeResult>;
  treeDeallocate: (nodeId: number) => Promise<PobTreeResult>;
  repoeTranslations: (
    locale: PobRepoeLocale,
  ) => Promise<PobRepoeTranslationsResult>;
  itemsSnapshot: () => Promise<PobItemsSnapshotResult>;
  itemsDbList: (db: PobItemsDbKey) => Promise<PobItemsDbListResult>;
  itemsTooltip: (
    request: PobItemsTooltipRequest,
  ) => Promise<PobItemsTooltipResult>;
  itemsAction: (action: PobItemsAction) => Promise<PobItemsSnapshotResult>;
  itemsParseCopyText: (
    request: PobItemsParseCopyTextRequest,
  ) => Promise<PobItemsParseCopyTextResult>;
  itemsParseAndAdd: (
    request: PobItemsParseAndAddRequest,
  ) => Promise<PobItemsParseAndAddResult>;
  skillsSnapshot: () => Promise<PobSkillsSnapshotResult>;
  skillsAction: (action: PobSkillsAction) => Promise<PobSkillsSnapshotResult>;
  skillsGemTooltip: (
    groupIndex: number,
    gemIndex: number,
    mode: PobSkillsTooltipMode,
  ) => Promise<PobSkillsGemTooltipResult>;
  calcsSnapshot: () => Promise<PobCalcsSnapshotResult>;
  calcsBreakdown: (key: string) => Promise<PobCalcsBreakdownResult>;
  calcsAction: (action: PobCalcsAction) => Promise<PobCalcsSnapshotResult>;
  configSnapshot: () => Promise<PobConfigSnapshotResult>;
  configAction: (action: PobConfigAction) => Promise<PobConfigSnapshotResult>;
  partySnapshot: () => Promise<PobPartySnapshotResult>;
  partyAction: (action: PobPartyAction) => Promise<PobPartySnapshotResult>;
  notesSnapshot: () => Promise<PobNotesSnapshotResult>;
  notesAction: (action: PobNotesAction) => Promise<PobNotesSnapshotResult>;
}

export interface PobWindowAPI {
  /** PoB BrowserWindow 자체에 전달된 게임 식별자 (URL hash 로 전달). */
  getInitialGame: () => PobGame;
  minimizeWindow: () => void;
  closeWindow: () => void;
  builds: BuildsAPI;
  session: PobSessionAPI;
  vault: {
    status: () => Promise<PobVaultStatusResult>;
    generations: () => Promise<PobVaultGenerationsResult>;
    refresh: (
      request?: PobVaultRefreshRequest,
    ) => Promise<PobVaultRefreshResult>;
  };
  settings: {
    get: () => Promise<PobSettings>;
    set: (settings: Partial<PobSettings>) => Promise<PobSettings>;
  };
}

export type PobPickResult =
  | { status: "ok"; path: string }
  | { status: "cancelled" }
  | { status: "invalid"; reason: string; path: string }
  | { status: "error"; reason: string };

export type PobConfirmDetectedResult =
  | { status: "ok" }
  | { status: "invalid"; reason: string };

export interface PobDetectedPayload {
  game: PobGame;
  installLocation: string;
  source: "HKCU" | "HKLM";
}

export interface PobAPI {
  open: (game: PobGame) => Promise<PobOpenResult>;
  openOfficialSite: () => Promise<void>;
  pickInstallLocation: (game: PobGame) => Promise<PobPickResult>;
  confirmDetectedLocation: (
    payload: PobDetectedPayload,
  ) => Promise<PobConfirmDetectedResult>;
  onShowInstallerModal: (
    callback: (payload: { game: PobGame }) => void,
  ) => () => void;
  onShowDetectedConfirm: (
    callback: (payload: PobDetectedPayload) => void,
  ) => () => void;
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

  // [PoB i18n] launcher → PoB integration entry (PR-1: mock locator)
  pob: PobAPI;

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
    pobAPI?: PobWindowAPI;
  }
}
