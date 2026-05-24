import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, MouseEvent, PointerEvent, ReactNode, RefObject, WheelEvent } from "react";
import {
  ArrowLeft,
  Boxes,
  Check,
  Code2,
  CircleAlert,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Image,
  Layers,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Send,
  Settings,
  Sparkles,
  Square,
  X
} from "lucide-react";
import type {
  AiStreamEvent,
  AppSettings,
  AssetMeta,
  CodexModel,
  DocumentMeta,
  PageImageAnnotation,
  PageImageVersion,
  ReferenceImageMeta,
  ProjectType,
  ProjectIndexEntry,
  ProjectInfo,
  SelectionRect,
  SliceSelectionMeta
} from "../shared/types";
import { formatDocumentComment } from "./comment-format";
import { CodeWorkspace } from "./CodeWorkspace";
import { createDemoApi } from "./demo-api";
import { useI18n, type Locale } from "./i18n";
import { MarkdownDocument } from "./MarkdownDocument";
import { selectionToNatural } from "./selection";
import { getCurrentTaskLabel } from "./task-status";

type Screen = "home" | "planning" | "pages" | "code";
type ActiveCodexTask = {
  id: string;
  label: string;
  startedAt: number;
  scope: AiStreamEvent["scope"];
  pageId?: string;
};
type ImageTaskResult = "success" | "error";
type SliceGenerateMode = "pending" | "force";
type DocumentMode = "discussion" | "edit";
type PageAssetPreview =
  | { kind: "slice"; assetId: string; dataUrl: string }
  | { kind: "background"; path: string; dataUrl: string };

const api = window.aiProductDesigner ?? createDemoApi();

export function App() {
  const { locale, setLocale, t } = useI18n();
  const [projects, setProjects] = useState<ProjectIndexEntry[]>([]);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [imageTasks, setImageTasks] = useState<Record<string, ActiveCodexTask>>({});
  const [imageTaskResultsByPage, setImageTaskResultsByPage] = useState<Record<string, ImageTaskResult>>({});
  const [imageStreamEventsByPage, setImageStreamEventsByPage] = useState<Record<string, AiStreamEvent[]>>({});
  const imageTaskPageByIdRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!api) {
      return;
    }

    refreshProjects().catch((err) => setError(toErrorMessage(err)));
  }, []);

  useEffect(() => {
    const unsubscribe = api.onAiStreamEvent((event) => {
      if (event.scope !== "image") {
        return;
      }

      const pageId = imageTaskPageByIdRef.current[event.taskId];

      if (!pageId) {
        return;
      }

      setImageStreamEventsByPage((current) => ({
        ...current,
        [pageId]: [...(current[pageId] || []), event].slice(-120)
      }));
    });

    return unsubscribe;
  }, []);

  function startImageTask(pageId: string, id: string, label: string) {
    imageTaskPageByIdRef.current = {
      ...imageTaskPageByIdRef.current,
      [id]: pageId
    };
    setImageStreamEventsByPage((current) => ({
      ...current,
      [pageId]: []
    }));
    setImageTaskResultsByPage((current) => {
      const next = { ...current };
      delete next[pageId];
      return next;
    });
    setImageTasks((current) => ({
      ...current,
      [pageId]: { id, label, pageId, scope: "image", startedAt: Date.now() }
    }));
  }

  function finishImageTask(pageId: string, id: string, result: ImageTaskResult) {
    setImageTasks((current) => {
      const task = current[pageId];

      if (task?.id !== id) {
        return current;
      }

      setImageStreamEventsByPage((events) => ({
        ...events,
        [pageId]: [
          ...(events[pageId] || []),
          {
            taskId: id,
            scope: "image",
            level: "complete",
            message: t("任务结束，耗时 {time}", { time: formatElapsed(Date.now() - task.startedAt) }),
            createdAt: new Date().toISOString()
          }
        ]
      }));

      const next = { ...current };
      delete next[pageId];
      return next;
    });
    setImageTaskResultsByPage((current) => ({
      ...current,
      [pageId]: result
    }));

    const nextTaskPageById = { ...imageTaskPageByIdRef.current };
    delete nextTaskPageById[id];
    imageTaskPageByIdRef.current = nextTaskPageById;
  }

  async function cancelImageTask(pageId: string) {
    const task = imageTasks[pageId];

    if (!task) {
      return;
    }

    await api.cancelTask(task.id);
    setImageStreamEventsByPage((current) => ({
      ...current,
      [pageId]: [
        ...(current[pageId] || []),
        {
          taskId: task.id,
          scope: "image",
          level: "error",
          message: t("已请求停止当前页面的 Codex 调用"),
          createdAt: new Date().toISOString()
        }
      ]
    }));
  }

  async function refreshProjects() {
    setProjects(await api.listProjects());
  }

  async function openProject(rootDir: string) {
    setBusyText(t("正在打开项目"));
    setError("");

    try {
      const opened = await api.openProject(rootDir);
      setProject(opened);
      setScreen("planning");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusyText("");
    }
  }

  async function chooseAndOpenProject() {
    setError("");

    try {
      const selected = await api.selectExistingProjectDirectory();

      if (selected) {
        await openProject(selected);
        await refreshProjects();
      }
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function exportProject() {
    if (!project) {
      return;
    }

    setBusyText(t("正在导出项目"));
    setError("");
    setNotice("");

    try {
      const result = await api.exportProjectZip({ projectRoot: project.rootDir });
      setNotice(t("已导出：{path}", { path: result.zipPath }));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusyText("");
    }
  }

  function closeProject() {
    setProject(null);
    setScreen("home");
    setError("");
    setNotice("");
    refreshProjects().catch((err) => setError(toErrorMessage(err)));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Boxes size={20} />
          <span>cxDesinger</span>
        </div>
        {project ? (
          <div className="project-context">
            <strong>{project.meta.project.name}</strong>
            <span>{project.rootDir}</span>
          </div>
        ) : null}
        <div className="top-actions">
          {project ? (
            <>
              <button
                className={screen === "planning" ? "toolbar-button active" : "toolbar-button"}
                onClick={() => setScreen("planning")}
              >
                <FileText size={16} />
                {t("产品规划")}
              </button>
              <button
                className={screen === "pages" ? "toolbar-button active" : "toolbar-button"}
                onClick={() => setScreen("pages")}
              >
                <Layers size={16} />
                {t("页面管理")}
              </button>
              <button
                className={screen === "code" ? "toolbar-button active" : "toolbar-button"}
                onClick={() => setScreen("code")}
              >
                <Code2 size={16} />
                {t("代码编写")}
              </button>
              <button className="icon-button" onClick={exportProject} title={t("导出项目")}>
                <Download size={18} />
              </button>
            </>
          ) : null}
          <select
            className="language-picker"
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            aria-label="Language"
          >
            <option value="en">EN</option>
            <option value="zh-CN">中文</option>
            <option value="de">Deutsch</option>
          </select>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} title={t("设置")}>
            <Settings size={18} />
          </button>
          {project ? (
            <button className="icon-button" onClick={closeProject} title={t("关闭项目并返回主页")}>
              <X size={18} />
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="toast error">
          <span>{error}</span>
          <button onClick={() => setError("")} title={t("关闭")}>
            <X size={14} />
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="toast notice">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} title={t("关闭")}>
            <X size={14} />
          </button>
        </div>
      ) : null}
      {busyText ? (
        <div className="busy-overlay">
          <Loader2 className="spin" size={22} />
          <span>{busyText}</span>
        </div>
      ) : null}

      <main className="workspace">
        {screen === "home" ? (
          <HomeView
            projects={projects}
            onNewProject={() => setNewProjectOpen(true)}
            onChooseProject={chooseAndOpenProject}
            onOpenProject={openProject}
          />
        ) : null}
        {screen === "planning" && project ? (
          <PlanningView
            project={project}
            onProjectChange={setProject}
            onError={setError}
          />
        ) : null}
        {screen === "pages" && project ? (
          <PagesView
            project={project}
            onProjectChange={setProject}
            onError={setError}
            onNotice={setNotice}
            imageTasks={imageTasks}
            imageTaskResultsByPage={imageTaskResultsByPage}
            imageStreamEventsByPage={imageStreamEventsByPage}
            onImageTaskStart={startImageTask}
            onImageTaskFinish={finishImageTask}
            onClearImageTaskResult={(pageId) =>
              setImageTaskResultsByPage((current) => {
                const next = { ...current };
                delete next[pageId];
                return next;
              })
            }
            onCancelImageTask={cancelImageTask}
          />
        ) : null}
        {project ? (
          <div className={screen === "code" ? "workspace-view active" : "workspace-view hidden"}>
            <CodeWorkspace
              active={screen === "code"}
              project={project}
              onError={setError}
              onNotice={setNotice}
            />
          </div>
        ) : null}
      </main>

      {newProjectOpen ? (
        <NewProjectDialog
          onClose={() => setNewProjectOpen(false)}
          onCreated={(created) => {
            setProject(created);
            setScreen("planning");
            setNewProjectOpen(false);
            refreshProjects().catch((err) => setError(toErrorMessage(err)));
          }}
          onBusy={setBusyText}
          onError={setError}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onError={setError}
          onNotice={setNotice}
        />
      ) : null}
    </div>
  );
}

