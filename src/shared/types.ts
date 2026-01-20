export interface AppConfig {
  serviceChannel: "Kakao Games" | "GGG";
  activeGame: "POE1" | "POE2";
  themeCache: Record<
    string,
    { text: string; accent: string; footer: string; hash: string }
  >;
}

// Granular Status Codes for granular UI feedback
export type RunStatus =
  | "idle"
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
  onConfigChange: (callback: (key: string, value: unknown) => void) => void;
  onProgressMessage?: (callback: (text: string) => void) => void; // Deprecated
  onGameStatusUpdate?: (callback: (status: GameStatusState) => void) => void;
  onDebugLog?: (callback: (log: DebugLogPayload) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
