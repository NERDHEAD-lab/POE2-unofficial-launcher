import { AppConfig } from "./types";

export const CONFIG_KEYS = {
  ACTIVE_GAME: "activeGame",
  SERVICE_CHANNEL: "serviceChannel",
  THEME_CACHE: "themeCache",
} as const;

export const DEFAULT_CONFIG: AppConfig = {
  activeGame: "POE1",
  serviceChannel: "Kakao Games",
  themeCache: {},
};
