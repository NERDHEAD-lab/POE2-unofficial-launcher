import { contextBridge, ipcRenderer } from "electron";

import type {
  BuildsSaveXmlOptions,
  PobBuildMetadataAction,
  PobCalcsAction,
  PobConfigAction,
  DebugLogPayload,
  PobDetectedPayload,
  PobGame,
  PobImportExportAction,
  PobItemsAction,
  PobItemsDbKey,
  PobItemsParseAndAddRequest,
  PobItemsParseCopyTextRequest,
  PobItemsTooltipRequest,
  PobLoadBuildCodeRequest,
  PobLoadBuildRequest,
  PobNotesAction,
  PobPartyAction,
  PobRepoeLocale,
  PobSettings,
  PobSkillsAction,
  PobSkillsTooltipMode,
  PobTreePerfDebugContext,
  PobVaultRefreshRequest,
} from "@poe2-launcher/shared/types";

import type { PobWrapperLastLocation } from "./state";

const parseGameFromHash = (): PobGame => {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  return /game=POE1/.test(hash) ? "POE1" : "POE2";
};

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

contextBridge.exposeInMainWorld("pobAPI", {
  getInitialGame: () => parseGameFromHash(),
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  toggleMaximizeWindow: () => ipcRenderer.send("window-toggle-maximize"),
  closeWindow: () => ipcRenderer.send("window-close"),
  debugLog: (log: DebugLogPayload) => ipcRenderer.send("debug-log:send", log),
  settings: {
    get: (): Promise<PobSettings> => invoke("pob-wrapper:settings-get"),
    set: (settings: Partial<PobSettings>): Promise<PobSettings> =>
      invoke("pob-wrapper:settings-set", settings),
  },
  builds: {
    list: (subPath: string) => invoke("builds:list", subPath),
    newFolder: (subPath: string, name: string) =>
      invoke("builds:new-folder", subPath, name),
    renameBuild: (subPath: string, oldName: string, newName: string) =>
      invoke("builds:rename", subPath, oldName, newName),
    deleteBuild: (subPath: string, name: string, kind: "file" | "folder") =>
      invoke("builds:delete", subPath, name, kind),
    copyBuild: (
      srcSubPath: string,
      srcName: string,
      dstSubPath: string,
      dstName: string,
    ) => invoke("builds:copy", srcSubPath, srcName, dstSubPath, dstName),
    moveBuild: (
      srcSubPath: string,
      name: string,
      kind: "file" | "folder",
      dstSubPath: string,
    ) => invoke("builds:move", srcSubPath, name, kind, dstSubPath),
    saveStub: (subPath: string, fileName: string) =>
      invoke("builds:save-stub", subPath, fileName),
    readXml: (subPath: string, fileName: string) =>
      invoke("builds:read-xml", subPath, fileName),
    saveXml: (
      subPath: string,
      fileName: string,
      xml: string,
      options?: BuildsSaveXmlOptions,
    ) => invoke("builds:save-xml", subPath, fileName, xml, options),
  },
  vault: {
    status: () => invoke("pob:vault-status"),
    generations: () => invoke("pob:vault-generations"),
    refresh: (request?: PobVaultRefreshRequest) =>
      invoke("pob:vault-refresh", request),
  },
  session: {
    ensure: () => invoke("pob:session-ensure"),
    loadBuild: (request: PobLoadBuildRequest) =>
      invoke("pob:load-build", request),
    loadBuildCode: (request: PobLoadBuildCodeRequest) =>
      invoke("pob:load-build-code", request),
    newBuild: (name?: string) => invoke("pob:new-build", name),
    saveBuildXml: () => invoke("pob:save-build-xml"),
    exportBuildCode: () => invoke("pob:export-build-code"),
    importExportSnapshot: () => invoke("pob:import-export-snapshot"),
    importExportAction: (action: PobImportExportAction) =>
      invoke("pob:import-export-action", action),
    buildMetadata: () => invoke("pob:build-metadata"),
    buildMetadataAction: (action: PobBuildMetadataAction) =>
      invoke("pob:build-metadata-action", action),
    mainSkillSummary: () => invoke("pob:main-skill-summary"),
    treeSnapshot: (debugContext?: PobTreePerfDebugContext) =>
      invoke("pob:tree-snapshot", debugContext),
    treeMetadata: (debugContext?: PobTreePerfDebugContext) =>
      invoke("pob:tree-metadata", debugContext),
    treeNodeTooltip: (nodeId: number) =>
      invoke("pob:tree-node-tooltip", nodeId),
    treeAllocate: (nodeId: number) => invoke("pob:tree-allocate", nodeId),
    treeDeallocate: (nodeId: number) => invoke("pob:tree-deallocate", nodeId),
    repoeTranslations: (locale: PobRepoeLocale) =>
      invoke("pob:repoe-translations", locale),
    itemsSnapshot: () => invoke("pob:items-snapshot"),
    itemsDbList: (db: PobItemsDbKey) => invoke("pob:items-db-list", db),
    itemsTooltip: (request: PobItemsTooltipRequest) =>
      invoke("pob:items-tooltip", request),
    itemsAction: (action: PobItemsAction) => invoke("pob:items-action", action),
    itemsParseCopyText: (request: PobItemsParseCopyTextRequest) =>
      invoke("pob:items-parse-copy-text", request),
    itemsParseAndAdd: (request: PobItemsParseAndAddRequest) =>
      invoke("pob:items-parse-and-add", request),
    skillsSnapshot: () => invoke("pob:skills-snapshot"),
    skillsAction: (action: PobSkillsAction) =>
      invoke("pob:skills-action", action),
    skillsGemTooltip: (
      groupIndex: number,
      gemIndex: number,
      mode: PobSkillsTooltipMode,
    ) => invoke("pob:skills-gem-tooltip", groupIndex, gemIndex, mode),
    calcsSnapshot: () => invoke("pob:calcs-snapshot"),
    calcsBreakdown: (key: string) => invoke("pob:calcs-breakdown", key),
    calcsAction: (action: PobCalcsAction) => invoke("pob:calcs-action", action),
    configSnapshot: () => invoke("pob:config-snapshot"),
    configAction: (action: PobConfigAction) =>
      invoke("pob:config-action", action),
    partySnapshot: () => invoke("pob:party-snapshot"),
    partyAction: (action: PobPartyAction) => invoke("pob:party-action", action),
    notesSnapshot: () => invoke("pob:notes-snapshot"),
    notesAction: (action: PobNotesAction) => invoke("pob:notes-action", action),
  },
});

contextBridge.exposeInMainWorld("pobWrapper", {
  hostMode: "standalone",
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  toggleMaximizeWindow: () => ipcRenderer.send("window-toggle-maximize"),
  closeWindow: () => ipcRenderer.send("window-close"),
  state: {
    getLastLocation: () =>
      invoke<PobWrapperLastLocation | null>("pob-wrapper:last-location-get"),
    setLastLocation: (lastLocation: PobWrapperLastLocation | null) =>
      invoke<PobWrapperLastLocation | null>(
        "pob-wrapper:last-location-set",
        lastLocation,
      ),
  },
  installLocation: {
    get: (game: PobGame = "POE2") =>
      invoke("pob-wrapper:install-location-get", game),
    detect: (game: PobGame = "POE2") =>
      invoke("pob-wrapper:install-location-detect", game),
    pick: (game: PobGame = "POE2") =>
      invoke("pob-wrapper:install-location-pick", game),
    clear: (game: PobGame = "POE2") =>
      invoke("pob-wrapper:install-location-clear", game),
    confirmDetected: (payload: PobDetectedPayload) =>
      invoke("pob-wrapper:install-location-confirm-detected", payload),
    openOfficialSite: () => invoke("pob-wrapper:open-official-site"),
  },
});
