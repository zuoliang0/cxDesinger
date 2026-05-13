import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "en" | "zh-CN" | "de";

type TranslationValues = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (source: string, values?: TranslationValues) => string;
}

const STORAGE_KEY = "cxdesinger.locale";

const EN: Record<string, string> = {
  "产品规划": "Product Planning",
  "页面管理": "Page Management",
  "代码编写": "Code",
  "导出项目": "Export Project",
  "返回项目列表": "Back to Projects",
  "关闭项目": "Close Project",
  "关闭项目并返回主页": "Close project and return home",
  "设置": "Settings",
  "关闭": "Close",
  "正在打开项目": "Opening project",
  "正在导出项目": "Exporting project",
  "已导出：{path}": "Exported: {path}",
  "项目": "Projects",
  "{count} 个项目": "{count} project(s)",
  "打开项目": "Open Project",
  "新建项目": "New Project",
  "暂无项目": "No projects",
  "正在创建项目": "Creating project",
  "项目名称": "Project name",
  "项目根目录": "Project root",
  "选择目录": "Choose directory",
  "项目类型": "Project type",
  "取消": "Cancel",
  "确定": "Confirm",
  "文档": "Documents",
  "暂无文档": "No documents",
  "新增文档": "New Document",
  "新建文档": "Create Document",
  "描述新文档需求，AI 会参考已有文档生成": "Describe the new document. AI will reference existing documents.",
  "描述要新增的文档内容": "Describe the document to add",
  "讨论": "Discuss",
  "编辑": "Edit",
  "保存文档": "Save Document",
  "保存中": "Saving",
  "当前文档有未保存修改，确认离开吗？": "The current document has unsaved changes. Leave anyway?",
  "同步到 pages.json": "Sync to pages.json",
  "描述对当前文档的修改意见": "Describe changes for the current document",
  "描述要创建的产品和规划任务": "Describe the product and planning task",
  "参考图片": "Reference Images",
  "选择图片": "Choose Images",
  "也可以直接粘贴图片": "You can also paste images directly",
  "移除参考图片": "Remove reference image",
  "模型": "Model",
  "选择模型": "Choose model",
  "高思考": "High reasoning",
  "处理中": "Processing",
  "发送": "Send",
  "停止": "Stop",
  "任务结束，耗时 {time}": "Task finished in {time}",
  "当前任务": "Current task",
  "修改当前文档：{path}": "Revise current document: {path}",
  "同步页面规划到 pages.json": "Sync page plan to pages.json",
  "正在处理后台任务": "Background task running",
  "任务完成，点击清除": "Task complete. Click to clear.",
  "任务失败": "Task failed",
  "页面": "Pages",
  "暂无页面": "No pages",
  "页面规划已更新，可以重新生成界面": "Page plan updated. You can regenerate this UI.",
  "版本": "Version",
  "选择页面图片版本": "Choose page image version",
  "暂无版本": "No versions",
  "放大": "Zoom In",
  "缩小": "Zoom Out",
  "重置视图": "Reset View",
  "切图": "Slice",
  "批注": "Annotate",
  "提取背景": "Extract Background",
  "重提背景": "Re-extract Background",
  "提取当前页面背景并写入 pages.json": "Extract the current page background and write it to pages.json",
  "查看背景": "View Background",
  "让 AI 自动识别当前界面中适合切图的组件区域": "Ask AI to identify UI regions suitable for slicing",
  "AI识别切图": "AI Identify Slices",
  "生成切图": "Generate Slices",
  "切图生成模式": "Slice generation mode",
  "仅未生成": "Pending only",
  "强制重新切图": "Force regenerate",
  "返回页面": "Back to Page",
  "暂无界面图片": "No UI image",
  "暂无切图区域": "No slice regions",
  "已选 {count}": "{count} selected",
  "全选": "Select All",
  "清空": "Clear",
  "选择 {name}": "Select {name}",
  "切图名称": "Slice name",
  "查看切图素材": "View slice asset",
  "素材生成后可查看": "Available after generation",
  "查看": "View",
  "删除切图区域": "Delete slice region",
  "素材描述": "Asset Description",
  "生成素材后由 Codex 根据参考图和框选位置自动填写": "Codex will fill this after generating the asset from the reference image and selected region.",
  "输入界面风格": "Describe the UI style",
  "生成图片": "Generate Image",
  "切图区域：{label}": "Slice region: {label}",
  "本次单独切图备注，例如：补上左侧阴影、不要包含背景、多切了右侧按钮...": "Optional note for this slice, e.g. add the left shadow, exclude the background, remove the extra right button...",
  "单独切图": "Generate This Slice",
  "删除区域": "Delete Region",
  "删除 {label}？": "Delete {label}?",
  "删除": "Delete",
  "设置已保存": "Settings saved",
  "Codex 命令": "Codex command",
  "Codex 参数": "Codex arguments",
  "Codex 超时分钟数": "Codex timeout in minutes",
  "保存": "Save",
  "加载中": "Loading",
  "已生成": "Generated",
  "失败": "Failed",
  "待生成": "Pending",
  "状态": "Status",
  "输出": "Output",
  "日志": "Log",
  "完成": "Complete",
  "错误": "Error",
  "页面背景": "Page Background",
  "切图素材": "Slice Asset",
  "正在生成当前页面图片": "Generating current page image",
  "界面图片已生成": "UI image generated",
  "正在提取页面背景": "Extracting page background",
  "页面背景已提取并写入 pages.json": "Page background extracted and written to pages.json",
  "正在强制重新生成切图素材": "Force-regenerating slice assets",
  "正在生成切图素材": "Generating slice assets",
  "切图已强制重新生成": "Slices force-regenerated",
  "切图生成已完成": "Slice generation complete",
  "正在识别切图区域": "Identifying slice regions",
  "切图区域已识别，可确认后生成全部切图": "Slice regions identified. Review them before generating slices.",
  "正在单独生成切图素材": "Generating selected slice asset",
  "单独切图已完成": "Selected slice generated",
  "已请求停止当前页面的 Codex 调用": "Requested to stop the current page Codex call",
  "全部区域": "All regions",
  "{target}，本次 {count} 个": "{target}, {count} this run",
  "{name}，右键删除": "{name}, right-click to delete",
  "批注 {index}": "Annotation {index}",
  "添加批注...": "Add annotation...",
  "添加": "Add",
  "正在读取文件": "Reading file",
  "项目文件": "Project Files",
  "刷新文件树": "Refresh file tree",
  "暂无文件": "No files",
  "复制标签": "Duplicate Tab",
  "不可编辑的文件": "Non-editable file",
  "当前文件不是可编辑文本文件": "The current file is not editable text.",
  "{title} 副本": "{title} Copy",
  "当前文件有未保存修改，确认关闭吗？": "This file has unsaved changes. Close it anyway?",
  "Codex 终端已退出：{code}": "Codex terminal exited: {code}",
  "已保存：{path}": "Saved: {path}",
  "当前文件类型暂不支持格式化": "Formatting is not supported for this file type.",
  "已格式化：{path}": "Formatted: {path}",
  "格式化失败：{message}": "Format failed: {message}",
  "格式化": "Format",
  "重新加载": "Reload",
  "暂无内容": "No content",
  "添加备注：第 {line} 行": "Add comment: line {line}",
  "添加评论...": "Add comment...",
  "确认备注": "Confirm comment",
  "取消备注": "Cancel comment",
  "针对 {documentPath} 第 {line} 行的备注：\n{comment}": "Comment for {documentPath}, line {line}:\n{comment}",
  "针对参考图片 {path} 的批注：": "Annotation for reference image {path}:",
  "批注 ID：{id}": "Annotation ID: {id}",
  "区域：x={x}, y={y}, width={width}, height={height}": "Region: x={x}, y={y}, width={width}, height={height}"
};

