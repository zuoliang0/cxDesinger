export interface ProjectIndexEntry {
  id: string;
  name: string;
  rootDir: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInfo {
  rootDir: string;
  meta: PagesJson;
}

export type ProjectType = "web" | "app";

export interface ProjectMeta {
  id: string;
  name: string;
  type?: ProjectType;
  createdAt: string;
  updatedAt: string;
}

export type DocumentType =
  | "chat-history"
  | "prd"
  | "feature-plan"
  | "technical-plan"
  | "style-guide"
  | "animation-list"
  | "page-plan"
  | "feature-list"
  | "custom";

export interface DocumentMeta {
  type: DocumentType;
  title: string;
  path: string;
  updatedAt: string;
}

export interface PageMeta {
  id: string;
  name: string;
  route: string;
  description: string;
  uiPrompt: string;
  imagePath?: string;
  backgroundImagePath?: string;
  needUpdate?: boolean;
  assetIds: string[];
  dataDir?: string;
  updatedAt?: string;
}

export interface PageIndexMeta {
  id: string;
  name: string;
  route: string;
  description: string;
  dataDir: string;
  updatedAt: string;
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AssetMeta {
  id: string;
  pageId: string;
  type: "slice";
  name: string;
  path: string;
  sourceImagePath: string;
  selection: SelectionRect;
  selectionId?: string;
  prompt: string;
  createdAt: string;
}

export type SliceSelectionStatus = "pending" | "generated" | "failed";

export interface SliceSelectionMeta {
  id: string;
  pageId: string;
  name: string;
  sourceImagePath: string;
  selection: SelectionRect;
  prompt: string;
  status: SliceSelectionStatus;
  assetId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PagesJson {
  schemaVersion: 1 | 2;
  project: ProjectMeta;
  documents: DocumentMeta[];
  pages: PageMeta[];
  assets: AssetMeta[];
  sliceSelections?: SliceSelectionMeta[];
}

export interface PagesIndexJson {
  schemaVersion: 2;
  project: ProjectMeta;
  documents: DocumentMeta[];
  pages: PageIndexMeta[];
}

export interface PlanningPageOutput {
  name: string;
  route: string;
  description: string;
  uiPrompt: string;
}

export interface PlanningOutput {
  conversationMarkdown: string;
  documents: {
    prd: string;
    featurePlan: string;
    technicalPlan: string;
    styleGuide: string;
    animationList?: string;
    pagePlan: string;
    featureList: string;
  };
  pages: PlanningPageOutput[];
}

export interface DocumentRevisionOutput {
  content: string;
  summary: string;
}

export interface DocumentCreationOutput {
  title: string;
  fileName: string;
  content: string;
  summary: string;
}

export interface PagePlanSyncOutput {
  pages: PlanningPageOutput[];
  summary: string;
}

export type AiStreamScope = "planning" | "document" | "page-plan" | "image";

export type AiStreamLevel = "status" | "stdout" | "stderr" | "complete" | "error";

export type CodexModel = "gpt-5.5" | "gpt-5.4";

export type CodexReasoningEffort = "high";

export interface AiStreamEvent {
  taskId: string;
  scope: AiStreamScope;
  level: AiStreamLevel;
  message: string;
  createdAt: string;
}

export interface AppSettings {
  codex: {
    command: string;
    args: string[];
    timeoutMs: number;
  };
}

export interface CreateProjectInput {
  name: string;
  rootDir: string;
  type?: ProjectType;
}

export interface RunPlanningInput {
  projectRoot: string;
  requirement: string;
  referenceImagePaths?: string[];
  taskId?: string;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
}

export interface ReviseDocumentInput {
  projectRoot: string;
  documentPath: string;
  instruction: string;
  referenceImagePaths?: string[];
  taskId?: string;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
}

export interface CreateDocumentInput {
  projectRoot: string;
  instruction: string;
  referenceImagePaths?: string[];
  taskId?: string;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
}

export interface ReviseDocumentResult {
  project: ProjectInfo;
  documentPath: string;
  content: string;
  summary: string;
}

export interface CreateDocumentResult {
  project: ProjectInfo;
  documentPath: string;
  content: string;
  summary: string;
}

export interface SyncPagePlanInput {
  projectRoot: string;
  pagePlanPath: string;
  taskId?: string;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
}

export interface GeneratePageImageInput {
  projectRoot: string;
  pageId: string;
  prompt: string;
  annotations?: PageImageAnnotation[];
  referenceImagePaths?: string[];
  taskId?: string;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
}

export interface ReferenceImageMeta {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  createdAt: string;
}

export interface SaveReferenceImageInput {
  projectRoot: string;
  name?: string;
  mimeType: string;
  dataUrl: string;
}

export interface GeneratePageBackgroundInput {
  projectRoot: string;
  pageId: string;
  taskId?: string;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
}

export interface IdentifySliceSelectionsInput {
  projectRoot: string;
  pageId: string;
  taskId?: string;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
}

export interface PageImageAnnotation {
  id: string;
  pageId: string;
  sourceImagePath: string;
  selection: SelectionRect;
  note: string;
  createdAt: string;
}

export interface GenerateSliceAssetInput {
  projectRoot: string;
  pageId: string;
  sourceImagePath: string;
  selection: SelectionRect;
  prompt: string;
  taskId?: string;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
}

export interface SaveSliceSelectionsInput {
  projectRoot: string;
  pageId: string;
  selections: SliceSelectionMeta[];
}

export interface GenerateSliceAssetsInput {
  projectRoot: string;
  pageId: string;
  selectionIds: string[];
  prompt?: string;
  force?: boolean;
  replaceExisting?: boolean;
  taskId?: string;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
}

export interface ListPageImageVersionsInput {
  projectRoot: string;
  pageId: string;
}

export interface SetActivePageImageVersionInput {
  projectRoot: string;
  pageId: string;
  imagePath: string;
}

export interface PageImageVersion {
  version: string;
  path: string;
  createdAt: string;
  active: boolean;
}

export interface ExportProjectInput {
  projectRoot: string;
}

export interface ReadAssetInput {
  projectRoot: string;
  relativePath: string;
}

export interface ReadDocumentInput {
  projectRoot: string;
  relativePath: string;
}

export interface ExportProjectResult {
  zipPath: string;
}

export interface ProjectFileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  editable?: boolean;
  size?: number;
  mtimeMs?: number;
  children?: ProjectFileNode[];
}

export interface ListProjectFilesInput {
  projectRoot: string;
}

export interface ReadProjectFileInput {
  projectRoot: string;
  relativePath: string;
}

export interface ReadProjectFileResult {
  path: string;
  content: string;
  mtimeMs: number;
  size: number;
}

export interface WriteProjectFileInput {
  projectRoot: string;
  relativePath: string;
  content: string;
  expectedMtimeMs?: number;
}

export interface WriteProjectFileResult {
  path: string;
  mtimeMs: number;
  size: number;
}

export interface CreateCodeTerminalInput {
  projectRoot: string;
  terminalId: string;
  cols?: number;
  rows?: number;
}

export interface WriteCodeTerminalInput {
  terminalId: string;
  data: string;
}

export interface ResizeCodeTerminalInput {
  terminalId: string;
  cols: number;
  rows: number;
}

export interface CloseCodeTerminalInput {
  terminalId: string;
}

export interface CodeTerminalDataEvent {
  terminalId: string;
  data: string;
}

export interface CodeTerminalExitEvent {
  terminalId: string;
  exitCode?: number;
  signal?: number;
}
