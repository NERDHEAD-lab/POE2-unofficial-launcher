declare global {
  namespace NodeJS {
    interface Global {
      setNavigationTrigger: (
        webContentsId: number,
        trigger: string | null,
      ) => void;
    }
  }

  var setNavigationTrigger: (
    webContentsId: number,
    trigger: string | null,
  ) => void;
}

export {};
