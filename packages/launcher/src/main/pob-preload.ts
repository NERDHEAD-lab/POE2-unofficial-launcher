import { contextBridge, ipcRenderer } from "electron";

import { normalizePobSettings } from "@poe2-launcher/shared/pobSettings";
import type {
  AppConfig,
  PobCalcsAction,
  PobConfigAction,
  PobGame,
  PobItemsAction,
  PobItemsDbKey,
  PobItemsParseAndAddRequest,
  PobItemsParseCopyTextRequest,
  PobLoadBuildCodeRequest,
  PobLoadBuildRequest,
  PobRepoeLocale,
  PobSettings,
  PobSkillsAction,
  PobVaultGenerationsResult,
  PobVaultRefreshRequest,
  PobVaultRefreshResult,
  PobVaultStatusResult,
} from "@poe2-launcher/shared/types";

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
      return normalizePobSettings(pob.settings);
    },
    set: async (settings: Partial<PobSettings>): Promise<PobSettings> => {
      const pob = await getPobConfig();
      const nextSettings = normalizePobSettings({
        ...pob.settings,
        ...settings,
      });
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
    readXml: (subPath: string, fileName: string) =>
      ipcRenderer.invoke("builds:read-xml", subPath, fileName),
    saveXml: (subPath: string, fileName: string, xml: string) =>
      ipcRenderer.invoke("builds:save-xml", subPath, fileName, xml),
  },
  vault: {
    status: (): Promise<PobVaultStatusResult> =>
      ipcRenderer.invoke("pob:vault-status"),
    generations: (): Promise<PobVaultGenerationsResult> =>
      ipcRenderer.invoke("pob:vault-generations"),
    refresh: (
      request?: PobVaultRefreshRequest,
    ): Promise<PobVaultRefreshResult> =>
      ipcRenderer.invoke("pob:vault-refresh", request),
  },
  session: {
    ensure: () => ipcRenderer.invoke("pob:session-ensure"),
    loadBuild: (request: PobLoadBuildRequest) =>
      ipcRenderer.invoke("pob:load-build", request),
    loadBuildCode: (request: PobLoadBuildCodeRequest) =>
      ipcRenderer.invoke("pob:load-build-code", request),
    newBuild: (name?: string) => ipcRenderer.invoke("pob:new-build", name),
    saveBuildXml: () => ipcRenderer.invoke("pob:save-build-xml"),
    exportBuildCode: () => ipcRenderer.invoke("pob:export-build-code"),
    treeSnapshot: () => ipcRenderer.invoke("pob:tree-snapshot"),
    treeMetadata: () => ipcRenderer.invoke("pob:tree-metadata"),
    treeAllocate: (nodeId: number) =>
      ipcRenderer.invoke("pob:tree-allocate", nodeId),
    treeDeallocate: (nodeId: number) =>
      ipcRenderer.invoke("pob:tree-deallocate", nodeId),
    repoeTranslations: (locale: PobRepoeLocale) =>
      ipcRenderer.invoke("pob:repoe-translations", locale),
    itemsSnapshot: () => ipcRenderer.invoke("pob:items-snapshot"),
    itemsDbList: (db: PobItemsDbKey) =>
      ipcRenderer.invoke("pob:items-db-list", db),
    itemsAction: (action: PobItemsAction) =>
      ipcRenderer.invoke("pob:items-action", action),
    itemsParseCopyText: (request: PobItemsParseCopyTextRequest) =>
      ipcRenderer.invoke("pob:items-parse-copy-text", request),
    itemsParseAndAdd: (request: PobItemsParseAndAddRequest) =>
      ipcRenderer.invoke("pob:items-parse-and-add", request),
    skillsSnapshot: () => ipcRenderer.invoke("pob:skills-snapshot"),
    skillsAction: (action: PobSkillsAction) =>
      ipcRenderer.invoke("pob:skills-action", action),
    calcsSnapshot: () => ipcRenderer.invoke("pob:calcs-snapshot"),
    calcsBreakdown: (key: string) =>
      ipcRenderer.invoke("pob:calcs-breakdown", key),
    calcsAction: (action: PobCalcsAction) =>
      ipcRenderer.invoke("pob:calcs-action", action),
    configSnapshot: () => ipcRenderer.invoke("pob:config-snapshot"),
    configAction: (action: PobConfigAction) =>
      ipcRenderer.invoke("pob:config-action", action),
  },
});
