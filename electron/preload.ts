import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("docent", {
  getMetadata: () => ipcRenderer.invoke("app:get-metadata"),
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),
  pickDocuments: () => ipcRenderer.invoke("documents:pick"),
  inspectDocuments: (paths: string[]) => ipcRenderer.invoke("documents:inspect", paths)
});