function HomeView({
  projects,
  onNewProject,
  onChooseProject,
  onOpenProject
}: {
  projects: ProjectIndexEntry[];
  onNewProject: () => void;
  onChooseProject: () => void;
  onOpenProject: (rootDir: string) => void;
}) {
  const { locale, t } = useI18n();

  return (
    <section className="home-layout">
      <div className="section-header">
        <div>
          <h1>{t("项目")}</h1>
          <span>{t("{count} 个项目", { count: projects.length })}</span>
        </div>
        <div className="section-actions">
          <button className="secondary-button" onClick={onChooseProject}>
            <FolderOpen size={18} />
            {t("打开项目")}
          </button>
          <button className="primary-button" onClick={onNewProject}>
            <Plus size={18} />
            {t("新建项目")}
          </button>
        </div>
      </div>

      <div className="project-list">
        {projects.length === 0 ? (
          <div className="empty-state">{t("暂无项目")}</div>
        ) : (
          projects.map((item) => (
            <button className="project-row" key={item.id} onClick={() => onOpenProject(item.rootDir)}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.rootDir}</span>
              </div>
              <time>{formatDate(item.updatedAt, locale)}</time>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function NewProjectDialog({
  onClose,
  onCreated,
  onBusy,
  onError
}: {
  onClose: () => void;
  onCreated: (project: ProjectInfo) => void;
  onBusy: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [rootDir, setRootDir] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("web");

  async function chooseDirectory() {
    const selected = await api.selectProjectDirectory();
    if (selected) {
      setRootDir(selected);
    }
  }

  async function createProject() {
    onBusy(t("正在创建项目"));
    onError("");

    try {
      const created = await api.createProject({ name, rootDir, type: projectType });
      onCreated(created);
    } catch (err) {
      onError(toErrorMessage(err));
    } finally {
      onBusy("");
    }
  }

  return (
    <Dialog title={t("新建项目")} onClose={onClose}>
      <label className="field">
        <span>{t("项目名称")}</span>
        <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>{t("项目根目录")}</span>
        <div className="inline-field">
          <input value={rootDir} onChange={(event) => setRootDir(event.target.value)} />
          <button className="icon-button" onClick={chooseDirectory} title={t("选择目录")}>
            <FolderOpen size={18} />
          </button>
        </div>
      </label>
      <label className="field">
        <span>{t("项目类型")}</span>
        <select value={projectType} onChange={(event) => setProjectType(event.target.value as ProjectType)}>
          <option value="web">WEB</option>
          <option value="app">APP</option>
        </select>
      </label>
      <div className="dialog-actions">
        <button className="secondary-button" onClick={onClose}>
          {t("取消")}
        </button>
        <button className="primary-button" onClick={createProject}>
          <Check size={16} />
          {t("确定")}
        </button>
      </div>
    </Dialog>
  );
}

function PlanningView({
  project,
  onProjectChange,
  onError
}: {
  project: ProjectInfo;
  onProjectChange: (project: ProjectInfo) => void;
  onError: (message: string) => void;
}) {
  const { t, locale } = useI18n();
  const [requirement, setRequirement] = useState(() =>
    project.meta.documents.length === 0
      ? createInitialProjectPrompt(project.meta.project.type || "web", locale)
      : ""
  );
  const [referenceImages, setReferenceImages] = useState<ReferenceImageMeta[]>([]);
  const [selectedModel, setSelectedModel] = useState<CodexModel>("gpt-5.5");
  const [selectedDoc, setSelectedDoc] = useState<DocumentMeta | null>(project.meta.documents[0] || null);
  const [createDocumentMode, setCreateDocumentMode] = useState(false);
  const [docContent, setDocContent] = useState("");
  const [docMode, setDocMode] = useState<DocumentMode>("discussion");
  const [docDraft, setDocDraft] = useState("");
  const [docMtimeMs, setDocMtimeMs] = useState<number | undefined>();
  const [docSaving, setDocSaving] = useState(false);
  const [activeTask, setActiveTask] = useState<{
    id: string;
    label: string;
    scope: "planning" | "document" | "page-plan";
    startedAt: number;
  } | null>(null);
  const [streamEvents, setStreamEvents] = useState<AiStreamEvent[]>([]);
  const activeTaskIdRef = useRef("");
  const streamEndRef = useRef<HTMLDivElement | null>(null);

  async function addReferenceImageFiles(files: File[]) {
    if (activeTask) {
      return;
    }

    try {
      const saved = await saveReferenceImageFiles(project.rootDir, files);
      if (saved.length === 0) {
        return;
      }

      setReferenceImages((current) => [...current, ...saved]);
      onError("");
    } catch (error) {
      onError(toErrorMessage(error));
    }
  }

  function handleReferenceImagePaste(event: ClipboardEvent<HTMLElement>) {
    const files = getClipboardImageFiles(event);

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    void addReferenceImageFiles(files);
  }

  useEffect(() => {
    setSelectedDoc((current) => {
      if (createDocumentMode) {
        return null;
      }

      if (current) {
        const stillExists = project.meta.documents.find((doc) => doc.path === current.path);

        if (stillExists) {
          return stillExists;
        }
      }

      return project.meta.documents[0] || null;
    });
  }, [createDocumentMode, project.meta.documents]);

  useEffect(() => {
    const unsubscribe = api.onAiStreamEvent((event) => {
      if (event.taskId !== activeTaskIdRef.current) {
        return;
      }

      setStreamEvents((current) => [...current, event].slice(-80));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ block: "end" });
  }, [streamEvents]);

  useEffect(() => {
    if (!selectedDoc) {
      setDocContent("");
      setDocDraft("");
      setDocMtimeMs(undefined);
      return;
    }

    api
      .readProjectFile({ projectRoot: project.rootDir, relativePath: selectedDoc.path })
      .then((file) => {
        setDocContent(file.content);
        setDocDraft(file.content);
        setDocMtimeMs(file.mtimeMs);
      })
      .catch(() => {
        setDocContent("");
        setDocDraft("");
        setDocMtimeMs(undefined);
      });
  }, [project.rootDir, selectedDoc]);

  const docDirty = selectedDoc ? docDraft !== docContent : false;

  async function sendRequirement() {
    const instruction = requirement.trim();

    if (!instruction || activeTask) {
      return;
    }

    const taskId = createTaskId();
    const hasSelectedDocument = Boolean(selectedDoc);
    const nextTask = createDocumentMode
      ? {
          id: taskId,
          label: t("新建文档"),
          scope: "document" as const,
          startedAt: Date.now()
        }
      : hasSelectedDocument
      ? {
          id: taskId,
          label: t("修改当前文档：{path}", { path: selectedDoc?.path || "" }),
          scope: "document" as const,
          startedAt: Date.now()
        }
      : {
          id: taskId,
          label: getCurrentTaskLabel(instruction),
          scope: "planning" as const,
          startedAt: Date.now()
        };

    activeTaskIdRef.current = taskId;
    setStreamEvents([]);
    setActiveTask(nextTask);
    setRequirement("");
    onError("");

    try {
      if (createDocumentMode) {
        const result = await api.createDocument({
          taskId,
          projectRoot: project.rootDir,
          instruction,
          referenceImagePaths: referenceImages.map((image) => image.path),
          model: selectedModel,
          reasoningEffort: "high"
        });

        onProjectChange(result.project);
        setDocContent(result.content);
        setSelectedDoc(result.project.meta.documents.find((doc) => doc.path === result.documentPath) || null);
        setCreateDocumentMode(false);
        setReferenceImages([]);
      } else if (hasSelectedDocument && selectedDoc) {
        const result = await api.reviseDocument({
          taskId,
          projectRoot: project.rootDir,
          documentPath: selectedDoc.path,
          instruction,
          referenceImagePaths: referenceImages.map((image) => image.path),
          model: selectedModel,
          reasoningEffort: "high"
        });

        setDocContent(result.content);
        onProjectChange(result.project);
        setReferenceImages([]);
      } else {
        const updated = await api.runPlanning({
          taskId,
          projectRoot: project.rootDir,
          requirement: instruction,
          referenceImagePaths: referenceImages.map((image) => image.path),
          model: selectedModel,
          reasoningEffort: "high"
        });
        onProjectChange(updated);
        setReferenceImages([]);
      }
    } catch (err) {
      onError(toErrorMessage(err));
      setRequirement((current) => current || instruction);
    } finally {
      finishActiveTask(taskId);
    }
  }

  function startCreateDocument() {
    if (activeTask) {
      return;
    }

    if (!confirmDiscardDocumentChanges()) {
      return;
    }

    setCreateDocumentMode(true);
    setSelectedDoc(null);
    setDocMode("discussion");
    setDocContent("");
    setDocDraft("");
    setDocMtimeMs(undefined);
    setRequirement("");
    setReferenceImages([]);
    setStreamEvents([]);
    onError("");
  }

  function confirmDiscardDocumentChanges(): boolean {
    return !docDirty || window.confirm(t("当前文档有未保存修改，确认离开吗？"));
  }

  function selectDocument(doc: DocumentMeta) {
    if (!confirmDiscardDocumentChanges()) {
      return;
    }

    setCreateDocumentMode(false);
    setSelectedDoc(doc);
  }

  async function reloadDocument() {
    if (!selectedDoc || docSaving) {
      return;
    }

    try {
      const file = await api.readProjectFile({ projectRoot: project.rootDir, relativePath: selectedDoc.path });
      setDocContent(file.content);
      setDocDraft(file.content);
      setDocMtimeMs(file.mtimeMs);
      onError("");
    } catch (error) {
      onError(toErrorMessage(error));
    }
  }

  async function saveDocumentEdit() {
    if (!selectedDoc || docSaving || activeTask) {
      return;
    }

    setDocSaving(true);
    onError("");

    try {
      const content = docDraft.endsWith("\n") ? docDraft : `${docDraft}\n`;
      const result = await api.writeProjectFile({
        projectRoot: project.rootDir,
        relativePath: selectedDoc.path,
        content,
        expectedMtimeMs: docMtimeMs
      });

      setDocContent(content);
      setDocDraft(content);
      setDocMtimeMs(result.mtimeMs);
    } catch (error) {
      onError(toErrorMessage(error));
    } finally {
      setDocSaving(false);
    }
  }

  async function syncPagePlan() {
    if (!selectedDoc || selectedDoc.type !== "page-plan" || activeTask) {
      return;
    }

    const taskId = createTaskId();

    activeTaskIdRef.current = taskId;
    setStreamEvents([]);
    setActiveTask({
      id: taskId,
      label: t("同步页面规划到 pages.json"),
      scope: "page-plan",
      startedAt: Date.now()
    });
    onError("");

    try {
      const updated = await api.syncPagePlan({
        taskId,
        projectRoot: project.rootDir,
        pagePlanPath: selectedDoc.path,
        model: selectedModel,
        reasoningEffort: "high"
      });

      onProjectChange(updated);
    } catch (err) {
      onError(toErrorMessage(err));
    } finally {
      finishActiveTask(taskId);
    }
  }

  function addDocumentComment(line: number, comment: string) {
    if (!selectedDoc) {
      return;
    }

    const nextComment = formatDocumentComment({
      documentPath: selectedDoc.path,
      line,
      comment,
      locale
    });

    setRequirement((current) => {
      const prefix = current.trimEnd();
      return prefix ? `${prefix}\n\n${nextComment}` : nextComment;
    });
  }

  async function cancelActiveTask() {
    if (!activeTask) {
      return;
    }

    await api.cancelTask(activeTask.id);
  }

  function finishActiveTask(taskId: string) {
    setActiveTask((current) => {
      if (current?.id !== taskId) {
        return current;
      }

      setStreamEvents((events) => [
        ...events,
        {
          taskId,
          scope: current.scope,
          level: "complete",
          message: t("任务结束，耗时 {time}", { time: formatElapsed(Date.now() - current.startedAt) }),
          createdAt: new Date().toISOString()
        }
      ]);
      return null;
    });

    if (activeTaskIdRef.current === taskId) {
      activeTaskIdRef.current = "";
    }
  }

  return (
    <div className="split-layout">
      <aside className="sidebar">
        <div className="panel-title document-panel-title">
          <span className="panel-title-label">
            <FileText size={16} />
            <span>{t("文档")}</span>
          </span>
          <button
            className="icon-button compact"
            onClick={startCreateDocument}
            disabled={Boolean(activeTask)}
            title={t("新增文档")}
            type="button"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="nav-list">
          {project.meta.documents.length === 0 ? (
            <div className="empty-state compact">{t("暂无文档")}</div>
          ) : (
            project.meta.documents.map((doc) => (
              <button
                className={selectedDoc?.path === doc.path && !createDocumentMode ? "nav-row active" : "nav-row"}
                key={doc.path}
                onClick={() => selectDocument(doc)}
              >
                <span>{doc.title}</span>
                <small>{doc.path}</small>
              </button>
            ))
          )}
        </div>
      </aside>
      <section className="main-panel planning-panel">
        <div className="document-preview">
          {selectedDoc ? (
            <div className="document-toolbar">
              <div className="document-mode-switch">
                <button
                  className={docMode === "discussion" ? "toolbar-button active" : "toolbar-button"}
                  onClick={() => setDocMode("discussion")}
                  disabled={docSaving}
                  type="button"
                >
                  {t("讨论")}
                </button>
                <button
                  className={docMode === "edit" ? "toolbar-button active" : "toolbar-button"}
                  onClick={() => setDocMode("edit")}
                  disabled={docSaving}
                  type="button"
                >
                  {t("编辑")}
                </button>
              </div>
              {docMode === "edit" ? (
                <div className="document-edit-actions">
                  <button
                    className="toolbar-button"
                    onClick={reloadDocument}
                    disabled={docSaving || activeTask !== null}
                    type="button"
                  >
                    <RefreshCw size={15} />
                    {t("重新加载")}
                  </button>
                  <button
                    className="toolbar-button active"
                    onClick={saveDocumentEdit}
                    disabled={docSaving || activeTask !== null || !docDirty}
                    type="button"
                  >
                    <Check size={15} />
                    {docSaving ? t("保存中") : t("保存文档")}
                  </button>
                </div>
              ) : null}
              {selectedDoc.type === "page-plan" && docMode === "discussion" ? (
              <button
                className="toolbar-button sync-page-plan-button"
                onClick={syncPagePlan}
                disabled={Boolean(activeTask)}
              >
                <RefreshCw size={16} />
                {t("同步到 pages.json")}
              </button>
              ) : null}
            </div>
          ) : null}
          {selectedDoc && docMode === "edit" ? (
            <textarea
              className="document-editor"
              value={docDraft}
              onChange={(event) => setDocDraft(event.target.value)}
              disabled={docSaving}
              spellCheck={false}
            />
          ) : selectedDoc ? (
            <MarkdownDocument
              content={docContent}
              documentPath={selectedDoc.path}
              onAddComment={addDocumentComment}
            />
          ) : createDocumentMode ? (
            <div className="empty-state compact">{t("描述新文档需求，AI 会参考已有文档生成")}</div>
          ) : (
            <div className="empty-state compact">{t("暂无文档")}</div>
          )}
        </div>
        <div className="planning-input-area">
          {activeTask ? (
            <TaskStatus task={activeTask} onCancel={cancelActiveTask} />
          ) : null}
          {streamEvents.length > 0 ? <AiStreamPanel events={streamEvents} endRef={streamEndRef} /> : null}
          <div className="prompt-composer" onPaste={handleReferenceImagePaste}>
            <ReferenceImagePicker
              images={referenceImages}
              disabled={Boolean(activeTask)}
              onAddFiles={addReferenceImageFiles}
              onChange={setReferenceImages}
            />
            <div className="prompt-bar planning-prompt-bar">
            <textarea
              value={requirement}
              onChange={(event) => setRequirement(event.target.value)}
              placeholder={
                createDocumentMode
                  ? t("描述要新增的文档内容")
                  : selectedDoc
                    ? t("描述对当前文档的修改意见")
                    : t("描述要创建的产品和规划任务")
              }
            />
            <label className="model-picker">
              <span>{t("模型")}</span>
              <select
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value as CodexModel)}
                disabled={Boolean(activeTask)}
                aria-label={t("选择模型")}
              >
                <option value="gpt-5.5">GPT-5.5</option>
                <option value="gpt-5.4">GPT-5.4</option>
              </select>
              <small>{t("高思考")}</small>
            </label>
            <button
              className="primary-button send-button"
              onClick={sendRequirement}
              disabled={Boolean(activeTask) || !requirement.trim()}
            >
              <Send size={18} />
              {activeTask ? t("处理中") : t("发送")}
            </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TaskStatus({
  task,
  onCancel
}: {
  task: { label: string; startedAt: number };
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const elapsedMs = useElapsedMs(task.startedAt);

  return (
    <div className="task-status" role="status">
      <Loader2 className="spin" size={16} />
      <span>{task.label}</span>
      <time>{formatElapsed(elapsedMs)}</time>
      {onCancel ? (
        <button className="danger-button compact" onClick={onCancel} type="button">
          <Square size={13} />
          {t("停止")}
        </button>
      ) : null}
    </div>
  );
}

function ReferenceImagePicker({
  images,
  disabled,
  onAddFiles,
  onChange
}: {
  images: ReferenceImageMeta[];
  disabled?: boolean;
  onAddFiles: (files: File[]) => void | Promise<void>;
  onChange: (images: ReferenceImageMeta[]) => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="reference-image-picker">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        disabled={disabled}
        onChange={(event) => {
          void onAddFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <div className="reference-image-header">
        <span>{t("参考图片")}</span>
        <button
          className="secondary-button compact"
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <Image size={14} />
          {t("选择图片")}
        </button>
        <small>{t("也可以直接粘贴图片")}</small>
      </div>
      {images.length > 0 ? (
        <div className="reference-image-list">
          {images.map((image) => (
            <span className="reference-image-chip" key={image.id} title={image.path}>
              <Image size={13} />
              {image.name}
              <button
                type="button"
                className="inline-icon-button"
                disabled={disabled}
                onClick={() => onChange(images.filter((item) => item.id !== image.id))}
                title={t("移除参考图片")}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PageTaskIndicator({
  running,
  result,
  onClear
}: {
  running: boolean;
  result?: ImageTaskResult;
  onClear: () => void;
}) {
  const { t } = useI18n();

  if (running) {
    return (
      <span className="page-task-indicator running" title={t("正在处理后台任务")}>
        <Loader2 className="spin" size={14} />
      </span>
    );
  }

  if (result === "success") {
    return (
      <span
        className="page-task-indicator success"
        onClick={(event) => {
          event.stopPropagation();
          onClear();
        }}
        role="button"
        tabIndex={0}
        title={t("任务完成，点击清除")}
      >
        <Check size={14} />
      </span>
    );
  }

  if (result === "error") {
    return (
      <span className="page-task-indicator error" title={t("任务失败")}>
        <CircleAlert size={14} />
      </span>
    );
  }

  return <span className="page-task-indicator empty" />;
}

function AiStreamPanel({
  events,
  endRef,
  compact = false
}: {
  events: AiStreamEvent[];
  endRef: RefObject<HTMLDivElement>;
  compact?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className={compact ? "ai-stream-panel compact" : "ai-stream-panel"} role="log" aria-live="polite">
      {events.map((event, index) => (
        <div className={`ai-stream-line ${event.level}`} key={`${event.createdAt}-${index}`}>
          <span className="ai-stream-level">{formatStreamLevel(event.level, t)}</span>
          <span>{event.message}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function useElapsedMs(startedAt: number): number {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return Math.max(0, now - startedAt);
}

function PagesView({
  project,
  onProjectChange,
  onError,
  onNotice,
  imageTasks,
  imageTaskResultsByPage,
  imageStreamEventsByPage,
  onImageTaskStart,
  onImageTaskFinish,
  onClearImageTaskResult,
  onCancelImageTask
}: {
  project: ProjectInfo;
  onProjectChange: (project: ProjectInfo) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  imageTasks: Record<string, ActiveCodexTask>;
  imageTaskResultsByPage: Record<string, ImageTaskResult>;
  imageStreamEventsByPage: Record<string, AiStreamEvent[]>;
  onImageTaskStart: (pageId: string, id: string, label: string) => void;
  onImageTaskFinish: (pageId: string, id: string, result: ImageTaskResult) => void;
  onClearImageTaskResult: (pageId: string) => void;
  onCancelImageTask: (pageId: string) => void;
}) {
  const { t } = useI18n();
  const [selectedPageId, setSelectedPageId] = useState(project.meta.pages[0]?.id || "");
  const selectedPage = useMemo(
    () => project.meta.pages.find((page) => page.id === selectedPageId) || project.meta.pages[0],
    [project.meta.pages, selectedPageId]
  );
  const [prompt, setPrompt] = useState(selectedPage?.uiPrompt || "");
  const [referenceImages, setReferenceImages] = useState<ReferenceImageMeta[]>([]);
  const [imageData, setImageData] = useState("");
  const [assetPreview, setAssetPreview] = useState<PageAssetPreview | null>(null);
  const [imageVersions, setImageVersions] = useState<PageImageVersion[]>([]);
  const [sliceSelections, setSliceSelections] = useState<SliceSelectionMeta[]>([]);
  const [selectedSelectionId, setSelectedSelectionId] = useState("");
  const [checkedSliceSelectionIds, setCheckedSliceSelectionIds] = useState<string[]>([]);
  const [sliceGenerateMode, setSliceGenerateMode] = useState<SliceGenerateMode>("pending");
  const [selectionMode, setSelectionMode] = useState(false);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [pageAnnotations, setPageAnnotations] = useState<PageImageAnnotation[]>([]);
  const [annotationPopover, setAnnotationPopover] = useState<{
    displaySelection: SelectionRect;
    annotation: PageImageAnnotation;
    note: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "slice" | "annotation";
    id: string;
    label: string;
  } | null>(null);
  const [singleSliceNote, setSingleSliceNote] = useState("");
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragSelection, setDragSelection] = useState<SelectionRect | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const [imageRenderInfo, setImageRenderInfo] = useState<{
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageStageRef = useRef<HTMLDivElement | null>(null);
  const imageStreamEndRef = useRef<HTMLDivElement | null>(null);
  const selectedSliceItemRef = useRef<HTMLDivElement | null>(null);

  async function addReferenceImageFiles(files: File[]) {
    if (activeImageTask) {
      return;
    }

    try {
      const saved = await saveReferenceImageFiles(project.rootDir, files);
      if (saved.length === 0) {
        return;
      }

      setReferenceImages((current) => [...current, ...saved]);
      onError("");
    } catch (error) {
      onError(toErrorMessage(error));
    }
  }

  function handleReferenceImagePaste(event: ClipboardEvent<HTMLElement>) {
    const files = getClipboardImageFiles(event);

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    void addReferenceImageFiles(files);
  }

  useEffect(() => {
    imageStreamEndRef.current?.scrollIntoView({ block: "end" });
  }, [selectedPage?.id, selectedPage ? imageStreamEventsByPage[selectedPage.id]?.length : 0]);

  useEffect(() => {
    selectedSliceItemRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth"
    });
  }, [selectedSelectionId]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => {
      setContextMenu(null);
      setSingleSliceNote("");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!selectedPage && project.meta.pages[0]) {
      setSelectedPageId(project.meta.pages[0].id);
    }
  }, [project.meta.pages, selectedPage]);

  useEffect(() => {
    setPrompt(selectedPage?.uiPrompt || "");
    setDragSelection(null);
    setDragStart(null);
    setSelectionMode(false);
    setAnnotationMode(false);
    setAnnotationPopover(null);
    setPageAnnotations([]);
    setAssetPreview(null);
    setCheckedSliceSelectionIds([]);
    resetImageViewport();
  }, [selectedPage?.id, selectedPage?.uiPrompt]);

  useEffect(() => {
    const selections = (project.meta.sliceSelections || []).filter(
      (selection) => selection.pageId === selectedPage?.id
    );

    setSliceSelections(selections);
    setCheckedSliceSelectionIds((current) =>
      current.filter((selectionId) => selections.some((selection) => selection.id === selectionId))
    );
    setSelectedSelectionId((current) =>
      current && selections.some((selection) => selection.id === current) ? current : selections[0]?.id || ""
    );
  }, [project.meta.sliceSelections, selectedPage?.id]);

  useEffect(() => {
    if (!selectedPage?.imagePath) {
      setImageData("");
      return;
    }

    api
      .readAssetAsDataUrl({
        projectRoot: project.rootDir,
        relativePath: selectedPage.imagePath
      })
      .then(setImageData)
      .catch((err) => onError(toErrorMessage(err)));
  }, [project.rootDir, selectedPage?.imagePath, onError]);

  useEffect(() => {
    window.addEventListener("resize", updateImageRenderInfo);
    return () => window.removeEventListener("resize", updateImageRenderInfo);
  }, []);

  useEffect(() => {
    if (!selectedPage) {
      setImageVersions([]);
      return;
    }

    api
      .listPageImageVersions({ projectRoot: project.rootDir, pageId: selectedPage.id })
      .then(setImageVersions)
      .catch(() => setImageVersions([]));
  }, [project.rootDir, selectedPage?.id, selectedPage?.imagePath, project.meta.project.updatedAt]);

  async function generatePageImage() {
    if (!selectedPage || activeImageTask) {
      return;
    }

    const taskId = createTaskId();
    let taskResult: ImageTaskResult = "success";

    onImageTaskStart(selectedPage.id, taskId, t("正在生成当前页面图片"));
    setAssetPreview(null);
    onError("");

    try {
      const updated = await api.generatePageImage({
        taskId,
        projectRoot: project.rootDir,
        pageId: selectedPage.id,
        prompt,
        annotations: pageAnnotations,
        referenceImagePaths: referenceImages.map((image) => image.path),
        model: "gpt-5.5",
        reasoningEffort: "high"
      });
      onProjectChange(updated);
      setReferenceImages([]);
      setPageAnnotations([]);
      setAnnotationPopover(null);
      setAnnotationMode(false);
      onNotice(t("界面图片已生成"));
    } catch (err) {
      taskResult = "error";
      onError(toErrorMessage(err));
    } finally {
      onImageTaskFinish(selectedPage.id, taskId, taskResult);
    }
  }

  async function generatePageBackground() {
    if (!selectedPage?.imagePath || activeImageTask) {
      return;
    }

    const taskId = createTaskId();
    let taskResult: ImageTaskResult = "success";

    setAssetPreview(null);
    onImageTaskStart(selectedPage.id, taskId, t("正在提取页面背景"));
    onError("");

    try {
      const updated = await api.generatePageBackground({
        taskId,
        projectRoot: project.rootDir,
        pageId: selectedPage.id,
        model: "gpt-5.5",
        reasoningEffort: "high"
      });
      onProjectChange(updated);
      onNotice(t("页面背景已提取并写入 pages.json"));
    } catch (err) {
      taskResult = "error";
      onError(toErrorMessage(err));
    } finally {
      onImageTaskFinish(selectedPage.id, taskId, taskResult);
    }
  }

  async function generateSlice(mode: SliceGenerateMode = sliceGenerateMode) {
    if (!selectedPage?.imagePath || activeImageTask) {
      return;
    }

    const checkedSelectionIdSet = new Set(checkedSliceSelectionIds);
    const candidateSelections =
      checkedSelectionIdSet.size > 0
        ? sliceSelections.filter((selection) => checkedSelectionIdSet.has(selection.id))
        : sliceSelections;
    const targetSelectionIds = candidateSelections
      .filter((selection) => mode === "force" || selection.status === "pending")
      .map((selection) => selection.id);

    if (targetSelectionIds.length === 0) {
      return;
    }

    const taskId = createTaskId();
    let taskResult: ImageTaskResult = "success";

    onImageTaskStart(
      selectedPage.id,
      taskId,
      mode === "force" ? t("正在强制重新生成切图素材") : t("正在生成切图素材")
    );
    setAssetPreview(null);
    onError("");

    try {
      const batchUpdated = await api.generateSliceAssets({
        taskId,
        projectRoot: project.rootDir,
        pageId: selectedPage.id,
        selectionIds: targetSelectionIds,
        force: mode === "force",
        replaceExisting: mode === "force",
        model: "gpt-5.5",
        reasoningEffort: "high"
      });
      onProjectChange(batchUpdated);
      setDragSelection(null);
      setSelectionMode(false);
      onNotice(mode === "force" ? t("切图已强制重新生成") : t("切图生成已完成"));
    } catch (err) {
      taskResult = "error";
      onError(toErrorMessage(err));
    } finally {
      onImageTaskFinish(selectedPage.id, taskId, taskResult);
    }
  }

  async function identifySliceSelections() {
    if (!selectedPage?.imagePath || activeImageTask) {
      return;
    }

    const taskId = createTaskId();
    let taskResult: ImageTaskResult = "success";

    setAssetPreview(null);
    setSelectionMode(false);
    setAnnotationMode(false);
    setAnnotationPopover(null);
    onImageTaskStart(selectedPage.id, taskId, t("正在识别切图区域"));
    onError("");

    try {
      const updated = await api.identifySliceSelections({
        taskId,
        projectRoot: project.rootDir,
        pageId: selectedPage.id,
        model: "gpt-5.5",
        reasoningEffort: "high"
      });
      onProjectChange(updated);
      onNotice(t("切图区域已识别，可确认后生成全部切图"));
    } catch (err) {
      taskResult = "error";
      onError(toErrorMessage(err));
    } finally {
      onImageTaskFinish(selectedPage.id, taskId, taskResult);
    }
  }

  async function generateSingleSlice(selectionId: string, note: string) {
    if (!selectedPage?.imagePath || activeImageTask) {
      return;
    }

    const taskId = createTaskId();
    let taskResult: ImageTaskResult = "success";

    onImageTaskStart(selectedPage.id, taskId, t("正在单独生成切图素材"));
    setAssetPreview(null);
    onError("");

    try {
      const updated = await api.generateSliceAssets({
        taskId,
        projectRoot: project.rootDir,
        pageId: selectedPage.id,
        selectionIds: [selectionId],
        prompt: note,
        force: true,
        replaceExisting: true,
        model: "gpt-5.5",
        reasoningEffort: "high"
      });
      onProjectChange(updated);
      setSelectedSelectionId(selectionId);
      setContextMenu(null);
      setSingleSliceNote("");
      onNotice(t("单独切图已完成"));
    } catch (err) {
      taskResult = "error";
      onError(toErrorMessage(err));
    } finally {
      onImageTaskFinish(selectedPage.id, taskId, taskResult);
    }
  }

  async function saveSelections(nextSelections: SliceSelectionMeta[]) {
    if (!selectedPage) {
      return;
    }

    setSliceSelections(nextSelections);

    try {
      const updated = await api.saveSliceSelections({
        projectRoot: project.rootDir,
        pageId: selectedPage.id,
        selections: nextSelections
      });
      onProjectChange(updated);
    } catch (err) {
      onError(toErrorMessage(err));
    }
  }

  async function createSliceSelection(selection: SelectionRect) {
    if (!selectedPage?.imagePath || !imageRef.current) {
      return;
    }

    const naturalSelection = toNaturalSelection(selection, getImageDisplayedSize(imageRef.current), imageRef.current);

    if (naturalSelection.width < 8 || naturalSelection.height < 8) {
      return;
    }

    const timestamp = new Date().toISOString();
    const nextIndex = sliceSelections.length + 1;
    const nextSelection: SliceSelectionMeta = {
      id: createClientId("selection"),
      pageId: selectedPage.id,
      name: `${selectedPage.name} 素材 ${nextIndex}`,
      sourceImagePath: selectedPage.imagePath,
      selection: naturalSelection,
      prompt: "",
      status: "pending",
      assetId: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const nextSelections = [...sliceSelections, nextSelection];

    setSelectedSelectionId(nextSelection.id);
    await saveSelections(nextSelections);
  }

  function startAnnotationMode() {
    if (!selectedPage?.imagePath || activeImageTask) {
      return;
    }

    setAssetPreview(null);
    setPrompt("");
    setSelectionMode(false);
    setAnnotationMode((value) => !value);
    setAnnotationPopover(null);
    setDragSelection(null);
    setDragStart(null);
  }

  function createAnnotation(displaySelection: SelectionRect) {
    if (!selectedPage?.imagePath || !imageRef.current) {
      return;
    }

    const naturalSelection = toNaturalSelection(displaySelection, getImageDisplayedSize(imageRef.current), imageRef.current);

    if (naturalSelection.width < 8 || naturalSelection.height < 8) {
      return;
    }

    const timestamp = new Date().toISOString();
    const annotation: PageImageAnnotation = {
      id: createClientId("annotation"),
      pageId: selectedPage.id,
      sourceImagePath: selectedPage.imagePath,
      selection: naturalSelection,
      note: "",
      createdAt: timestamp
    };

    setAnnotationPopover({
      displaySelection,
      annotation,
      note: ""
    });
  }

  function submitAnnotation() {
    if (!annotationPopover || !annotationPopover.note.trim()) {
      return;
    }

    const annotation = {
      ...annotationPopover.annotation,
      note: annotationPopover.note.trim()
    };
    const annotationText = formatImageAnnotationPrompt(annotation, t);

    setPageAnnotations((current) => [...current, annotation]);
    setPrompt((current) => {
      const prefix = current.trimEnd();
      return prefix ? `${prefix}\n\n${annotationText}` : annotationText;
    });
    setAnnotationPopover(null);
  }

  function updateSelectionDraft(event: PointerEvent<HTMLDivElement>, done = false) {
    if ((!selectionMode && !annotationMode) || !imageRef.current || !selectedPage?.imagePath) {
      return;
    }

    const point = getImageLocalPoint(event);

    if (!point) {
      return;
    }

    if (!dragStart) {
      setDragStart(point);
      setDragSelection({ x: point.x, y: point.y, width: 1, height: 1 });
      return;
    }

    const nextSelection = normalizeRect(dragStart, point);
    setDragSelection(nextSelection);

    if (done) {
      setDragStart(null);
      setDragSelection(null);

      if (annotationMode) {
        createAnnotation(nextSelection);
      } else {
        createSliceSelection(nextSelection).catch((err) => onError(toErrorMessage(err)));
      }
    }
  }

  function getImageLocalPoint(event: PointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    if (!imageRef.current) {
      return null;
    }

    const rect = imageRef.current.getBoundingClientRect();
    const scale = imageZoom || 1;

    return clampPoint(
      (event.clientX - rect.left) / scale,
      (event.clientY - rect.top) / scale,
      {
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight
      }
    );
  }

  function resetImageViewport() {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setPanStart(null);
  }

  function applyImageZoom(nextZoom: number, anchor?: { clientX: number; clientY: number }) {
    if (!imageStageRef.current) {
      setImageZoom(clampZoom(nextZoom));
      return;
    }

    const clampedZoom = clampZoom(nextZoom);
    const stageRect = imageStageRef.current.getBoundingClientRect();
    const anchorX = anchor ? anchor.clientX - stageRect.left : stageRect.width / 2;
    const anchorY = anchor ? anchor.clientY - stageRect.top : stageRect.height / 2;
    const localX = (anchorX - imagePan.x) / imageZoom;
    const localY = (anchorY - imagePan.y) / imageZoom;

    setImageZoom(clampedZoom);
    setImagePan({
      x: anchorX - localX * clampedZoom,
      y: anchorY - localY * clampedZoom
    });
  }

  function handleImageWheel(event: WheelEvent<HTMLDivElement>) {
    if (!imageData || assetPreview) {
      return;
    }

    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    applyImageZoom(imageZoom * factor, { clientX: event.clientX, clientY: event.clientY });
  }

  function startImagePan(event: PointerEvent<HTMLDivElement>) {
    if (selectionMode || annotationMode || assetPreview || !imageData) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("button,input,textarea,select")) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setPanStart({
      clientX: event.clientX,
      clientY: event.clientY,
      x: imagePan.x,
      y: imagePan.y
    });
  }

  function updateImagePan(event: PointerEvent<HTMLDivElement>) {
    if (!panStart || selectionMode || annotationMode) {
      return;
    }

    setImagePan({
      x: panStart.x + event.clientX - panStart.clientX,
      y: panStart.y + event.clientY - panStart.clientY
    });
  }

  function finishImagePan(event: PointerEvent<HTMLDivElement>) {
    if (panStart) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setPanStart(null);
  }

  const pageAssets = selectedPage
    ? project.meta.assets.filter((asset) => asset.pageId === selectedPage.id)
    : [];
  const activeImageTask = selectedPage ? imageTasks[selectedPage.id] || null : null;
  const imageStreamEvents = selectedPage ? imageStreamEventsByPage[selectedPage.id] || [] : [];
  const checkedSliceSelectionIdSet = useMemo(
    () => new Set(checkedSliceSelectionIds),
    [checkedSliceSelectionIds]
  );
  const checkedSliceSelections = sliceSelections.filter((selection) =>
    checkedSliceSelectionIdSet.has(selection.id)
  );
  const sliceGenerateCandidates =
    checkedSliceSelections.length > 0 ? checkedSliceSelections : sliceSelections;
  const pendingSliceSelections = sliceGenerateCandidates.filter(
    (selection) => selection.status === "pending"
  );
  const forcedSliceSelections = sliceGenerateCandidates;
  const activeSliceGenerateCount =
    sliceGenerateMode === "force" ? forcedSliceSelections.length : pendingSliceSelections.length;
  const sliceGenerateTargetText =
    checkedSliceSelections.length > 0
      ? t("已选 {count}", { count: checkedSliceSelections.length })
      : t("全部区域");
  const activeVersion = imageVersions.find((version) => version.active);
  const selectedSliceSelection = sliceSelections.find((selection) => selection.id === selectedSelectionId);
  const selectedPreviewAsset = assetPreview?.kind === "slice"
    ? pageAssets.find((asset) => asset.id === assetPreview.assetId)
    : null;
  const previewTitle = assetPreview?.kind === "background"
    ? t("页面背景")
    : selectedPreviewAsset?.name || t("切图素材");
  const previewPath = assetPreview?.kind === "background"
    ? assetPreview.path
    : selectedPreviewAsset?.path || "";

  async function refreshPages() {
    if (activeImageTask) {
      return;
    }

    try {
      const refreshedProject = await api.openProject(project.rootDir);
      const nextSelectedPage =
        refreshedProject.meta.pages.find((page) => page.id === selectedPageId) ||
        refreshedProject.meta.pages[0];

      onProjectChange(refreshedProject);
      setSelectedPageId(nextSelectedPage?.id || "");
      setAssetPreview(null);
      setSelectionMode(false);
      setAnnotationMode(false);
      setAnnotationPopover(null);
      setDragStart(null);
      setDragSelection(null);
      setContextMenu(null);
      setSingleSliceNote("");
      resetImageViewport();
      onError("");
      onNotice(t("页面数据已刷新"));
    } catch (error) {
      onError(toErrorMessage(error));
    }
  }

  function updateImageRenderInfo() {
    if (!imageRef.current) {
      setImageRenderInfo(null);
      return;
    }

    setImageRenderInfo({
      width: imageRef.current.clientWidth,
      height: imageRef.current.clientHeight,
      naturalWidth: imageRef.current.naturalWidth,
      naturalHeight: imageRef.current.naturalHeight
    });
  }

  async function updateSliceSelection(
    selectionId: string,
    patch: Partial<Pick<SliceSelectionMeta, "name" | "prompt">>
  ) {
    const timestamp = new Date().toISOString();
    const nextSelections = sliceSelections.map((selection) =>
      selection.id === selectionId
        ? {
            ...selection,
            ...patch,
            status: selection.status === "generated" ? selection.status : ("pending" as const),
            updatedAt: timestamp
          }
        : selection
    );

    await saveSelections(nextSelections);
  }

  function toggleCheckedSliceSelection(selectionId: string, checked: boolean) {
    setCheckedSliceSelectionIds((current) =>
      checked
        ? Array.from(new Set([...current, selectionId]))
        : current.filter((item) => item !== selectionId)
    );
  }

  async function previewSliceAsset(asset: AssetMeta) {
    setSelectionMode(false);
    setAnnotationMode(false);
    setAnnotationPopover(null);
    setDragStart(null);
    setDragSelection(null);
    setImageRenderInfo(null);
    onError("");

    try {
      const dataUrl = await api.readAssetAsDataUrl({
        projectRoot: project.rootDir,
        relativePath: asset.path
      });
      setAssetPreview({ kind: "slice", assetId: asset.id, dataUrl });
    } catch (err) {
      onError(toErrorMessage(err));
    }
  }

  async function previewPageBackground() {
    if (!selectedPage?.backgroundImagePath) {
      return;
    }

    setSelectionMode(false);
    setAnnotationMode(false);
    setAnnotationPopover(null);
    setDragStart(null);
    setDragSelection(null);
    setImageRenderInfo(null);
    onError("");

    try {
      const dataUrl = await api.readAssetAsDataUrl({
        projectRoot: project.rootDir,
        relativePath: selectedPage.backgroundImagePath
      });
      setAssetPreview({
        kind: "background",
        path: selectedPage.backgroundImagePath,
        dataUrl
      });
    } catch (err) {
      onError(toErrorMessage(err));
    }
  }

  function returnToSliceCanvas() {
    setAssetPreview(null);
    window.setTimeout(updateImageRenderInfo, 0);
  }

  async function deleteSliceSelection(selectionId: string) {
    const nextSelections = sliceSelections.filter((selection) => selection.id !== selectionId);
    setSelectedSelectionId((current) => (current === selectionId ? nextSelections[0]?.id || "" : current));
    await saveSelections(nextSelections);
  }

  function deleteAnnotation(annotationId: string) {
    setPageAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId));
    setPrompt((current) => removeImageAnnotationPrompt(current, annotationId));
    setAnnotationPopover((current) =>
      current?.annotation.id === annotationId ? null : current
    );
  }

  function openDeleteContextMenu(
    event: MouseEvent<HTMLElement>,
    target: { type: "slice" | "annotation"; id: string; label: string }
  ) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      ...target
    });
    setSingleSliceNote("");
  }

  function confirmContextDelete() {
    if (!contextMenu) {
      return;
    }

    if (contextMenu.type === "slice") {
      deleteSliceSelection(contextMenu.id).catch((err) => onError(toErrorMessage(err)));
    } else {
      deleteAnnotation(contextMenu.id);
    }

    setContextMenu(null);
    setSingleSliceNote("");
  }

  async function switchPageImageVersion(imagePath: string) {
    if (!selectedPage || !imagePath || imagePath === selectedPage.imagePath) {
      return;
    }

    setAssetPreview(null);

    try {
      const updated = await api.setActivePageImageVersion({
        projectRoot: project.rootDir,
        pageId: selectedPage.id,
        imagePath
      });
      onProjectChange(updated);
    } catch (err) {
      onError(toErrorMessage(err));
    }
  }

  return (
    <div className="split-layout">
      <aside className="sidebar">
        <div className="panel-title">
          <Layers size={16} />
          <span>{t("页面")}</span>
        </div>
        <div className="nav-list">
          {project.meta.pages.length === 0 ? (
            <div className="empty-state compact">{t("暂无页面")}</div>
          ) : (
            project.meta.pages.map((page) => {
              const pageTask = imageTasks[page.id];
              const pageTaskResult = imageTaskResultsByPage[page.id];

              return (
                <button
                  className={
                    selectedPage?.id === page.id ? "nav-row page-nav-row active" : "nav-row page-nav-row"
                  }
                  key={page.id}
                  onClick={() => setSelectedPageId(page.id)}
                >
                  <span className="page-nav-text">
                    <span>{page.name}</span>
                    <small>{page.route}</small>
                  </span>
                  <PageTaskIndicator
                    running={Boolean(pageTask)}
                    result={pageTaskResult}
                    onClear={() => onClearImageTaskResult(page.id)}
                  />
                </button>
              );
            })
          )}
        </div>
      </aside>
      <section className="main-panel page-panel">
        <div className="page-toolbar">
          <div>
            <h2>{selectedPage?.name || t("页面")}</h2>
            <span>{selectedPage?.route || ""}</span>
          </div>
          <div className="toolbar-group">
            <button
              className="toolbar-button"
              onClick={refreshPages}
              disabled={Boolean(activeImageTask)}
              title={t("刷新页面数据")}
              type="button"
            >
              <RefreshCw size={16} />
              {t("刷新")}
            </button>
            {selectedPage?.needUpdate ? (
              <div className="page-update-hint">
                <RefreshCw size={15} />
                {t("页面规划已更新，可以重新生成界面")}
              </div>
            ) : null}
            <label className="version-picker">
              <span>{t("版本")}</span>
              <select
                value={activeVersion?.path || ""}
                onChange={(event) => switchPageImageVersion(event.target.value)}
                disabled={imageVersions.length === 0 || Boolean(activeImageTask)}
                aria-label={t("选择页面图片版本")}
              >
                {imageVersions.length === 0 ? (
                  <option value="">{t("暂无版本")}</option>
                ) : (
                  imageVersions.map((version) => (
                    <option value={version.path} key={version.path}>
                      {version.version}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              className={selectionMode ? "toolbar-button active" : "toolbar-button"}
              onClick={() => {
                setAssetPreview(null);
                setSelectionMode((value) => !value);
                setAnnotationMode(false);
                setAnnotationPopover(null);
              }}
              disabled={!selectedPage?.imagePath || Boolean(activeImageTask) || Boolean(assetPreview)}
            >
              <Scissors size={16} />
              {t("切图")}
            </button>
            <button
              className={annotationMode ? "toolbar-button active" : "toolbar-button"}
              onClick={startAnnotationMode}
              disabled={!selectedPage?.imagePath || Boolean(activeImageTask) || Boolean(assetPreview)}
            >
              <FileText size={16} />
              {t("批注")}
            </button>
            <button
              className="toolbar-button"
              onClick={generatePageBackground}
              disabled={!selectedPage?.imagePath || Boolean(activeImageTask) || Boolean(assetPreview)}
              title={selectedPage?.backgroundImagePath || t("提取当前页面背景并写入 pages.json")}
              type="button"
            >
              <Image size={16} />
              {selectedPage?.backgroundImagePath ? t("重提背景") : t("提取背景")}
            </button>
            {selectedPage?.backgroundImagePath ? (
              <button
                className="toolbar-button"
                onClick={previewPageBackground}
                disabled={Boolean(activeImageTask)}
                title={selectedPage.backgroundImagePath}
                type="button"
              >
                <Eye size={16} />
                {t("查看背景")}
              </button>
            ) : null}
            <button
              className="toolbar-button"
              onClick={identifySliceSelections}
              disabled={!selectedPage?.imagePath || Boolean(activeImageTask) || Boolean(assetPreview)}
              title={t("让 AI 自动识别当前界面中适合切图的组件区域")}
              type="button"
            >
              <Sparkles size={16} />
              {t("AI识别切图")}
            </button>
            <div className="split-generate-control" title={t("{target}，本次 {count} 个", { target: sliceGenerateTargetText, count: activeSliceGenerateCount })}>
              <button
                className="primary-button"
                onClick={() => generateSlice(sliceGenerateMode)}
                disabled={
                  activeSliceGenerateCount === 0 ||
                  !selectedPage?.imagePath ||
                  Boolean(activeImageTask) ||
                  Boolean(assetPreview)
                }
                type="button"
              >
                <Image size={16} />
                {t("生成切图")}
              </button>
              <select
                aria-label={t("切图生成模式")}
                className="generate-mode-select"
                disabled={!selectedPage?.imagePath || Boolean(activeImageTask) || Boolean(assetPreview)}
                onChange={(event) => setSliceGenerateMode(event.target.value as SliceGenerateMode)}
                value={sliceGenerateMode}
              >
                <option value="pending">{t("仅未生成")}</option>
                <option value="force">{t("强制重新切图")}</option>
              </select>
            </div>
          </div>
        </div>

        <div
          ref={imageStageRef}
          className={[
            "image-stage",
            selectionMode || annotationMode ? "selecting" : "",
            !selectionMode && !annotationMode && imageData && !assetPreview ? "pannable" : "",
            panStart ? "panning" : "",
            assetPreview ? "asset-preview-stage" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          onWheel={handleImageWheel}
          onPointerDown={(event) => {
            if (selectionMode || annotationMode) {
              updateSelectionDraft(event);
              return;
            }

            startImagePan(event);
          }}
          onPointerMove={(event) => {
            if (selectionMode || annotationMode) {
              if (dragStart) {
                updateSelectionDraft(event);
              }
              return;
            }

            updateImagePan(event);
          }}
          onPointerLeave={(event) => {
            if (selectionMode || annotationMode) {
              if (dragStart) {
                updateSelectionDraft(event, true);
              }
              return;
            }

            finishImagePan(event);
          }}
          onPointerUp={(event) => {
            if (selectionMode || annotationMode) {
              updateSelectionDraft(event, true);
              return;
            }

            finishImagePan(event);
          }}
        >
          {imageData && !assetPreview ? (
            <div className="image-viewport-controls">
              <button
                className="icon-button compact"
                onClick={() => applyImageZoom(imageZoom * 1.2)}
                title={t("放大")}
                type="button"
              >
                <Plus size={15} />
              </button>
              <button
                className="icon-button compact"
                onClick={() => applyImageZoom(imageZoom / 1.2)}
                title={t("缩小")}
                type="button"
              >
                <Minus size={15} />
              </button>
              <button
                className="icon-button compact"
                onClick={resetImageViewport}
                title={t("重置视图")}
                type="button"
              >
                <RotateCcw size={15} />
              </button>
              <span>{Math.round(imageZoom * 100)}%</span>
            </div>
          ) : null}
          {assetPreview ? (
            <div className="asset-preview-view">
              <div className="asset-preview-toolbar">
	                <button className="secondary-button compact" onClick={returnToSliceCanvas} type="button">
	                  <ArrowLeft size={15} />
	                  {t("返回页面")}
	                </button>
	                <div className="asset-preview-meta">
	                  <strong>{previewTitle}</strong>
	                  <span>{previewPath}</span>
	                </div>
	              </div>
	              <div className="asset-preview-canvas">
	                <img src={assetPreview.dataUrl} alt={previewTitle} />
	              </div>
            </div>
          ) : imageData ? (
            <div
              className="image-wrap"
              style={{
                transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`
              }}
            >
              <img
                ref={imageRef}
                src={imageData}
                draggable={false}
                alt={selectedPage?.name || "UI"}
                onLoad={updateImageRenderInfo}
              />
              {imageRenderInfo && !annotationMode
                ? sliceSelections.map((selection, index) => {
                    const displayRect = naturalToDisplaySelection(selection.selection, imageRenderInfo);
                    return (
                      <button
                        className={
                          selectedSelectionId === selection.id
                            ? "selection-box saved active"
                            : "selection-box saved"
                        }
                        key={selection.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedSelectionId(selection.id);
                        }}
                        onContextMenu={(event) => {
                          openDeleteContextMenu(event, {
                            type: "slice",
                            id: selection.id,
                            label: selection.name
                          });
                        }}
                        style={{
                          left: displayRect.x,
                          top: displayRect.y,
                          width: displayRect.width,
                          height: displayRect.height
                        }}
                        type="button"
                        title={t("{name}，右键删除", { name: selection.name })}
                      >
                        {index + 1}
                      </button>
                    );
                  })
                : null}
              {imageRenderInfo && annotationMode
                ? pageAnnotations.map((annotation, index) => {
                    const displayRect = naturalToDisplaySelection(annotation.selection, imageRenderInfo);
                    return (
                      <button
                        className="annotation-box"
                        key={annotation.id}
                        onContextMenu={(event) => {
                          openDeleteContextMenu(event, {
                            type: "annotation",
                            id: annotation.id,
                            label: t("批注 {index}", { index: index + 1 })
                          });
                        }}
                        style={{
                          left: displayRect.x,
                          top: displayRect.y,
                          width: displayRect.width,
                          height: displayRect.height
                        }}
                        title={annotation.note}
                        type="button"
                      >
                        {t("批注 {index}", { index: index + 1 })}
                      </button>
                    );
                  })
                : null}
              {dragSelection ? (
                <div
                  className={annotationMode ? "selection-box annotation-draft" : "selection-box"}
                  style={{
                    left: dragSelection.x,
                    top: dragSelection.y,
                    width: dragSelection.width,
                    height: dragSelection.height
                  }}
                />
              ) : null}
              {annotationPopover ? (
                <div
                  className="annotation-popover"
                  style={{
                    left: Math.min(annotationPopover.displaySelection.x + annotationPopover.displaySelection.width + 8, 560),
                    top: annotationPopover.displaySelection.y
                  }}
                >
                  <input
                    value={annotationPopover.note}
                    onChange={(event) =>
                      setAnnotationPopover({
                        ...annotationPopover,
                        note: event.target.value
                      })
                    }
                    placeholder={t("添加批注...")}
                    autoFocus
                  />
                  <button className="primary-button compact" onClick={submitAnnotation} type="button">
                    {t("添加")}
                  </button>
                  <button
                    className="secondary-button compact"
                    onClick={() => setAnnotationPopover(null)}
                    type="button"
                  >
                    {t("取消")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">{t("暂无界面图片")}</div>
          )}
        </div>

        <div className="asset-strip">
          {sliceSelections.length === 0 ? (
            <span>{t("暂无切图区域")}</span>
          ) : (
            <>
              <div className="slice-selection-tools">
                <span>{t("已选 {count}", { count: checkedSliceSelections.length })}</span>
                <button
                  className="secondary-button compact"
                  onClick={() => setCheckedSliceSelectionIds(sliceSelections.map((selection) => selection.id))}
                  type="button"
                >
                  {t("全选")}
                </button>
                <button
                  className="secondary-button compact"
                  disabled={checkedSliceSelections.length === 0}
                  onClick={() => setCheckedSliceSelectionIds([])}
                  type="button"
                >
                  {t("清空")}
                </button>
              </div>
              {sliceSelections.map((selection, index) => {
                const linkedAsset = pageAssets.find((asset) => asset.id === selection.assetId);
                return (
                  <div
                    className={
                      selectedSelectionId === selection.id
                        ? "slice-selection-item active"
                        : "slice-selection-item"
                    }
                    key={selection.id}
                    onClick={() => {
                      setSelectedSelectionId(selection.id);
                      if (linkedAsset) {
                        void previewSliceAsset(linkedAsset);
                      } else {
                        setAssetPreview(null);
                      }
                    }}
                    ref={selectedSelectionId === selection.id ? selectedSliceItemRef : undefined}
                  >
                    <input
                      aria-label={t("选择 {name}", { name: selection.name })}
                      checked={checkedSliceSelectionIdSet.has(selection.id)}
                      className="slice-selection-checkbox"
                      onChange={(event) => toggleCheckedSliceSelection(selection.id, event.target.checked)}
                      onClick={(event) => event.stopPropagation()}
                      type="checkbox"
                    />
                    <strong>{index + 1}</strong>
                    <input
                      value={selection.name}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setSliceSelections((current) =>
                          current.map((item) =>
                            item.id === selection.id ? { ...item, name: event.target.value } : item
                          )
                        )
                      }
                      onBlur={(event) => updateSliceSelection(selection.id, { name: event.target.value })}
                      aria-label={t("切图名称")}
                    />
                    <span>{linkedAsset ? linkedAsset.id : formatSelectionStatus(selection.status, t)}</span>
                    <button
                      className="secondary-button compact slice-preview-button"
                      disabled={!linkedAsset}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (linkedAsset) {
                          setSelectedSelectionId(selection.id);
                          void previewSliceAsset(linkedAsset);
                        }
                      }}
                      title={linkedAsset ? t("查看切图素材") : t("素材生成后可查看")}
                      type="button"
                    >
                      <Eye size={14} />
                      {t("查看")}
                    </button>
                    <button
                      className="icon-button compact"
                      onClick={(event) => {
                        event.stopPropagation();
                        setContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          type: "slice",
                          id: selection.id,
                          label: selection.name
                        });
                      }}
                      title={t("删除切图区域")}
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {selectedSliceSelection ? (
          <div className="slice-selection-editor">
            <label>
              <span>{t("素材描述")}</span>
              <div className="slice-description-readonly">
                {selectedSliceSelection.prompt.trim() || t("生成素材后由 Codex 根据参考图和框选位置自动填写")}
              </div>
            </label>
          </div>
        ) : null}

        <div className="image-task-area">
          {activeImageTask ? (
            <TaskStatus task={activeImageTask} onCancel={() => onCancelImageTask(activeImageTask.pageId || selectedPage?.id || "")} />
          ) : null}
          {imageStreamEvents.length > 0 ? (
            <AiStreamPanel events={imageStreamEvents} endRef={imageStreamEndRef} compact />
          ) : null}
        </div>

        <div className="prompt-composer" onPaste={handleReferenceImagePaste}>
          <ReferenceImagePicker
            images={referenceImages}
            disabled={Boolean(activeImageTask)}
            onAddFiles={addReferenceImageFiles}
            onChange={setReferenceImages}
          />
          <div className="prompt-bar">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t("输入界面风格")}
            />
            <button
              className="primary-button send-button"
              onClick={generatePageImage}
              disabled={!selectedPage || Boolean(activeImageTask)}
            >
              <Send size={18} />
              {activeImageTask ? t("处理中") : t("生成图片")}
            </button>
          </div>
        </div>
        {contextMenu ? (
          <div
            className={contextMenu.type === "slice" ? "canvas-context-menu slice-action-menu" : "canvas-context-menu"}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            {contextMenu.type === "slice" ? (
              <>
                <span>{t("切图区域：{label}", { label: contextMenu.label })}</span>
                <textarea
                  value={singleSliceNote}
                  onChange={(event) => setSingleSliceNote(event.target.value)}
                  placeholder={t("本次单独切图备注，例如：补上左侧阴影、不要包含背景、多切了右侧按钮...")}
                  rows={3}
                  autoFocus
                />
                <div className="canvas-context-actions">
                  <button
                    className="primary-button compact"
                    disabled={Boolean(activeImageTask)}
                    onClick={() => generateSingleSlice(contextMenu.id, singleSliceNote)}
                    type="button"
                  >
                    {t("单独切图")}
                  </button>
                  <button className="danger-button compact" onClick={confirmContextDelete} type="button">
                    {t("删除区域")}
                  </button>
                  <button
                    className="secondary-button compact"
                    onClick={() => {
                      setContextMenu(null);
                      setSingleSliceNote("");
                    }}
                    type="button"
                  >
                    {t("取消")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <span>{t("删除 {label}？", { label: contextMenu.label })}</span>
                <button className="danger-button compact" onClick={confirmContextDelete} type="button">
                  {t("删除")}
                </button>
                <button className="secondary-button compact" onClick={() => setContextMenu(null)} type="button">
                  {t("取消")}
                </button>
              </>
            )}
          </div>
        ) : null}
	      </section>
    </div>
  );
}

function SettingsDialog({
  onClose,
  onError,
  onNotice
}: {
  onClose: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [codexArgs, setCodexArgs] = useState("");

  useEffect(() => {
    api
      .getSettings()
      .then((value) => {
        setSettings(value);
        setCodexArgs(value.codex.args.join("\n"));
      })
      .catch((err) => onError(toErrorMessage(err)));
  }, [onError]);

  async function save() {
    if (!settings) {
      return;
    }

    try {
      await api.saveSettings({
        codex: {
          ...settings.codex,
          args: splitLines(codexArgs)
        }
      });
      onNotice(t("设置已保存"));
      onClose();
    } catch (err) {
      onError(toErrorMessage(err));
    }
  }

  const timeoutMinutes = settings ? Math.max(1, Math.round(settings.codex.timeoutMs / 60_000)) : 30;

  return (
    <Dialog title={t("设置")} onClose={onClose}>
      {settings ? (
        <>
          <label className="field">
            <span>{t("Codex 命令")}</span>
            <input
              value={settings.codex.command}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  codex: { ...settings.codex, command: event.target.value }
                })
              }
            />
          </label>
          <label className="field">
            <span>{t("Codex 参数")}</span>
            <textarea value={codexArgs} onChange={(event) => setCodexArgs(event.target.value)} />
          </label>
          <label className="field">
            <span>{t("Codex 超时分钟数")}</span>
            <input
              min={1}
              type="number"
              value={timeoutMinutes}
              onChange={(event) => {
                const minutes = Number(event.target.value);

                if (!Number.isFinite(minutes) || minutes <= 0) {
                  return;
                }

                setSettings({
                  ...settings,
                  codex: {
                    ...settings.codex,
                    timeoutMs: Math.round(minutes * 60_000)
                  }
                });
              }}
            />
          </label>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={onClose}>
              {t("取消")}
            </button>
            <button className="primary-button" onClick={save}>
              <Check size={16} />
              {t("保存")}
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state compact">{t("加载中")}</div>
      )}
    </Dialog>
  );
}

function Dialog({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} title={t("关闭")}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function toNaturalSelection(
  selection: SelectionRect,
  displayedRect: { width: number; height: number },
  image: HTMLImageElement
): SelectionRect {
  return selectionToNatural(
    selection,
    { width: displayedRect.width, height: displayedRect.height },
    { width: image.naturalWidth, height: image.naturalHeight }
  );
}

function getImageDisplayedSize(image: HTMLImageElement): { width: number; height: number } {
  return {
    width: image.clientWidth,
    height: image.clientHeight
  };
}

function naturalToDisplaySelection(
  selection: SelectionRect,
  image: { width: number; height: number; naturalWidth: number; naturalHeight: number }
): SelectionRect {
  const scaleX = image.width / image.naturalWidth;
  const scaleY = image.height / image.naturalHeight;

  return {
    x: Math.round(selection.x * scaleX),
    y: Math.round(selection.y * scaleY),
    width: Math.max(1, Math.round(selection.width * scaleX)),
    height: Math.max(1, Math.round(selection.height * scaleY))
  };
}

function normalizeRect(
  start: { x: number; y: number },
  end: { x: number; y: number }
): SelectionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y))
  };
}

function clampPoint(x: number, y: number, rect: { width: number; height: number }): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 0), rect.width),
    y: Math.min(Math.max(y, 0), rect.height)
  };
}

function clampZoom(value: number): number {
  return Math.min(Math.max(value, 0.25), 4);
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createTaskId(): string {
  return globalThis.crypto?.randomUUID?.() || `task_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function createClientId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 16) ||
    `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

  return `${prefix}_${id}`;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function createInitialProjectPrompt(projectType: ProjectType, locale: Locale): string {
  if (locale === "de") {
    if (projectType === "app") {
      return [
        "Dies ist ein APP-Projekt. Bitte erstelle die Produktplanung nach Standards für mobile Anwendungen.",
        "",
        "Generiere PRD, Funktionsplanung, technische Planung, Styleguide, Seitenplanung, Funktionsliste und zusätzlich eine Animationsliste.",
        "Die Animationsliste soll Seitenübergänge, Komponentenfeedback, Gesteninteraktionen, Lade-/Leer-/Fehlerzustandsanimationen, wichtige Workflow-Animationen und Implementierungshinweise abdecken.",
        "",
        "Projektanforderung:"
      ].join("\n");
    }

    return [
      "Dies ist ein WEB-Projekt. Bitte erstelle die Produktplanung nach Web/H5-Standards.",
      "",
      "Generiere PRD, Funktionsplanung, technische Planung, Styleguide, Seitenplanung und Funktionsliste.",
      "Die Seitenplanung soll Routen, Seitenverantwortlichkeiten, Kerninteraktionen, Zustände und UI-Beschreibungen für spätere Bildgenerierung enthalten.",
      "",
      "Projektanforderung:"
    ].join("\n");
  }

  if (locale === "en") {
    if (projectType === "app") {
      return [
        "This is an APP project. Please complete product planning using mobile application standards.",
        "",
        "Generate PRD, feature plan, technical plan, style guide, page plan, feature list, and an animation list.",
        "The animation list should cover page transitions, component feedback, gesture interactions, loading/empty/error state animation, key workflow motion, and implementation notes.",
        "",
        "Project requirement:"
      ].join("\n");
    }

    return [
      "This is a WEB project. Please complete product planning using Web/H5 application standards.",
      "",
      "Generate PRD, feature plan, technical plan, style guide, page plan, and feature list.",
      "The page plan should specify routes, page responsibilities, core interactions, states, and UI descriptions for later image generation.",
      "",
      "Project requirement:"
    ].join("\n");
  }

  if (projectType === "app") {
    return [
      "这是一个 APP 项目，请按移动端应用标准完成产品规划。",
      "",
      "请生成 PRD、功能规划、技术方案、视觉规范、页面规划、功能清单，并额外生成动效清单。",
      "动效清单需要覆盖页面转场、组件反馈、手势交互、加载/空/错误状态动画、关键业务流程动效和开发实现注意事项。",
      "",
      "项目需求："
    ].join("\n");
  }

  return [
    "这是一个 WEB 项目，请按 Web/H5 应用标准完成产品规划。",
    "",
    "请生成 PRD、功能规划、技术方案、视觉规范、页面规划和功能清单。",
    "页面规划需要明确路由、页面职责、核心交互、状态和后续生成 UI 图片所需的界面描述。",
    "",
    "项目需求："
  ].join("\n");
}

function formatSelectionStatus(status: SliceSelectionMeta["status"], t: (source: string) => string): string {
  switch (status) {
    case "generated":
      return t("已生成");
    case "failed":
      return t("失败");
    case "pending":
      return t("待生成");
  }
}

function formatImageAnnotationPrompt(annotation: PageImageAnnotation, t: (source: string, values?: Record<string, string | number>) => string): string {
  const rect = annotation.selection;

  return [
    t("针对参考图片 {path} 的批注：", { path: annotation.sourceImagePath }),
    t("批注 ID：{id}", { id: annotation.id }),
    t("区域：x={x}, y={y}, width={width}, height={height}", {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }),
    annotation.note
  ].join("\n");
}

function removeImageAnnotationPrompt(value: string, annotationId: string): string {
  const pattern = new RegExp(
    `(^|\\n\\n)(?:针对参考图片|Annotation for reference image|Kommentar zum Referenzbild) [\\s\\S]*?(?:批注 ID：|Annotation ID: |Kommentar-ID: )${escapeRegExp(annotationId)}[\\s\\S]*?(?=\\n\\n(?:针对参考图片|Annotation for reference image|Kommentar zum Referenzbild) |$)`,
    "u"
  );

  return value
    .replace(pattern, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("参考图片读取失败"));
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("参考图片读取失败")));
    reader.readAsDataURL(file);
  });
}

function getClipboardImageFiles(event: ClipboardEvent<HTMLElement>): File[] {
  const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));

  if (files.length > 0) {
    return files;
  }

  return Array.from(event.clipboardData.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

async function saveReferenceImageFiles(projectRoot: string, files: File[]): Promise<ReferenceImageMeta[]> {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));

  return Promise.all(
    imageFiles.map(async (file) => {
      const dataUrl = await readFileAsDataUrl(file);
      return api.saveReferenceImage({
        projectRoot,
        name: file.name,
        mimeType: file.type,
        dataUrl
      });
    })
  );
}

function formatStreamLevel(level: AiStreamEvent["level"], t: (source: string) => string): string {
  switch (level) {
    case "status":
      return t("状态");
    case "stdout":
      return t("输出");
    case "stderr":
      return t("日志");
    case "complete":
      return t("完成");
    case "error":
      return t("错误");
  }
}

function formatDate(value: string, locale: Locale): string {
  const dateLocale = locale === "zh-CN" ? "zh-CN" : locale === "de" ? "de-DE" : "en-US";

  return new Intl.DateTimeFormat(dateLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function toErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutIpcPrefix = raw.replace(/^Error invoking remote method '[^']+': Error:\s*/u, "");

  if (withoutIpcPrefix.length <= 260) {
    return withoutIpcPrefix;
  }

  return `${withoutIpcPrefix.slice(0, 260)}...`;
}
