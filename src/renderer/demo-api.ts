import type { ElectronApi } from "../shared/api";
import type {
  AiStreamEvent,
  AiStreamLevel,
  AiStreamScope,
  AppSettings,
  CodeTerminalDataEvent,
  CodeTerminalExitEvent,
  ProjectInfo
} from "../shared/types";

const now = new Date().toISOString();
const streamListeners = new Set<(event: AiStreamEvent) => void>();
const terminalDataListeners = new Set<(event: CodeTerminalDataEvent) => void>();
const terminalExitListeners = new Set<(event: CodeTerminalExitEvent) => void>();
const demoPageVersions = new Map<string, string[]>();
const demoDocuments: Record<string, string> = {
  "docs/prd.md": "# PRD\n\n这是浏览器预览模式下的示例文档内容。",
  "docs/style.md": "# 视觉规范\n\n统一使用克制、清晰、适合桌面工具的设计语言。",
  "docs/page-plan.md": "# 页面规划\n\n- /home 首页\n- /gallery 作品列表"
};

let demoProject: ProjectInfo = {
  rootDir: "Demo/AI Product Demo",
  meta: {
    schemaVersion: 1,
    project: {
      id: "project_demo",
      name: "AI 产品设计示例",
      type: "web",
      createdAt: now,
      updatedAt: now
    },
    documents: [
      {
        type: "prd",
        title: "PRD",
        path: "docs/prd.md",
        updatedAt: now
      },
      {
        type: "style-guide",
        title: "视觉规范",
        path: "docs/style.md",
        updatedAt: now
      },
      {
        type: "page-plan",
        title: "页面规划",
        path: "docs/page-plan.md",
        updatedAt: now
      }
    ],
    pages: [
      {
        id: "page_home",
        name: "启动页",
        route: "/home",
        description: "展示已有项目和新建项目入口。",
        uiPrompt: "桌面工具启动页，左侧为项目列表，顶部有清晰的工具导航和新建项目入口。",
        assetIds: []
      }
    ],
    assets: []
  }
};

const settings: AppSettings = {
  codex: {
    command: "codex",
    args: [],
    proxy: "",
    timeoutMs: 180_000
  }
};

