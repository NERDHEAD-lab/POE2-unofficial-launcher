export interface ElectronAPI {
  triggerGameStart: () => void;
  minimizeWindow: () => void;
  closeWindow: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
