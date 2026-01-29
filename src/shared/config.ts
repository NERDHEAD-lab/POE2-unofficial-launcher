import { AppConfig, ConfigDefinition } from "./types";

export const CONFIG_METADATA: Record<string, ConfigDefinition> = {
  ACTIVE_GAME: {
    key: "activeGame",
    name: "Active Game",
    category: "Game",
    description: "런처에서 현재 선택된 게임 (POE1 또는 POE2)을 결정합니다.",
  },
  SERVICE_CHANNEL: {
    key: "serviceChannel",
    name: "Service Channel",
    category: "General",
    description:
      "게임을 실행할 서비스 플랫폼 (Kakao Games 또는 GGG)을 설정합니다.",
  },
  AUTO_LAUNCH: {
    key: "autoLaunch",
    name: "Auto Launch",
    category: "General",
    description: "컴퓨터 시작 시 앱을 자동으로 실행합니다.",
  },
  START_MINIMIZED: {
    key: "startMinimized",
    name: "Start Minimized",
    category: "General",
    description: "자동 실행 시 트레이로 최소화하여 시작합니다.",
  },
  CLOSE_ACTION: {
    key: "closeAction",
    name: "Close Action",
    category: "General",
    description: "창 닫기 버튼을 눌렀을 때의 동작을 설정합니다.",
  },
  QUIT_ON_GAME_START: {
    key: "quitOnGameStart",
    name: "Quit on Game Start",
    category: "General",
    description: "게임 실행 시 런처를 자동으로 닫습니다 (닫기 설정을 따름).",
  },
  AUTO_GAME_START_AFTER_FIX: {
    key: "autoGameStartAfterFix",
    name: "Auto Start Game after Fix",
    category: "General",
    description:
      "패치 오류 자동 수정 완료 후 게임을 자동으로 다시 시작할지 설정합니다.",
  },
  THEME_CACHE: {
    key: "themeCache",
    name: "Theme Cache",
    category: "Appearance",
    description:
      "각 게임별로 추출된 배경화면 테마 색상 및 최적화를 위한 이미지 해시 데이터를 저장합니다.",
  },
  AUTO_FIX_PATCH_ERROR: {
    key: "autoFixPatchError",
    name: "Auto Fix Patch Error",
    category: "Patch",
    description: "패치 오류 감지 시 자동으로 복구를 시도할지 설정합니다.",
  },
  BACKUP_PATCH_FILES: {
    key: "backupPatchFiles",
    name: "Backup Patch Files",
    category: "Patch",
    description: "패치 파일 수정 전 원본 파일을 백업할지 설정합니다.",
  },
  DEV_MODE: {
    key: "dev_mode",
    name: "Developer Mode",
    category: "Debug",
    description: "개발자 모드 활성화 여부를 설정합니다.",
  },
  DEBUG_CONSOLE: {
    key: "debug_console",
    name: "Debug Console",
    category: "Debug",
    description: "디버그 콘솔 표시 여부를 설정합니다 (개발자 모드 필요).",
  },
  SHOW_INACTIVE_WINDOWS: {
    key: "show_inactive_windows",
    name: "Show Inactive Windows",
    category: "Debug",
    description:
      "숨겨진 윈도우(백그라운드 작업 등)를 화면에 표시할지 설정합니다.",
  },
  SHOW_INACTIVE_WINDOW_CONSOLE: {
    key: "show_inactive_window_console",
    name: "Show Inactive Window Console",
    category: "Debug",
    description: "숨겨진 윈도우의 개발자 도구(콘솔)를 표시할지 설정합니다.",
  },
  SHOW_ONBOARDING: {
    key: "showOnboarding",
    name: "Show Onboarding",
    category: "General",
    description: "앱 최초 실행 시 온보딩 위저드를 표시할지 여부를 설정합니다.",
  },
};

// 기존 코드와의 호환성을 위한 키 매핑
export const CONFIG_KEYS = {
  ACTIVE_GAME: CONFIG_METADATA.ACTIVE_GAME.key,
  SERVICE_CHANNEL: CONFIG_METADATA.SERVICE_CHANNEL.key,
  AUTO_FIX_PATCH_ERROR: CONFIG_METADATA.AUTO_FIX_PATCH_ERROR.key,
  AUTO_GAME_START_AFTER_FIX: CONFIG_METADATA.AUTO_GAME_START_AFTER_FIX.key,
  BACKUP_PATCH_FILES: CONFIG_METADATA.BACKUP_PATCH_FILES.key,
  THEME_CACHE: CONFIG_METADATA.THEME_CACHE.key,
  DEV_MODE: CONFIG_METADATA.DEV_MODE.key,
  DEBUG_CONSOLE: CONFIG_METADATA.DEBUG_CONSOLE.key,
  AUTO_LAUNCH: CONFIG_METADATA.AUTO_LAUNCH.key,
  START_MINIMIZED: CONFIG_METADATA.START_MINIMIZED.key,
  CLOSE_ACTION: CONFIG_METADATA.CLOSE_ACTION.key,
  QUIT_ON_GAME_START: CONFIG_METADATA.QUIT_ON_GAME_START.key,
  SHOW_ONBOARDING: CONFIG_METADATA.SHOW_ONBOARDING.key,
} as const;

export const DEFAULT_CONFIG: AppConfig = {
  activeGame: "POE1",
  serviceChannel: "Kakao Games",
  themeCache: {},
  autoFixPatchError: false,
  autoGameStartAfterFix: false,
  backupPatchFiles: true,
  dev_mode: false,
  debug_console: false,
  show_inactive_windows: false,
  show_inactive_window_console: false,
  autoLaunch: false,
  startMinimized: false,
  closeAction: "minimize",
  quitOnGameStart: false,
  showOnboarding: true,
};

export const DEBUG_APP_CONFIG = {
  TITLE: "Debug Console",
  HASH: "#debug",
} as const;