export function createDemoApi(): ElectronApi {
  return {
    listProjects: async () => [
      {
        id: demoProject.meta.project.id,
        name: demoProject.meta.project.name,
        rootDir: demoProject.rootDir,
        createdAt: demoProject.meta.project.createdAt,
        updatedAt: demoProject.meta.project.updatedAt
      }
    ],
    selectProjectDirectory: async () => "Demo/New AI Project",
    selectExistingProjectDirectory: async () => demoProject.rootDir,
    createProject: async (input) => {
      const timestamp = new Date().toISOString();
      for (const key of Object.keys(demoDocuments)) {
        delete demoDocuments[key];
      }
      demoProject = {
        rootDir: input.rootDir,
        meta: {
          schemaVersion: 1,
          project: {
            id: `project_${Date.now()}`,
            name: input.name || "未命名项目",
            type: input.type || "web",
            createdAt: timestamp,
            updatedAt: timestamp
          },
          documents: [],
          pages: [],
          assets: []
        }
      };
      return demoProject;
    },
    openProject: async () => demoProject,
    runPlanning: async (input) => {
      const timestamp = new Date().toISOString();
      emitDemoStream(input.taskId, "planning", "status", "正在启动整套规划任务");
      emitDemoStream(input.taskId, "planning", "stdout", "正在分析需求、拆解功能和页面。");
      demoDocuments["docs/chat-history.md"] = "# 沟通记录\n\n用户提出了首版需求。";
      demoDocuments["docs/prd.md"] = `# PRD\n\n${input.requirement || "首版产品需求。"}`;
      demoDocuments["docs/feature-plan.md"] = "# 功能规划\n\n- 新建项目\n- AI 规划";
      demoDocuments["docs/technical-plan.md"] = "# 技术方案\n\nElectron + React。";
      demoDocuments["docs/style.md"] = "# 视觉规范\n\n统一使用清晰、克制、儿童友好的视觉语言。";
      if (demoProject.meta.project.type === "app") {
        demoDocuments["docs/animation-list.md"] = "# 动效清单\n\n- 页面转场\n- 手势反馈\n- 加载与错误状态动效";
      }
      demoDocuments["docs/page-plan.md"] = "# 页面规划\n\n首页和页面管理。";
      demoDocuments["docs/feature-list.md"] = "# 功能清单\n\n- 项目列表\n- 切图";
      demoProject = {
        ...demoProject,
        meta: {
          ...demoProject.meta,
          project: {
            ...demoProject.meta.project,
            updatedAt: timestamp
          },
          documents: [
            { type: "chat-history", title: "沟通记录", path: "docs/chat-history.md", updatedAt: timestamp },
            { type: "prd", title: "PRD", path: "docs/prd.md", updatedAt: timestamp },
            { type: "feature-plan", title: "功能规划", path: "docs/feature-plan.md", updatedAt: timestamp },
            { type: "technical-plan", title: "技术方案", path: "docs/technical-plan.md", updatedAt: timestamp },
            { type: "style-guide", title: "视觉规范", path: "docs/style.md", updatedAt: timestamp },
            ...(demoProject.meta.project.type === "app"
              ? [{ type: "animation-list" as const, title: "动效清单", path: "docs/animation-list.md", updatedAt: timestamp }]
              : []),
            { type: "page-plan", title: "页面规划", path: "docs/page-plan.md", updatedAt: timestamp },
            { type: "feature-list", title: "功能清单", path: "docs/feature-list.md", updatedAt: timestamp }
          ],
          pages: [
            {
              id: "page_dashboard",
              name: "项目工作台",
              route: "/dashboard",
              description: input.requirement || "产品规划后的默认页面。",
              uiPrompt: "专业桌面应用工作台，左侧页面导航，右侧为设计画布和 AI 输入区。",
              assetIds: []
            }
          ]
        }
      };
      emitDemoStream(input.taskId, "planning", "complete", "整套规划已生成");
      return demoProject;
    },
    reviseDocument: async (input) => {
      const timestamp = new Date().toISOString();
      const current = demoDocuments[input.documentPath] || `# ${input.documentPath}`;
      const content = `${current.trim()}\n\n## 修改记录\n\n${input.instruction.trim() || "已记录修改意见。"}\n`;

      emitDemoStream(input.taskId, "document", "status", `正在启动文档修改任务：${input.documentPath}`);
      emitDemoStream(input.taskId, "document", "stdout", "正在根据修改意见更新当前文档。");
      demoDocuments[input.documentPath] = content;
      demoProject = {
        ...demoProject,
        meta: {
          ...demoProject.meta,
          project: {
            ...demoProject.meta.project,
            updatedAt: timestamp
          },
          documents: demoProject.meta.documents.map((doc) =>
            doc.path === input.documentPath
              ? {
                  ...doc,
                  updatedAt: timestamp
                }
              : doc
          )
        }
      };
      emitDemoStream(input.taskId, "document", "complete", `当前文档已修改：${input.documentPath}`);

      return {
        project: demoProject,
        documentPath: input.documentPath,
        content,
        summary: "已根据修改意见更新当前文档"
      };
    },
    createDocument: async (input) => {
      const timestamp = new Date().toISOString();
      const fileName = `custom-${Date.now()}.md`;
      const documentPath = `docs/${fileName}`;
      const content = `# 新增文档\n\n${input.instruction.trim() || "这是浏览器预览模式下创建的示例文档。"}\n`;

      emitDemoStream(input.taskId, "document", "status", "正在启动新建文档任务");
      emitDemoStream(input.taskId, "document", "stdout", "正在参考已有文档生成新文档。");
      demoDocuments[documentPath] = content;
      demoProject = {
        ...demoProject,
        meta: {
          ...demoProject.meta,
          project: {
            ...demoProject.meta.project,
            updatedAt: timestamp
          },
          documents: [
            ...demoProject.meta.documents,
            {
              type: "custom",
              title: "新增文档",
              path: documentPath,
              updatedAt: timestamp
            }
          ]
        }
      };
      emitDemoStream(input.taskId, "document", "complete", "新文档已生成");
      return {
        project: demoProject,
        documentPath,
        content,
        summary: "已生成新文档"
      };
    },
    syncPagePlan: async (input) => {
      const timestamp = new Date().toISOString();

      emitDemoStream(input.taskId, "page-plan", "status", "正在启动页面规划同步任务");
      emitDemoStream(input.taskId, "page-plan", "stdout", "正在读取 docs/page-plan.md 和 pages.json。");
      demoProject = {
        ...demoProject,
        meta: {
          ...demoProject.meta,
          project: {
            ...demoProject.meta.project,
            updatedAt: timestamp
          },
          pages: [
            {
              ...demoProject.meta.pages[0],
              id: demoProject.meta.pages[0]?.id || "page_home",
              name: "首页",
              route: "/home",
              description: "儿童进入海洋伙伴后的入口页。",
              uiPrompt: "Pad 横屏儿童海洋绘画应用首页，展示海洋动物模板入口和动态海洋预览。",
              ...(demoProject.meta.pages[0]?.imagePath ? { needUpdate: true } : {}),
              assetIds: demoProject.meta.pages[0]?.assetIds || []
            },
            {
              id: "page_gallery",
              name: "我的作品",
              route: "/gallery",
              description: "展示本地保存的涂色作品。",
              uiPrompt: "Pad 横屏作品画廊，卡片网格展示儿童涂色完成的海洋动物。",
              assetIds: []
            }
          ]
        }
      };
      emitDemoStream(input.taskId, "page-plan", "complete", "页面规划已同步");
      return demoProject;
    },
    generatePageImage: async (input) => {
      if (input.annotations?.length) {
        emitDemoStream(input.taskId, "image", "status", `已读取 ${input.annotations.length} 条图片批注`);
      }
      const clearNeedUpdate = (page: ProjectInfo["meta"]["pages"][number]) => {
        const next = { ...page };
        delete next.needUpdate;
        return next;
      };

      const versions = demoPageVersions.get(input.pageId) || [];
      const nextVersion = `v${String(versions.length + 1).padStart(3, "0")}`;
      const imagePath = `assets/pages/${input.pageId}/versions/${nextVersion}.svg`;
      demoPageVersions.set(input.pageId, [...versions, imagePath]);
      demoProject = {
        ...demoProject,
        meta: {
          ...demoProject.meta,
          pages: demoProject.meta.pages.map((page) =>
            page.id === input.pageId
              ? {
                  ...clearNeedUpdate(page),
                  uiPrompt: input.prompt,
                  imagePath
                }
              : page
          )
        }
      };
      return demoProject;
    },
    generatePageBackground: async (input) => {
      const versions = demoPageVersions.get(input.pageId) || [];
      const backgroundImagePath = `assets/pages/${input.pageId}/backgrounds/bg${String(versions.length + 1).padStart(3, "0")}.svg`;

      demoProject = {
        ...demoProject,
        meta: {
          ...demoProject.meta,
          pages: demoProject.meta.pages.map((page) =>
            page.id === input.pageId
              ? {
                  ...page,
                  backgroundImagePath
                }
              : page
          )
        }
      };
      emitDemoStream(input.taskId, "image", "complete", "背景图片已提取");
      return demoProject;
    },
    identifySliceSelections: async (input) => {
      const timestamp = new Date().toISOString();
      const page = demoProject.meta.pages.find((item) => item.id === input.pageId);
      const sourceImagePath = page?.imagePath || "";
      const generatedSelections = (demoProject.meta.sliceSelections || []).filter(
        (selection) => selection.pageId === input.pageId && selection.status === "generated"
      );
      const otherSelections = (demoProject.meta.sliceSelections || []).filter(
        (selection) => selection.pageId !== input.pageId
      );
      const identified = [
        {
          id: `selection_ai_${Date.now()}_primary`,
          pageId: input.pageId,
          name: "主操作按钮",
          sourceImagePath,
          selection: { x: 320, y: 180, width: 240, height: 120 },
          prompt: "AI 识别的主操作按钮区域，保留圆角、阴影和按钮图标。",
          status: "pending" as const,
          assetId: null,
          createdAt: timestamp,
          updatedAt: timestamp
        },
        {
          id: `selection_ai_${Date.now()}_panel`,
          pageId: input.pageId,
          name: "功能卡片",
          sourceImagePath,
          selection: { x: 590, y: 170, width: 260, height: 150 },
          prompt: "AI 识别的功能入口卡片区域，适合作为独立 UI 素材。",
          status: "pending" as const,
          assetId: null,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ];

      demoProject = {
        ...demoProject,
        meta: {
          ...demoProject.meta,
          sliceSelections: [...otherSelections, ...generatedSelections, ...identified]
        }
      };
      emitDemoStream(input.taskId, "image", "complete", "切图区域识别完成");
      return demoProject;
    },
    saveSliceSelections: async (input) => {
      demoProject = {
        ...demoProject,
        meta: {
          ...demoProject.meta,
          sliceSelections: [
            ...(demoProject.meta.sliceSelections || []).filter((selection) => selection.pageId !== input.pageId),
            ...input.selections
          ]
        }
      };
      return demoProject;
    },
    generateSliceAssets: async (input) => {
      const timestamp = new Date().toISOString();
      const selectionIds = new Set(input.selectionIds);
      const selections = demoProject.meta.sliceSelections || [];
      let nextAssets = [...demoProject.meta.assets];
      const nextSelections = selections.map((selection) => {
        if (
          selection.pageId !== input.pageId ||
          !selectionIds.has(selection.id) ||
          (!input.force && selection.status === "generated")
        ) {
          return selection;
        }

        const assetId = `asset_${Date.now()}_${selection.id}`;
        const generatedName = `${selection.name || "页面素材"}（AI 命名）`;
        const generatedDescription = `根据参考图 ${selection.sourceImagePath} 中 x=${selection.selection.x}, y=${selection.selection.y}, width=${selection.selection.width}, height=${selection.selection.height} 的框选区域识别并生成的独立 UI 素材。${input.prompt ? `备注：${input.prompt}` : ""}`;

        if (input.replaceExisting && selection.assetId) {
          nextAssets = nextAssets.filter((asset) => asset.id !== selection.assetId);
        }

        nextAssets.push({
          id: assetId,
          pageId: input.pageId,
          type: "slice",
          name: generatedName,
          path: `assets/slices/${input.pageId}/${assetId}.png`,
          sourceImagePath: selection.sourceImagePath,
          selection: selection.selection,
          selectionId: selection.id,
          prompt: generatedDescription,
          createdAt: timestamp
        });
        return {
          ...selection,
          name: generatedName,
          prompt: generatedDescription,
          status: "generated" as const,
          assetId,
          updatedAt: timestamp
        };
      });

      demoProject = {
        ...demoProject,
        meta: {
          ...demoProject.meta,
          pages: demoProject.meta.pages.map((page) =>
            page.id === input.pageId
              ? {
                  ...page,
                  assetIds: nextAssets.filter((asset) => asset.pageId === input.pageId).map((asset) => asset.id)
                }
              : page
          ),
          assets: nextAssets,
          sliceSelections: nextSelections
        }
      };
      return demoProject;
    },
    listPageImageVersions: async (input) => {
      const activePath = demoProject.meta.pages.find((page) => page.id === input.pageId)?.imagePath;
      return (demoPageVersions.get(input.pageId) || []).map((versionPath, index) => ({
        version: `v${String(index + 1).padStart(3, "0")}`,
        path: versionPath,
        createdAt: new Date().toISOString(),
        active: versionPath === activePath
      }));
    },
    setActivePageImageVersion: async (input) => {
      demoProject = {
        ...demoProject,
        meta: {
          ...demoProject.meta,
          pages: demoProject.meta.pages.map((page) =>
            page.id === input.pageId
              ? {
                  ...page,
                  imagePath: input.imagePath
                }
              : page
          )
        }
      };
      return demoProject;
    },
    generateSliceAsset: async (input) => {
      const assetId = `asset_${Date.now()}`;
      const generatedDescription = `根据参考图 ${input.sourceImagePath} 与框选坐标生成的示例切图素材。`;
      demoProject = {
        ...demoProject,
        meta: {
          ...demoProject.meta,
          pages: demoProject.meta.pages.map((page) =>
            page.id === input.pageId
              ? {
                  ...page,
                  assetIds: [...page.assetIds, assetId]
                }
              : page
          ),
          assets: [
            ...demoProject.meta.assets,
            {
              id: assetId,
              pageId: input.pageId,
              type: "slice",
              name: "示例切图",
              path: "assets/slices/demo/item.png",
              sourceImagePath: input.sourceImagePath,
              selection: input.selection,
              prompt: generatedDescription,
              createdAt: new Date().toISOString()
            }
          ]
        }
      };
      return demoProject;
    },
    exportProjectZip: async () => ({ zipPath: "Demo/AI 产品设计示例.zip" }),
    saveReferenceImage: async (input) => ({
      id: `ref_${Date.now()}`,
      name: input.name || "reference.png",
      path: `tmp/reference-images/${Date.now()}-${input.name || "reference.png"}`,
      mimeType: input.mimeType,
      createdAt: new Date().toISOString()
    }),
    readAssetAsDataUrl: async () =>
      `data:image/svg+xml;base64,${btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">
          <rect width="960" height="600" fill="#f5f7f8"/>
          <rect x="40" y="40" width="220" height="520" rx="8" fill="#ffffff" stroke="#d8dde4"/>
          <rect x="300" y="40" width="620" height="80" rx="8" fill="#ffffff" stroke="#d8dde4"/>
          <rect x="300" y="150" width="620" height="300" rx="8" fill="#ffffff" stroke="#d8dde4"/>
          <rect x="300" y="480" width="620" height="80" rx="8" fill="#ffffff" stroke="#d8dde4"/>
          <text x="70" y="85" fill="#1c2430" font-size="24" font-family="Arial">Pages</text>
          <text x="330" y="90" fill="#1c2430" font-size="28" font-family="Arial">AI UI Canvas</text>
          <text x="330" y="535" fill="#637083" font-size="22" font-family="Arial">Prompt-driven UI image</text>
        </svg>
      `)}`,
    readDocument: async (input) =>
      demoDocuments[input.relativePath] || `# ${input.relativePath}\n\n这是浏览器预览模式下的示例文档内容。`,
    listProjectFiles: async () => [
      {
        name: "docs",
        path: "docs",
        type: "directory",
        children: Object.keys(demoDocuments).map((path) => ({
          name: path.split("/").at(-1) || path,
          path,
          type: "file",
          editable: true,
          size: demoDocuments[path].length,
          mtimeMs: Date.now()
        }))
      },
      {
        name: "pages.json",
        path: "pages.json",
        type: "file",
        editable: true,
        size: JSON.stringify(demoProject.meta, null, 2).length,
        mtimeMs: Date.now()
      }
    ],
    readProjectFile: async (input) => {
      const content =
        input.relativePath === "pages.json"
          ? JSON.stringify(demoProject.meta, null, 2)
          : demoDocuments[input.relativePath] || "";
      return {
        path: input.relativePath,
        content,
        mtimeMs: Date.now(),
        size: content.length
      };
    },
    writeProjectFile: async (input) => {
      if (input.relativePath === "pages.json") {
        demoProject = {
          ...demoProject,
          meta: JSON.parse(input.content)
        };
      } else {
        demoDocuments[input.relativePath] = input.content;
      }

      return {
        path: input.relativePath,
        mtimeMs: Date.now(),
        size: input.content.length
      };
    },
    deleteProjectFile: async (input) => {
      if (input.relativePath === "pages.json") {
        throw new Error("Demo pages.json cannot be deleted");
      }

      delete demoDocuments[input.relativePath];
    },
    revealProjectFile: async () => undefined,
    createCodeTerminal: async (input) => {
      queueMicrotask(() => {
        for (const listener of terminalDataListeners) {
          listener({
            terminalId: input.terminalId,
            data: `Codex demo terminal\r\ncwd: ${input.projectRoot}\r\n$ `
          });
        }
      });
    },
    writeCodeTerminal: async (input) => {
      for (const listener of terminalDataListeners) {
        listener({ terminalId: input.terminalId, data: input.data });
      }
    },
    resizeCodeTerminal: async () => undefined,
    closeCodeTerminal: async (input) => {
      for (const listener of terminalExitListeners) {
        listener({ terminalId: input.terminalId, exitCode: 0 });
      }
    },
    onCodeTerminalData: (listener) => {
      terminalDataListeners.add(listener);
      return () => terminalDataListeners.delete(listener);
    },
    onCodeTerminalExit: (listener) => {
      terminalExitListeners.add(listener);
      return () => terminalExitListeners.delete(listener);
    },
    cancelTask: async () => true,
    onAiStreamEvent: (listener) => {
      streamListeners.add(listener);
      return () => streamListeners.delete(listener);
    },
    getSettings: async () => settings,
    saveSettings: async (nextSettings) => nextSettings
  };
}

function emitDemoStream(
  taskId: string | undefined,
  scope: AiStreamScope,
  level: AiStreamLevel,
  message: string
): void {
  if (!taskId) {
    return;
  }

  const event: AiStreamEvent = {
    taskId,
    scope,
    level,
    message,
    createdAt: new Date().toISOString()
  };

  streamListeners.forEach((listener) => listener(event));
}
