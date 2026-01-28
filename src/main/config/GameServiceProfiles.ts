import { AppConfig } from "../../shared/types";

export interface GameServiceProfile {
  logFileName: string;
  logStartMarker: string;
  essentialExecutables: string[];
  processKeywords: string[];
}

export const GAME_SERVICE_PROFILES: Record<
  AppConfig["serviceChannel"],
  GameServiceProfile
> = {
  "Kakao Games": {
    logFileName: "KakaoClient.txt",
    logStartMarker: "***** KAKAO LOG FILE OPENING *****",
    essentialExecutables: [
      "PathOfExile.exe",
      "PathOfExile_x64.exe",
      "PathOfExile_KG.exe",
      "PathOfExile_x64_KG.exe",
      "Client.exe",
      "PackCheck.exe",
    ],
    processKeywords: ["PathOfExile_KG.exe"],
  },
  GGG: {
    logFileName: "Client.txt",
    logStartMarker: "***** LOG FILE OPENING *****",
    essentialExecutables: [
      "PathOfExile.exe",
      "PathOfExile_x64.exe",
      "Client.exe",
      "PackCheck.exe",
    ],
    processKeywords: ["PathOfExile.exe"],
  },
};
