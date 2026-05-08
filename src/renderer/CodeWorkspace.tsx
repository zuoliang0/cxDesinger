import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  File,
  Folder,
  Loader2,
  RefreshCw,
  Save,
  TerminalSquare,
  Wand2,
  X
} from "lucide-react";
import type { ProjectFileNode, ProjectInfo, ReadProjectFileResult } from "../shared/types";
import { createDemoApi } from "./demo-api";
import { useI18n } from "./i18n";

const api = window.aiProductDesigner ?? createDemoApi();

type PrettierParser = "babel" | "typescript" | "json" | "html" | "css" | "markdown";

type WorkspaceTab =
  | {
      id: string;
      kind: "terminal";
      title: string;
      terminalId: string;
      closable: boolean;
    }
  | {
      id: string;
      kind: "file";
      title: string;
      path: string;
      closable: true;
    };

const HOME_TAB: WorkspaceTab = {
  id: "home",
  kind: "terminal",
  title: "Home",
  terminalId: "terminal-home",
  closable: false
};

export function CodeWorkspace({
  active,
  project,
  onError,
  onNotice
}: {
  active: boolean;
  project: ProjectInfo;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const { t } = useI18n();
  const [files, setFiles] = useState<ProjectFileNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([""]));
  const [tabs, setTabs] = useState<WorkspaceTab[]>([HOME_TAB]);
  const [activeTabId, setActiveTabId] = useState(HOME_TAB.id);
  const [dirtyTabs, setDirtyTabs] = useState<Record<string, boolean>>({});
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [hasActivated, setHasActivated] = useState(active);
  const terminalCount = useMemo(
    () => tabs.filter((tab) => tab.kind === "terminal").length,
    [tabs]
  );

  useEffect(() => {
    if (active) {
      setHasActivated(true);
    }
  }, [active]);

  useEffect(() => {
    setTabs([HOME_TAB]);
    setActiveTabId(HOME_TAB.id);
    setDirtyTabs({});
    setHasActivated(active);
    refreshFiles().catch((err) => onError(toErrorMessage(err)));
  }, [project.rootDir]);

  async function refreshFiles() {
    setLoadingFiles(true);

    try {
      setFiles(await api.listProjectFiles({ projectRoot: project.rootDir }));
    } finally {
      setLoadingFiles(false);
    }
  }

  function openFile(node: ProjectFileNode) {
    if (!node.editable) {
      onError(t("当前文件不是可编辑文本文件"));
      return;
    }

    setTabs((current) => {
      const existing = current.find((tab) => tab.kind === "file" && tab.path === node.path);

      if (existing) {
        setActiveTabId(existing.id);
        return current;
      }

      const tab: WorkspaceTab = {
        id: makeTabId("file"),
        kind: "file",
        title: node.name,
        path: node.path,
        closable: true
      };
      setActiveTabId(tab.id);
      return [...current, tab];
    });
  }

  function duplicateActiveTab() {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);

    if (!activeTab) {
      return;
    }

    if (activeTab.kind === "terminal") {
      const tab: WorkspaceTab = {
        id: makeTabId("terminal"),
        kind: "terminal",
        title: `Codex ${terminalCount + 1}`,
        terminalId: makeTabId("terminal-session"),
        closable: true
      };
      setTabs((current) => [...current, tab]);
      setActiveTabId(tab.id);
      return;
    }

    const tab: WorkspaceTab = {
      id: makeTabId("file"),
      kind: "file",
        title: t("{title} 副本", { title: activeTab.title }),
      path: activeTab.path,
      closable: true
    };
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  }

  function closeTab(tabId: string) {
    const tab = tabs.find((item) => item.id === tabId);

    if (!tab || !tab.closable) {
      return;
    }

    if (dirtyTabs[tabId] && !window.confirm(t("当前文件有未保存修改，确认关闭吗？"))) {
      return;
    }

    setTabs((current) => current.filter((item) => item.id !== tabId));
    setDirtyTabs((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    if (activeTabId === tabId) {
      const tabIndex = tabs.findIndex((item) => item.id === tabId);
      const fallback = tabs[tabIndex - 1] || HOME_TAB;
      setActiveTabId(fallback.id);
    }
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId) || HOME_TAB;
  const shouldRenderTerminalTabs = hasActivated || active;

  return (
    <section className="split-layout code-layout">
      <aside className="sidebar code-sidebar">
        <div className="panel-title">
          <Folder size={16} />
          <span>{t("项目文件")}</span>
          <button className="icon-button compact" onClick={() => refreshFiles().catch((err) => onError(toErrorMessage(err)))} title={t("刷新文件树")}>
            {loadingFiles ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
          </button>
        </div>
        <div className="file-tree">
          {files.length === 0 && !loadingFiles ? (
            <div className="empty-state small">{t("暂无文件")}</div>
          ) : (
            files.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                expandedPaths={expandedPaths}
                onToggle={(path) =>
                  setExpandedPaths((current) => {
                    const next = new Set(current);
                    if (next.has(path)) {
                      next.delete(path);
                    } else {
                      next.add(path);
                    }
                    return next;
                  })
                }
                onOpenFile={openFile}
              />
            ))
          )}
        </div>
      </aside>
      <section className="main-panel code-panel">
        <div className="workspace-tabs">
          <div className="tab-strip">
            {tabs.map((tab) => (
              <button
                className={tab.id === activeTabId ? "workspace-tab active" : "workspace-tab"}
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                title={tab.kind === "file" ? tab.path : tab.title}
              >
                {tab.kind === "terminal" ? <TerminalSquare size={14} /> : <File size={14} />}
                <span>{tab.title}</span>
                {dirtyTabs[tab.id] ? <strong>*</strong> : null}
                {tab.closable ? (
                  <span
                    className="tab-close"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                  >
                    <X size={12} />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <button className="secondary-button compact" onClick={duplicateActiveTab}>
            <Copy size={14} />
            {t("复制标签")}
          </button>
        </div>

        <div className="code-tab-body">
          {shouldRenderTerminalTabs
            ? tabs
                .filter((tab): tab is Extract<WorkspaceTab, { kind: "terminal" }> => tab.kind === "terminal")
                .map((tab) => (
                  <div className={tab.id === activeTab.id ? "terminal-pane active" : "terminal-pane"} key={tab.id}>
                    <CodexTerminal
                      projectRoot={project.rootDir}
                      terminalId={tab.terminalId}
                      active={active && tab.id === activeTab.id}
                      onError={onError}
                    />
                  </div>
                ))
            : null}
          {tabs
            .filter((tab): tab is Extract<WorkspaceTab, { kind: "file" }> => tab.kind === "file")
            .map((tab) => (
              <div className={tab.id === activeTab.id ? "file-editor-pane active" : "file-editor-pane"} key={tab.id}>
                <FileEditor
                  projectRoot={project.rootDir}
                  tabId={tab.id}
                  relativePath={tab.path}
                  onDirtyChange={(dirty) =>
                    setDirtyTabs((current) => ({
                      ...current,
                      [tab.id]: dirty
                    }))
                  }
                  onError={onError}
                  onNotice={onNotice}
                  onSaved={() => refreshFiles().catch((err) => onError(toErrorMessage(err)))}
                />
              </div>
            ))}
        </div>
      </section>
    </section>
  );
}

function FileTreeNode({
  node,
  expandedPaths,
  onToggle,
  onOpenFile
}: {
  node: ProjectFileNode;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onOpenFile: (node: ProjectFileNode) => void;
}) {
  const { t } = useI18n();
  const expanded = expandedPaths.has(node.path);

  if (node.type === "directory") {
    return (
      <div className="file-tree-group">
        <button className="file-tree-row directory" onClick={() => onToggle(node.path)}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={14} />
          <span>{node.name}</span>
        </button>
        {expanded ? (
          <div className="file-tree-children">
            {(node.children || []).map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <button
      className={node.editable ? "file-tree-row" : "file-tree-row disabled"}
      onClick={() => onOpenFile(node)}
      title={node.editable ? node.path : t("不可编辑的文件")}
    >
      <span className="tree-spacer" />
      <File size={14} />
      <span>{node.name}</span>
    </button>
  );
}

function CodexTerminal({
  projectRoot,
  terminalId,
  active,
  onError
}: {
  projectRoot: string;
  terminalId: string;
  active: boolean;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionTerminalIdRef = useRef(makeTabId(terminalId));

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 13,
      theme: {
        background: "#101820",
        foreground: "#d7e0ea",
        cursor: "#ffffff",
        selectionBackground: "#35536b"
      }
    });
    const fitAddon = new FitAddon();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    requestAnimationFrame(() => terminal.focus());

    const dataDispose = terminal.onData((data) => {
      api.writeCodeTerminal({ terminalId: sessionTerminalIdRef.current, data }).catch(() => undefined);
    });
    const unsubscribeData = api.onCodeTerminalData((event) => {
      if (event.terminalId === sessionTerminalIdRef.current) {
        terminal.write(event.data);
      }
    });
    const unsubscribeExit = api.onCodeTerminalExit((event) => {
      if (event.terminalId === sessionTerminalIdRef.current) {
        terminal.write(`\r\n[${t("Codex 终端已退出：{code}", { code: event.exitCode ?? event.signal ?? "unknown" })}]\r\n`);
      }
    });

    api
      .createCodeTerminal({
        projectRoot,
        terminalId: sessionTerminalIdRef.current,
        cols: terminal.cols,
        rows: terminal.rows
      })
      .catch((err) => onError(toErrorMessage(err)));

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      api
        .resizeCodeTerminal({ terminalId: sessionTerminalIdRef.current, cols: terminal.cols, rows: terminal.rows })
        .catch(() => undefined);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      dataDispose.dispose();
      unsubscribeData();
      unsubscribeExit();
      terminal.dispose();
      api.closeCodeTerminal({ terminalId: sessionTerminalIdRef.current }).catch(() => undefined);
    };
  }, [projectRoot, terminalId]);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        terminalRef.current?.focus();
      });
    }
  }, [active]);

  return (
    <div
      className="terminal-container"
      ref={containerRef}
      onMouseDown={() => terminalRef.current?.focus()}
    />
  );
}

