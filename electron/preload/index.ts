import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { ElectronApi } from "../../src/shared/api";
import type { AiStreamEvent } from "../../src/shared/types";

const api: ElectronApi = {
  listProjects: () => ipcRenderer.invoke("projects:list"),
  selectProjectDirectory: () => ipcRenderer.invoke("projects:selectDirectory"),
  createProject: (input) => ipcRenderer.invoke("projects:create", input),
  openProject: (rootDir) => ipcRenderer.invoke("projects:open", rootDir),
  runPlanning: (input) => ipcRenderer.invoke("planning:run", input),
  reviseDocument: (input) => ipcRenderer.invoke("document:revise", input),
  syncPagePlan: (input) => ipcRenderer.invoke("pagePlan:sync", input),
  generatePageImage: (input) => ipcRenderer.invoke("image:generatePage", input),
  generatePageBackground: (input) => ipcRenderer.invoke("image:generateBackground", input),
  identifySliceSelections: (input) => ipcRenderer.invoke("image:identifySliceSelections", input),
  generateSliceAsset: (input) => ipcRenderer.invoke("image:generateSlice", input),
  saveSliceSelections: (input) => ipcRenderer.invoke("image:saveSliceSelections", input),
  generateSliceAssets: (input) => ipcRenderer.invoke("image:generateSlices", input),
  listPageImageVersions: (input) => ipcRenderer.invoke("image:listVersions", input),
  setActivePageImageVersion: (input) => ipcRenderer.invoke("image:setActiveVersion", input),
  exportProjectZip: (input) => ipcRenderer.invoke("project:exportZip", input),
  readAssetAsDataUrl: (input) => ipcRenderer.invoke("project:readAsset", input),
  readDocument: (input) => ipcRenderer.invoke("project:readDocument", input),
  cancelTask: (taskId) => ipcRenderer.invoke("ai:cancelTask", taskId),
  onAiStreamEvent: (listener) => {
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => {
      listener(payload as AiStreamEvent);
    };

    ipcRenderer.on("ai:stream", wrapped);
    return () => ipcRenderer.removeListener("ai:stream", wrapped);
  },
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings)
};

contextBridge.exposeInMainWorld("aiProductDesigner", api);
