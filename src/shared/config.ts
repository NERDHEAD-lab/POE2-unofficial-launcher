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
  THEME_CACHE: {
    key: "themeCache",
    name: "Theme Cache",
    category: "Appearance",
    description:
      "각 게임별로 추출된 배경화면 테마 색상 및 최적화를 위한 이미지 해시 데이터를 저장합니다.",
  },
};

// 기존 코드와의 호환성을 위한 키 매핑
export const CONFIG_KEYS = {
  ACTIVE_GAME: CONFIG_METADATA.ACTIVE_GAME.key,
  SERVICE_CHANNEL: CONFIG_METADATA.SERVICE_CHANNEL.key,
  THEME_CACHE: CONFIG_METADATA.THEME_CACHE.key,
} as const;

export const DEFAULT_CONFIG: AppConfig = {
  activeGame: "POE1",
  serviceChannel: "Kakao Games",
  themeCache: {},
  autoFixPatchError: false,
  backupPatchFiles: true,
};

export const DEBUG_APP_CONFIG = {
  TITLE: "Debug Console",
  HASH: "#debug",
} as const;
