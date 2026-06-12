import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type {
  AppSettings,
  CloseCodeTerminalInput,
  CreateDocumentInput,
  CreateCodeTerminalInput,
  ExportProjectInput,
  DeleteProjectFileInput,
  GeneratePageBackgroundInput,
  GenerateSliceAssetsInput,
  GeneratePageImageInput,
  GenerateSliceAssetInput,
  IdentifySliceSelectionsInput,
  ListPageImageVersionsInput,
  ReadAssetInput,
  ReadDocumentInput,
  ReadProjectFileInput,
  RevealProjectFileInput,
  ResizeCodeTerminalInput,
  ReviseDocumentInput,
  RunPlanningInput,
  SaveReferenceImageInput,
  SaveSliceSelectionsInput,
  SetActivePageImageVersionInput,
  SyncPagePlanInput,
  WriteCodeTerminalInput,
  WriteProjectFileInput
} from "../../src/shared/types";
import { selectionRectSchema } from "../../src/shared/validation";
import { ensureInsideProject, getMimeType } from "./utils/fs";
import { CodexImageProvider } from "./services/codex-image-provider";
import { CodexTextProvider } from "./services/codex-text-provider";
import { CodeTerminalService } from "./services/code-terminal-service";
import { DocumentCreationService } from "./services/document-creation-service";
import { DocumentRevisionService } from "./services/document-revision-service";
import { ImageService } from "./services/image-service";
import { PagePlanSyncService } from "./services/page-plan-sync-service";
import { PlanningService } from "./services/planning-service";
import { ProjectFileService } from "./services/project-file-service";
import { ProjectService } from "./services/project-service";
import { SettingsService } from "./services/settings-service";
import { ZipService } from "./services/zip-service";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow: BrowserWindow | null = null;
const taskControllers = new Map<string, AbortController>();
const codeTerminalService = new CodeTerminalService();

function beginTask(taskId: string | undefined): AbortSignal | undefined {
  if (!taskId) {
    return undefined;
  }

  const controller = new AbortController();
  taskControllers.set(taskId, controller);
  return controller.signal;
}

function endTask(taskId: string | undefined): void {
  if (taskId) {
    taskControllers.delete(taskId);
  }
}

function cancelTask(taskId: string): boolean {
  const controller = taskControllers.get(taskId);

  if (!controller) {
    return false;
  }

  controller.abort();
  taskControllers.delete(taskId);
  return true;
}

function emitAiStream(
  window: BrowserWindow | null,
  taskId: string | undefined,
  scope: "planning" | "document" | "page-plan" | "image",
  level: "status" | "stdout" | "stderr" | "complete" | "error",
  message: string
): void {
  if (!window || window.isDestroyed() || !taskId) {
    return;
  }

  window.webContents.send("ai:stream", {
    taskId,
    scope,
    level,
    message,
    createdAt: new Date().toISOString()
  });
}

function getReferenceImageExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();

  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return ".jpg";
  }

  if (normalized === "image/webp") {
    return ".webp";
  }

  if (normalized === "image/gif") {
    return ".gif";
  }

  if (normalized === "image/png") {
    return ".png";
  }

  throw new Error("仅支持 PNG、JPG、WEBP、GIF 参考图片");
}

function decodeReferenceImageDataUrl(dataUrl: string, mimeType: string): Buffer {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/u);

  if (!match) {
    throw new Error("参考图片数据格式无效");
  }

  const declaredMimeType = match[1].toLowerCase();
  const expectedMimeType = mimeType.toLowerCase();

  if (declaredMimeType !== expectedMimeType) {
    throw new Error("参考图片 MIME 类型不一致");
  }

  return Buffer.from(match[2], "base64");
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "cxDesinger",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../../dist-renderer/index.html"));
  }
}