function FileEditor({
  projectRoot,
  tabId,
  relativePath,
  onDirtyChange,
  onError,
  onNotice,
  onSaved
}: {
  projectRoot: string;
  tabId: string;
  relativePath: string;
  onDirtyChange: (dirty: boolean) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<ReadProjectFileResult | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const editorExtensions = useMemo(() => getEditorExtensions(relativePath), [relativePath]);
  const dirty = file ? content !== file.content : false;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty]);

  useEffect(() => {
    loadFile().catch((err) => onError(toErrorMessage(err)));
  }, [projectRoot, relativePath, tabId]);

  async function loadFile() {
    setLoading(true);

    try {
      const nextFile = await api.readProjectFile({ projectRoot, relativePath });
      setFile(nextFile);
      setContent(nextFile.content);
      onDirtyChange(false);
    } finally {
      setLoading(false);
    }
  }

  async function saveFile() {
    if (!file) {
      return;
    }

    setSaving(true);

    try {
      const result = await api.writeProjectFile({
        projectRoot,
        relativePath,
        content,
        expectedMtimeMs: file.mtimeMs
      });
      setFile({
        ...file,
        content,
        mtimeMs: result.mtimeMs,
        size: result.size
      });
      onDirtyChange(false);
      onSaved();
      onNotice(t("已保存：{path}", { path: relativePath }));
    } catch (err) {
      onError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function formatFile() {
    const parser = getPrettierParser(relativePath);

    if (!parser) {
      onError(t("当前文件类型暂不支持格式化"));
      return;
    }

    setFormatting(true);

    try {
      setContent(await formatCode(content, parser));
      onNotice(t("已格式化：{path}", { path: relativePath }));
    } catch (err) {
      onError(t("格式化失败：{message}", { message: toErrorMessage(err) }));
    } finally {
      setFormatting(false);
    }
  }

  return (
    <div className="file-editor">
      <div className="file-editor-toolbar">
        <div>
          <strong>{relativePath}</strong>
          {file ? <span>{formatFileSize(file.size)}</span> : null}
        </div>
        <div className="toolbar-group">
          <button className="secondary-button compact" onClick={formatFile} disabled={loading || formatting}>
            {formatting ? <Loader2 className="spin" size={14} /> : <Wand2 size={14} />}
            {t("格式化")}
          </button>
          <button className="secondary-button compact" onClick={() => loadFile().catch((err) => onError(toErrorMessage(err)))} disabled={loading}>
            {loading ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
            {t("重新加载")}
          </button>
          <button className="primary-button compact" onClick={saveFile} disabled={!dirty || saving || loading}>
            {saving ? <Loader2 className="spin" size={14} /> : <Save size={14} />}
            {t("保存")}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="empty-state">{t("正在读取文件")}</div>
      ) : (
        <CodeMirror
          className="code-editor"
          value={content}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true
          }}
          extensions={editorExtensions}
          height="100%"
          onChange={(value) => setContent(value)}
        />
      )}
    </div>
  );
}

