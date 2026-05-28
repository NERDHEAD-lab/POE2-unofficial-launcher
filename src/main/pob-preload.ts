import { contextBridge, ipcRenderer } from "electron";

import type { AppConfig, PobGame, PobSettings } from "../shared/types";

const DEFAULT_POB_SETTINGS: PobSettings = {
  autosaveDrafts: false,
  sidebarCollapsed: false,
};

type PobConfig = NonNullable<AppConfig["pob"]>;

const getPobConfig = async (): Promise<PobConfig> => {
  const value = await ipcRenderer.invoke("config:get", "pob");
  return value && typeof value === "object" ? (value as PobConfig) : {};
};

const parseGameFromHash = (): PobGame => {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  return /game=POE1/.test(hash) ? "POE1" : "POE2";
};

contextBridge.exposeInMainWorld("pobAPI", {
  getInitialGame: () => parseGameFromHash(),
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  closeWindow: () => ipcRenderer.send("window-close"),
  settings: {
    get: async (): Promise<PobSettings> => {
      const pob = await getPobConfig();
      return { ...DEFAULT_POB_SETTINGS, ...pob?.settings };
    },
    set: async (settings: Partial<PobSettings>): Promise<PobSettings> => {
      const pob = await getPobConfig();
      const nextSettings = {
        ...DEFAULT_POB_SETTINGS,
        ...pob.settings,
        ...settings,
      };
      await ipcRenderer.invoke("config:set", "pob", {
        ...pob,
        settings: nextSettings,
      });
      return nextSettings;
    },
  },
  builds: {
    list: (subPath: string) => ipcRenderer.invoke("builds:list", subPath),
    newFolder: (subPath: string, name: string) =>
      ipcRenderer.invoke("builds:new-folder", subPath, name),
    renameBuild: (subPath: string, oldName: string, newName: string) =>
      ipcRenderer.invoke("builds:rename", subPath, oldName, newName),
    deleteBuild: (subPath: string, name: string, kind: "file" | "folder") =>
      ipcRenderer.invoke("builds:delete", subPath, name, kind),
    copyBuild: (
      srcSubPath: string,
      srcName: string,
      dstSubPath: string,
      dstName: string,
    ) =>
      ipcRenderer.invoke(
        "builds:copy",
        srcSubPath,
        srcName,
        dstSubPath,
        dstName,
      ),
    moveBuild: (
      srcSubPath: string,
      name: string,
      kind: "file" | "folder",
      dstSubPath: string,
    ) => ipcRenderer.invoke("builds:move", srcSubPath, name, kind, dstSubPath),
    saveStub: (subPath: string, fileName: string) =>
      ipcRenderer.invoke("builds:save-stub", subPath, fileName),
  },
});