const DE: Record<string, string> = {
  "产品规划": "Produktplanung",
  "页面管理": "Seitenverwaltung",
  "代码编写": "Code",
  "导出项目": "Projekt exportieren",
  "返回项目列表": "Zurück zu Projekten",
  "关闭项目": "Projekt schließen",
  "关闭项目并返回主页": "Projekt schließen und zur Startseite zurückkehren",
  "设置": "Einstellungen",
  "关闭": "Schließen",
  "正在打开项目": "Projekt wird geöffnet",
  "正在导出项目": "Projekt wird exportiert",
  "已导出：{path}": "Exportiert: {path}",
  "项目": "Projekte",
  "{count} 个项目": "{count} Projekt(e)",
  "打开项目": "Projekt öffnen",
  "新建项目": "Neues Projekt",
  "暂无项目": "Keine Projekte",
  "正在创建项目": "Projekt wird erstellt",
  "项目名称": "Projektname",
  "项目根目录": "Projektstammordner",
  "选择目录": "Ordner auswählen",
  "项目类型": "Projekttyp",
  "取消": "Abbrechen",
  "确定": "Bestätigen",
  "文档": "Dokumente",
  "暂无文档": "Keine Dokumente",
  "新增文档": "Neues Dokument",
  "新建文档": "Dokument erstellen",
  "描述新文档需求，AI 会参考已有文档生成": "Beschreiben Sie das neue Dokument. Die KI nutzt vorhandene Dokumente als Referenz.",
  "描述要新增的文档内容": "Zu erstellendes Dokument beschreiben",
  "讨论": "Diskussion",
  "编辑": "Bearbeiten",
  "保存文档": "Dokument speichern",
  "保存中": "Speichern",
  "当前文档有未保存修改，确认离开吗？": "Das aktuelle Dokument hat ungespeicherte Änderungen. Trotzdem verlassen?",
  "同步到 pages.json": "Mit pages.json synchronisieren",
  "描述对当前文档的修改意见": "Änderungen am aktuellen Dokument beschreiben",
  "描述要创建的产品和规划任务": "Produkt und Planungsaufgabe beschreiben",
  "参考图片": "Referenzbilder",
  "选择图片": "Bilder auswählen",
  "也可以直接粘贴图片": "Bilder können auch direkt eingefügt werden",
  "移除参考图片": "Referenzbild entfernen",
  "模型": "Modell",
  "选择模型": "Modell auswählen",
  "高思考": "Hohe Denkintensität",
  "处理中": "In Bearbeitung",
  "发送": "Senden",
  "停止": "Stopp",
  "任务结束，耗时 {time}": "Aufgabe beendet, Dauer {time}",
  "当前任务": "Aktuelle Aufgabe",
  "修改当前文档：{path}": "Aktuelles Dokument überarbeiten: {path}",
  "同步页面规划到 pages.json": "Seitenplan mit pages.json synchronisieren",
  "正在处理后台任务": "Hintergrundaufgabe läuft",
  "任务完成，点击清除": "Aufgabe abgeschlossen. Zum Ausblenden klicken.",
  "任务失败": "Aufgabe fehlgeschlagen",
  "页面": "Seiten",
  "暂无页面": "Keine Seiten",
  "页面规划已更新，可以重新生成界面": "Seitenplan aktualisiert. Die UI kann neu generiert werden.",
  "版本": "Version",
  "选择页面图片版本": "Seitenbildversion auswählen",
  "暂无版本": "Keine Versionen",
  "放大": "Vergrößern",
  "缩小": "Verkleinern",
  "重置视图": "Ansicht zurücksetzen",
  "切图": "Slicing",
  "批注": "Kommentieren",
  "提取背景": "Hintergrund extrahieren",
  "重提背景": "Hintergrund erneut extrahieren",
  "提取当前页面背景并写入 pages.json": "Aktuellen Seitenhintergrund extrahieren und in pages.json schreiben",
  "查看背景": "Hintergrund anzeigen",
  "让 AI 自动识别当前界面中适合切图的组件区域": "KI geeignete UI-Bereiche für Slicing erkennen lassen",
  "AI识别切图": "KI-Slices erkennen",
  "生成切图": "Slices generieren",
  "切图生成模式": "Slice-Generierungsmodus",
  "仅未生成": "Nur ausstehende",
  "强制重新切图": "Erneut generieren",
  "返回页面": "Zurück zur Seite",
  "暂无界面图片": "Kein UI-Bild",
  "暂无切图区域": "Keine Slice-Bereiche",
  "已选 {count}": "{count} ausgewählt",
  "全选": "Alle auswählen",
  "清空": "Leeren",
  "选择 {name}": "{name} auswählen",
  "切图名称": "Slice-Name",
  "查看切图素材": "Slice-Asset anzeigen",
  "素材生成后可查看": "Nach Generierung verfügbar",
  "查看": "Anzeigen",
  "删除切图区域": "Slice-Bereich löschen",
  "素材描述": "Asset-Beschreibung",
  "生成素材后由 Codex 根据参考图和框选位置自动填写": "Codex füllt dies nach der Asset-Generierung anhand von Referenzbild und Auswahlbereich aus.",
  "输入界面风格": "UI-Stil beschreiben",
  "生成图片": "Bild generieren",
  "切图区域：{label}": "Slice-Bereich: {label}",
  "本次单独切图备注，例如：补上左侧阴影、不要包含背景、多切了右侧按钮...": "Optionale Notiz für diesen Slice, z. B. linken Schatten ergänzen, Hintergrund ausschließen, zusätzlichen rechten Button entfernen...",
  "单独切图": "Diesen Slice generieren",
  "删除区域": "Bereich löschen",
  "删除 {label}？": "{label} löschen?",
  "删除": "Löschen",
  "设置已保存": "Einstellungen gespeichert",
  "Codex 命令": "Codex-Befehl",
  "Codex 参数": "Codex-Argumente",
  "Codex 超时分钟数": "Codex-Timeout in Minuten",
  "保存": "Speichern",
  "加载中": "Wird geladen",
  "已生成": "Generiert",
  "失败": "Fehlgeschlagen",
  "待生成": "Ausstehend",
  "状态": "Status",
  "输出": "Ausgabe",
  "日志": "Log",
  "完成": "Abgeschlossen",
  "错误": "Fehler",
  "页面背景": "Seitenhintergrund",
  "切图素材": "Slice-Asset",
  "正在生成当前页面图片": "Aktuelles Seitenbild wird generiert",
  "界面图片已生成": "UI-Bild generiert",
  "正在提取页面背景": "Seitenhintergrund wird extrahiert",
  "页面背景已提取并写入 pages.json": "Seitenhintergrund extrahiert und in pages.json geschrieben",
  "正在强制重新生成切图素材": "Slice-Assets werden erzwungen neu generiert",
  "正在生成切图素材": "Slice-Assets werden generiert",
  "切图已强制重新生成": "Slices wurden neu generiert",
  "切图生成已完成": "Slice-Generierung abgeschlossen",
  "正在识别切图区域": "Slice-Bereiche werden erkannt",
  "切图区域已识别，可确认后生成全部切图": "Slice-Bereiche erkannt. Bitte prüfen und dann alle Slices generieren.",
  "正在单独生成切图素材": "Ausgewähltes Slice-Asset wird generiert",
  "单独切图已完成": "Ausgewählter Slice generiert",
  "已请求停止当前页面的 Codex 调用": "Stopp der aktuellen Codex-Aufgabe für diese Seite angefordert",
  "全部区域": "Alle Bereiche",
  "{target}，本次 {count} 个": "{target}, {count} in diesem Lauf",
  "{name}，右键删除": "{name}, Rechtsklick zum Löschen",
  "批注 {index}": "Kommentar {index}",
  "添加批注...": "Kommentar hinzufügen...",
  "添加": "Hinzufügen",
  "正在读取文件": "Datei wird gelesen",
  "项目文件": "Projektdateien",
  "刷新文件树": "Dateibaum aktualisieren",
  "暂无文件": "Keine Dateien",
  "复制标签": "Tab duplizieren",
  "不可编辑的文件": "Nicht editierbare Datei",
  "当前文件不是可编辑文本文件": "Die aktuelle Datei ist keine editierbare Textdatei.",
  "{title} 副本": "{title} Kopie",
  "当前文件有未保存修改，确认关闭吗？": "Diese Datei hat ungespeicherte Änderungen. Trotzdem schließen?",
  "Codex 终端已退出：{code}": "Codex-Terminal beendet: {code}",
  "已保存：{path}": "Gespeichert: {path}",
  "当前文件类型暂不支持格式化": "Formatierung wird für diesen Dateityp noch nicht unterstützt.",
  "已格式化：{path}": "Formatiert: {path}",
  "格式化失败：{message}": "Formatierung fehlgeschlagen: {message}",
  "格式化": "Formatieren",
  "重新加载": "Neu laden",
  "暂无内容": "Kein Inhalt",
  "添加备注：第 {line} 行": "Kommentar hinzufügen: Zeile {line}",
  "添加评论...": "Kommentar hinzufügen...",
  "确认备注": "Kommentar bestätigen",
  "取消备注": "Kommentar abbrechen",
  "针对 {documentPath} 第 {line} 行的备注：\n{comment}": "Kommentar zu {documentPath}, Zeile {line}:\n{comment}",
  "针对参考图片 {path} 的批注：": "Kommentar zum Referenzbild {path}:",
  "批注 ID：{id}": "Kommentar-ID: {id}",
  "区域：x={x}, y={y}, width={width}, height={height}": "Bereich: x={x}, y={y}, width={width}, height={height}"
};

const TRANSLATIONS: Record<Exclude<Locale, "zh-CN">, Record<string, string>> = {
  en: EN,
  de: DE
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = getStoredLocale();
    return saved || "en";
  });

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale);
    setStoredLocale(nextLocale);
  }

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (source, values) => interpolate(locale === "zh-CN" ? source : TRANSLATIONS[locale][source] || source, values)
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return value;
}

function getStoredLocale(): Locale | null {
  try {
    const storage = window.localStorage;
    if (typeof storage?.getItem !== "function") {
      return null;
    }

    const saved = storage.getItem(STORAGE_KEY);
    return saved === "zh-CN" || saved === "en" || saved === "de" ? saved : null;
  } catch {
    return null;
  }
}

function setStoredLocale(locale: Locale) {
  try {
    const storage = window.localStorage;
    if (typeof storage?.setItem === "function") {
      storage.setItem(STORAGE_KEY, locale);
    }
  } catch {
    // Ignore storage errors; the current session still switches language.
  }
}

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) {
    return template;
  }

  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    template
  );
}