function getEditorExtensions(relativePath: string): Extension[] {
  const ext = getFileExtension(relativePath);
  const extensions: Extension[] = [
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "13px"
      },
      ".cm-scroller": {
        fontFamily: "SFMono-Regular, Menlo, Consolas, monospace"
      }
    })
  ];

  if (ext === ".json" || relativePath.endsWith(".jsonc")) {
    return [...extensions, json()];
  }

  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    return [...extensions, javascript({ jsx: ext === ".jsx" })];
  }

  if ([".ts", ".tsx"].includes(ext)) {
    return [...extensions, javascript({ jsx: ext === ".tsx", typescript: true })];
  }

  if ([".html", ".htm"].includes(ext)) {
    return [...extensions, html()];
  }

  if ([".css", ".scss", ".less"].includes(ext)) {
    return [...extensions, css()];
  }

  if ([".md", ".markdown"].includes(ext)) {
    return [...extensions, markdown()];
  }

  return extensions;
}

function getPrettierParser(relativePath: string): PrettierParser | null {
  const ext = getFileExtension(relativePath);

  if (ext === ".json" || relativePath.endsWith(".jsonc")) {
    return "json";
  }

  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    return "babel";
  }

  if ([".ts", ".tsx"].includes(ext)) {
    return "typescript";
  }

  if ([".html", ".htm"].includes(ext)) {
    return "html";
  }

  if ([".css", ".scss", ".less"].includes(ext)) {
    return "css";
  }

  if ([".md", ".markdown"].includes(ext)) {
    return "markdown";
  }

  return null;
}

async function formatCode(content: string, parser: PrettierParser): Promise<string> {
  const prettier = await import("prettier/standalone");
  const [
    babelPlugin,
    estreePlugin,
    typescriptPlugin,
    htmlPlugin,
    postcssPlugin,
    markdownPlugin
  ] = await Promise.all([
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
    import("prettier/plugins/typescript"),
    import("prettier/plugins/html"),
    import("prettier/plugins/postcss"),
    import("prettier/plugins/markdown")
  ]);

  return prettier.format(content, {
    parser,
    plugins: [
      babelPlugin.default,
      estreePlugin.default,
      typescriptPlugin.default,
      htmlPlugin.default,
      postcssPlugin.default,
      markdownPlugin.default
    ],
    printWidth: 100,
    tabWidth: 2,
    semi: true,
    singleQuote: false
  });
}

function getFileExtension(relativePath: string): string {
  const fileName = relativePath.split("/").at(-1) || relativePath;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function makeTabId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
