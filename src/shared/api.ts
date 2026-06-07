import type {
  AiStreamEvent,
  AppSettings,
  CloseCodeTerminalInput,
  CodeTerminalDataEvent,
  CodeTerminalExitEvent,
  CreateDocumentInput,
  CreateDocumentResult,
  CreateCodeTerminalInput,
  CreateProjectInput,
  ExportProjectInput,
  ExportProjectResult,
  GeneratePageBackgroundInput,
  GenerateSliceAssetsInput,
  GeneratePageImageInput,
  GenerateSliceAssetInput,
  IdentifySliceSelectionsInput,
  ListProjectFilesInput,
  ListPageImageVersionsInput,
  PageImageVersion,
  ProjectFileNode,
  ProjectIndexEntry,
  ProjectInfo,
  ReadAssetInput,
  ReadDocumentInput,
  ReadProjectFileInput,
  ReadProjectFileResult,
  ReferenceImageMeta,
  ReviseDocumentInput,
  ReviseDocumentResult,
  RunPlanningInput,
  SaveReferenceImageInput,
  SaveSliceSelectionsInput,
  SetActivePageImageVersionInput,
  SyncPagePlanInput,
  VectorizeSliceAssetInput,
  VectorizeSliceSelectionInput,
  ResizeCodeTerminalInput,
  WriteCodeTerminalInput,
  WriteProjectFileInput,
  WriteProjectFileResult
} from "./types";

export interface ElectronApi {
  listProjects: () => Promise<ProjectIndexEntry[]>;
  selectProjectDirectory: () => Promise<string | null>;
  selectExistingProjectDirectory: () => Promise<string | null>;
  createProject: (input: CreateProjectInput) => Promise<ProjectInfo>;
  openProject: (rootDir: string) => Promise<ProjectInfo>;
  runPlanning: (input: RunPlanningInput) => Promise<ProjectInfo>;
  createDocument: (input: CreateDocumentInput) => Promise<CreateDocumentResult>;
  reviseDocument: (input: ReviseDocumentInput) => Promise<ReviseDocumentResult>;
  syncPagePlan: (input: SyncPagePlanInput) => Promise<ProjectInfo>;
  generatePageImage: (input: GeneratePageImageInput) => Promise<ProjectInfo>;
  generatePageBackground: (input: GeneratePageBackgroundInput) => Promise<ProjectInfo>;
  identifySliceSelections: (input: IdentifySliceSelectionsInput) => Promise<ProjectInfo>;
  generateSliceAsset: (input: GenerateSliceAssetInput) => Promise<ProjectInfo>;
  saveSliceSelections: (input: SaveSliceSelectionsInput) => Promise<ProjectInfo>;
  generateSliceAssets: (input: GenerateSliceAssetsInput) => Promise<ProjectInfo>;
  vectorizeSliceAsset: (input: VectorizeSliceAssetInput) => Promise<ProjectInfo>;
  vectorizeSliceSelection: (input: VectorizeSliceSelectionInput) => Promise<ProjectInfo>;
  listPageImageVersions: (input: ListPageImageVersionsInput) => Promise<PageImageVersion[]>;
  setActivePageImageVersion: (input: SetActivePageImageVersionInput) => Promise<ProjectInfo>;
  exportProjectZip: (input: ExportProjectInput) => Promise<ExportProjectResult>;
  saveReferenceImage: (input: SaveReferenceImageInput) => Promise<ReferenceImageMeta>;
  readAssetAsDataUrl: (input: ReadAssetInput) => Promise<string>;
  readDocument: (input: ReadDocumentInput) => Promise<string>;
  listProjectFiles: (input: ListProjectFilesInput) => Promise<ProjectFileNode[]>;
  readProjectFile: (input: ReadProjectFileInput) => Promise<ReadProjectFileResult>;
  writeProjectFile: (input: WriteProjectFileInput) => Promise<WriteProjectFileResult>;
  createCodeTerminal: (input: CreateCodeTerminalInput) => Promise<void>;
  writeCodeTerminal: (input: WriteCodeTerminalInput) => Promise<void>;
  resizeCodeTerminal: (input: ResizeCodeTerminalInput) => Promise<void>;
  closeCodeTerminal: (input: CloseCodeTerminalInput) => Promise<void>;
  onCodeTerminalData: (listener: (event: CodeTerminalDataEvent) => void) => () => void;
  onCodeTerminalExit: (listener: (event: CodeTerminalExitEvent) => void) => () => void;
  cancelTask: (taskId: string) => Promise<boolean>;
  onAiStreamEvent: (listener: (event: AiStreamEvent) => void) => () => void;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
}
