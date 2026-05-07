import type {
  AiStreamEvent,
  AppSettings,
  CreateProjectInput,
  ExportProjectInput,
  ExportProjectResult,
  GeneratePageBackgroundInput,
  GenerateSliceAssetsInput,
  GeneratePageImageInput,
  GenerateSliceAssetInput,
  IdentifySliceSelectionsInput,
  ListPageImageVersionsInput,
  PageImageVersion,
  ProjectIndexEntry,
  ProjectInfo,
  ReadAssetInput,
  ReadDocumentInput,
  ReviseDocumentInput,
  ReviseDocumentResult,
  RunPlanningInput,
  SaveSliceSelectionsInput,
  SetActivePageImageVersionInput,
  SyncPagePlanInput
} from "./types";

export interface ElectronApi {
  listProjects: () => Promise<ProjectIndexEntry[]>;
  selectProjectDirectory: () => Promise<string | null>;
  createProject: (input: CreateProjectInput) => Promise<ProjectInfo>;
  openProject: (rootDir: string) => Promise<ProjectInfo>;
  runPlanning: (input: RunPlanningInput) => Promise<ProjectInfo>;
  reviseDocument: (input: ReviseDocumentInput) => Promise<ReviseDocumentResult>;
  syncPagePlan: (input: SyncPagePlanInput) => Promise<ProjectInfo>;
  generatePageImage: (input: GeneratePageImageInput) => Promise<ProjectInfo>;
  generatePageBackground: (input: GeneratePageBackgroundInput) => Promise<ProjectInfo>;
  identifySliceSelections: (input: IdentifySliceSelectionsInput) => Promise<ProjectInfo>;
  generateSliceAsset: (input: GenerateSliceAssetInput) => Promise<ProjectInfo>;
  saveSliceSelections: (input: SaveSliceSelectionsInput) => Promise<ProjectInfo>;
  generateSliceAssets: (input: GenerateSliceAssetsInput) => Promise<ProjectInfo>;
  listPageImageVersions: (input: ListPageImageVersionsInput) => Promise<PageImageVersion[]>;
  setActivePageImageVersion: (input: SetActivePageImageVersionInput) => Promise<ProjectInfo>;
  exportProjectZip: (input: ExportProjectInput) => Promise<ExportProjectResult>;
  readAssetAsDataUrl: (input: ReadAssetInput) => Promise<string>;
  readDocument: (input: ReadDocumentInput) => Promise<string>;
  cancelTask: (taskId: string) => Promise<boolean>;
  onAiStreamEvent: (listener: (event: AiStreamEvent) => void) => () => void;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
}
