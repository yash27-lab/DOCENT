import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("docent", {
  getMetadata: () => ipcRenderer.invoke("app:get-metadata"),
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),
  pickDocuments: () => ipcRenderer.invoke("documents:pick"),
  inspectDocuments: (paths: string[]) => ipcRenderer.invoke("documents:inspect", paths),
  onInspectionProgress: (callback: (progress: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => {
      callback(progress);
    };

    ipcRenderer.on("inspection:progress", listener);

    return () => {
      ipcRenderer.off("inspection:progress", listener);
    };
  },
  revealDocument: (path: string) => ipcRenderer.invoke("documents:reveal", path),
  exportReport: (report: unknown) => ipcRenderer.invoke("documents:export-report", report),
  loadWorkspace: () => ipcRenderer.invoke("workspace:load"),
  saveWorkspace: (state: unknown) => ipcRenderer.invoke("workspace:save", state)
});
