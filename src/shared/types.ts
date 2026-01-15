export interface ElectronAPI {
  triggerGameStart: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
