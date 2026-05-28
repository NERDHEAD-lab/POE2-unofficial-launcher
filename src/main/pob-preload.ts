import { contextBridge, ipcRenderer } from "electron";

import { PobGame } from "../shared/types";

const parseGameFromHash = (): PobGame => {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  return /game=POE1/.test(hash) ? "POE1" : "POE2";
};

contextBridge.exposeInMainWorld("pobAPI", {
  getInitialGame: () => parseGameFromHash(),
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
  },
});
