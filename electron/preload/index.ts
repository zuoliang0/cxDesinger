import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { ElectronApi } from "../../src/shared/api";
import type { AiStreamEvent, CodeTerminalDataEvent, CodeTerminalExitEvent } from "../../src/shared/types";

const api: ElectronApi = {
  listProjects: () => ipcRenderer.invoke("projects:list"),
  selectProjectDirectory: () => ipcRenderer.invoke("projects:selectDirectory"),
  selectExistingProjectDirectory: () => ipcRenderer.invoke("projects:selectExistingDirectory"),
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
  listProjectFiles: (input) => ipcRenderer.invoke("project:listFiles", input),
  readProjectFile: (input) => ipcRenderer.invoke("project:readFile", input),
  writeProjectFile: (input) => ipcRenderer.invoke("project:writeFile", input),
  createCodeTerminal: (input) => ipcRenderer.invoke("codeTerminal:create", input),
  writeCodeTerminal: (input) => ipcRenderer.invoke("codeTerminal:write", input),
  resizeCodeTerminal: (input) => ipcRenderer.invoke("codeTerminal:resize", input),
  closeCodeTerminal: (input) => ipcRenderer.invoke("codeTerminal:close", input),
  onCodeTerminalData: (listener) => {
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => {
      listener(payload as CodeTerminalDataEvent);
    };

    ipcRenderer.on("codeTerminal:data", wrapped);
    return () => ipcRenderer.removeListener("codeTerminal:data", wrapped);
  },
  onCodeTerminalExit: (listener) => {
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => {
      listener(payload as CodeTerminalExitEvent);
    };

    ipcRenderer.on("codeTerminal:exit", wrapped);
    return () => ipcRenderer.removeListener("codeTerminal:exit", wrapped);
  },
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