function registerIpc(): void {
  const userDataDir = app.getPath("userData");
  const settingsService = new SettingsService(userDataDir);
  const projectService = new ProjectService(userDataDir);
  const projectFileService = new ProjectFileService();
  const zipService = new ZipService();

  ipcMain.handle("projects:list", () => projectService.listProjects());
  ipcMain.handle("ai:cancelTask", (_event, taskId: string) => cancelTask(taskId));

  ipcMain.handle("projects:selectDirectory", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择项目根目录",
      properties: ["openDirectory", "createDirectory"]
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("projects:selectExistingDirectory", async () => {
    const result = await dialog.showOpenDialog({
      title: "打开已有项目文件夹",
      properties: ["openDirectory"]
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("projects:create", (_event, input) => projectService.createProject(input));
  ipcMain.handle("projects:open", async (_event, rootDir: string) => {
    try {
      return await projectService.openProject(rootDir);
    } catch (error) {
      if (!isPermissionDeniedError(error)) {
        throw error;
      }

      const result = await dialog.showOpenDialog({
        title: "Grant Project Folder Access / 重新授权项目文件夹",
        defaultPath: rootDir,
        properties: ["openDirectory"]
      });

      if (result.canceled || !result.filePaths[0]) {
        throw error;
      }

      return projectService.openProject(result.filePaths[0]);
    }
  });

  ipcMain.handle("planning:run", async (event, input: RunPlanningInput) => {
    const signal = beginTask(input.taskId);
    const settings = await settingsService.getSettings();
    const service = new PlanningService(
      projectService,
      CodexTextProvider.fromSettings(settings)
    );

    try {
      return await service.runPlanning(input.projectRoot, input.requirement, {
        model: input.model,
        reasoningEffort: input.reasoningEffort,
        referenceImagePaths: input.referenceImagePaths,
        signal,
        onEvent: (level, message) =>
          emitAiStream(BrowserWindow.fromWebContents(event.sender), input.taskId, "planning", level, message)
      });
    } finally {
      endTask(input.taskId);
    }
  });

  ipcMain.handle("document:revise", async (event, input: ReviseDocumentInput) => {
    const signal = beginTask(input.taskId);
    const settings = await settingsService.getSettings();
    const service = new DocumentRevisionService(
      projectService,
      CodexTextProvider.fromSettings(settings)
    );

    try {
      return await service.reviseDocument(input.projectRoot, input.documentPath, input.instruction, {
        model: input.model,
        reasoningEffort: input.reasoningEffort,
        referenceImagePaths: input.referenceImagePaths,
        signal,
        onEvent: (level, message) =>
          emitAiStream(BrowserWindow.fromWebContents(event.sender), input.taskId, "document", level, message)
      });
    } finally {
      endTask(input.taskId);
    }
  });

  ipcMain.handle("document:create", async (event, input: CreateDocumentInput) => {
    const signal = beginTask(input.taskId);
    const settings = await settingsService.getSettings();
    const service = new DocumentCreationService(
      projectService,
      CodexTextProvider.fromSettings(settings)
    );

    try {
      return await service.createDocument(input.projectRoot, input.instruction, {
        model: input.model,
        reasoningEffort: input.reasoningEffort,
        referenceImagePaths: input.referenceImagePaths,
        signal,
        onEvent: (level, message) =>
          emitAiStream(BrowserWindow.fromWebContents(event.sender), input.taskId, "document", level, message)
      });
    } finally {
      endTask(input.taskId);
    }
  });

  ipcMain.handle("pagePlan:sync", async (event, input: SyncPagePlanInput) => {
    const signal = beginTask(input.taskId);
    const settings = await settingsService.getSettings();
    const service = new PagePlanSyncService(
      projectService,
      CodexTextProvider.fromSettings(settings)
    );

    try {
      return await service.syncPagePlan(input.projectRoot, input.pagePlanPath, {
        model: input.model,
        reasoningEffort: input.reasoningEffort,
        signal,
        onEvent: (level, message) =>
          emitAiStream(BrowserWindow.fromWebContents(event.sender), input.taskId, "page-plan", level, message)
      });
    } finally {
      endTask(input.taskId);
    }
  });

  ipcMain.handle("image:generatePage", async (_event, input: GeneratePageImageInput) => {
    const signal = beginTask(input.taskId);
    const settings = await settingsService.getSettings();
    const service = new ImageService(
      projectService,
      CodexImageProvider.fromSettings(settings)
    );

    try {
      return await service.generatePageImage(
        input.projectRoot,
        input.pageId,
        input.prompt,
        input.annotations || [],
        {
          model: input.model,
          reasoningEffort: input.reasoningEffort,
          referenceImagePaths: input.referenceImagePaths,
          signal,
          onEvent: (level, message) =>
            emitAiStream(BrowserWindow.fromWebContents(_event.sender), input.taskId, "image", level, message)
        }
      );
    } finally {
      endTask(input.taskId);
    }
  });

  ipcMain.handle("image:generateBackground", async (event, input: GeneratePageBackgroundInput) => {
    const signal = beginTask(input.taskId);
    const settings = await settingsService.getSettings();
    const service = new ImageService(
      projectService,
      CodexImageProvider.fromSettings(settings)
    );

    try {
      return await service.generatePageBackground(input.projectRoot, input.pageId, {
        model: input.model,
        reasoningEffort: input.reasoningEffort,
        signal,
        onEvent: (level, message) =>
          emitAiStream(BrowserWindow.fromWebContents(event.sender), input.taskId, "image", level, message)
      });
    } finally {
      endTask(input.taskId);
    }
  });

  ipcMain.handle("image:identifySliceSelections", async (event, input: IdentifySliceSelectionsInput) => {
    const signal = beginTask(input.taskId);
    const settings = await settingsService.getSettings();
    const service = new ImageService(
      projectService,
      CodexImageProvider.fromSettings(settings)
    );

    try {
      return await service.identifySliceSelections(input.projectRoot, input.pageId, {
        model: input.model,
        reasoningEffort: input.reasoningEffort,
        signal,
        onEvent: (level, message) =>
          emitAiStream(BrowserWindow.fromWebContents(event.sender), input.taskId, "image", level, message)
      });
    } finally {
      endTask(input.taskId);
    }
  });

  ipcMain.handle("image:generateSlice", async (event, input: GenerateSliceAssetInput) => {
    const signal = beginTask(input.taskId);
    selectionRectSchema.parse(input.selection);
    const settings = await settingsService.getSettings();
    const service = new ImageService(
      projectService,
      CodexImageProvider.fromSettings(settings)
    );

    try {
      return await service.generateSliceAsset(
        input.projectRoot,
        input.pageId,
        input.sourceImagePath,
        input.selection,
        input.prompt,
        {
          model: input.model,
          reasoningEffort: input.reasoningEffort,
          signal,
          onEvent: (level, message) =>
            emitAiStream(BrowserWindow.fromWebContents(event.sender), input.taskId, "image", level, message)
        }
      );
    } finally {
      endTask(input.taskId);
    }
  });

  ipcMain.handle("image:saveSliceSelections", async (_event, input: SaveSliceSelectionsInput) => {
    const settings = await settingsService.getSettings();
    const service = new ImageService(
      projectService,
      CodexImageProvider.fromSettings(settings)
    );

    return service.saveSliceSelections(input.projectRoot, input.pageId, input.selections);
  });

  ipcMain.handle("image:generateSlices", async (event, input: GenerateSliceAssetsInput) => {
    const signal = beginTask(input.taskId);
    const settings = await settingsService.getSettings();
    const service = new ImageService(
      projectService,
      CodexImageProvider.fromSettings(settings)
    );

    try {
      return await service.generateSliceAssets(
        input.projectRoot,
        input.pageId,
        input.selectionIds,
        {
          model: input.model,
          reasoningEffort: input.reasoningEffort,
          signal,
          onEvent: (level, message) =>
            emitAiStream(BrowserWindow.fromWebContents(event.sender), input.taskId, "image", level, message)
        },
        {
          force: input.force,
          prompt: input.prompt,
          replaceExisting: input.replaceExisting
        }
      );
    } finally {
      endTask(input.taskId);
    }
  });

  ipcMain.handle("image:listVersions", async (_event, input: ListPageImageVersionsInput) => {
    const settings = await settingsService.getSettings();
    const service = new ImageService(
      projectService,
      CodexImageProvider.fromSettings(settings)
    );

    return service.listPageImageVersions(input.projectRoot, input.pageId);
  });

  ipcMain.handle("image:setActiveVersion", async (_event, input: SetActivePageImageVersionInput) => {
    const settings = await settingsService.getSettings();
    const service = new ImageService(
      projectService,
      CodexImageProvider.fromSettings(settings)
    );

    return service.setActivePageImageVersion(input.projectRoot, input.pageId, input.imagePath);
  });

  ipcMain.handle("project:exportZip", async (_event, input: ExportProjectInput) => {
    const project = await projectService.openProject(input.projectRoot);
    const result = await dialog.showSaveDialog({
      title: "导出项目",
      defaultPath: `${project.meta.project.name}.zip`,
      filters: [{ name: "ZIP", extensions: ["zip"] }]
    });

    if (result.canceled || !result.filePath) {
      throw new Error("已取消导出");
    }

    await zipService.exportProject(input.projectRoot, result.filePath);
    return { zipPath: result.filePath };
  });

  ipcMain.handle("project:saveReferenceImage", async (_event, input: SaveReferenceImageInput) => {
    await projectService.openProject(input.projectRoot);
    const extension = getReferenceImageExtension(input.mimeType);
    const buffer = decodeReferenceImageDataUrl(input.dataUrl, input.mimeType);

    if (buffer.length === 0) {
      throw new Error("参考图片不能为空");
    }

    if (buffer.length > 20 * 1024 * 1024) {
      throw new Error("参考图片不能超过 20MB");
    }

    const id = `ref_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const safeName = (input.name || `reference${extension}`)
      .replace(/[\\/:\0]/gu, "_")
      .replace(/\s+/gu, "_")
      .slice(0, 80);
    const fileName = `${id}_${safeName.endsWith(extension) ? safeName : `${safeName}${extension}`}`;
    const relativePath = `tmp/reference-images/${fileName}`;
    const absolutePath = ensureInsideProject(input.projectRoot, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    return {
      id,
      name: input.name?.trim() || fileName,
      path: relativePath,
      mimeType: input.mimeType,
      createdAt: new Date().toISOString()
    };
  });

  ipcMain.handle("project:readAsset", async (_event, input: ReadAssetInput) => {
    const filePath = ensureInsideProject(input.projectRoot, input.relativePath);
    const content = await fs.readFile(filePath);
    return `data:${getMimeType(filePath)};base64,${content.toString("base64")}`;
  });

  ipcMain.handle("project:readDocument", async (_event, input: ReadDocumentInput) => {
    const filePath = ensureInsideProject(input.projectRoot, input.relativePath);
    return fs.readFile(filePath, "utf8");
  });

  ipcMain.handle("project:listFiles", (_event, input: { projectRoot: string }) =>
    projectFileService.listProjectFiles(input.projectRoot)
  );

  ipcMain.handle("project:readFile", (_event, input: ReadProjectFileInput) =>
    projectFileService.readProjectFile(input.projectRoot, input.relativePath)
  );

  ipcMain.handle("project:writeFile", (_event, input: WriteProjectFileInput) =>
    projectFileService.writeProjectFile(input)
  );

  ipcMain.handle("project:deleteFile", (_event, input: DeleteProjectFileInput) =>
    projectFileService.deleteProjectFile(input.projectRoot, input.relativePath)
  );

  ipcMain.handle("project:revealFile", async (_event, input: RevealProjectFileInput) => {
    const filePath = ensureInsideProject(input.projectRoot, input.relativePath);
    await fs.access(filePath);
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("codeTerminal:create", async (event, input: CreateCodeTerminalInput) => {
    const settings = await settingsService.getSettings();
    await codeTerminalService.createTerminal(input, settings, event.sender);
  });

  ipcMain.handle("codeTerminal:write", (_event, input: WriteCodeTerminalInput) => {
    codeTerminalService.writeTerminal(input);
  });

  ipcMain.handle("codeTerminal:resize", (_event, input: ResizeCodeTerminalInput) => {
    codeTerminalService.resizeTerminal(input);
  });

  ipcMain.handle("codeTerminal:close", (_event, input: CloseCodeTerminalInput) => {
    codeTerminalService.closeTerminal(input.terminalId);
  });

  ipcMain.on("codeTerminal:closeForWebContents", (event) => {
    codeTerminalService.closeWebContentsTerminals(event.sender.id);
  });

  ipcMain.handle("settings:get", () => settingsService.getSettings());
  ipcMain.handle("settings:save", (_event, settings: AppSettings) =>
    settingsService.saveSettings(settings)
  );
}

function isPermissionDeniedError(error: unknown): boolean {
  return error instanceof Error && /\bEPERM\b|\bEACCES\b/u.test(error.message);
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  codeTerminalService.closeAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
