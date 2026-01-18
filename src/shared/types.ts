export interface AppConfig {
  serviceChannel: "Kakao Games" | "GGG";
  activeGame: "POE1" | "POE2";
  themeCache: Record<
    string,
    { text: string; accent: string; footer: string; hash: string }
  >;
}

export interface ElectronAPI {
  triggerGameStart: () => void;
  minimizeWindow: () => void;
  closeWindow: () => void;
  getConfig: (key?: string) => Promise<any>; // Keep any for simplicity in generic access or cast in renderer
  setConfig: (key: string, value: unknown) => Promise<void>;
  onConfigChange: (callback: (key: string, value: any) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
