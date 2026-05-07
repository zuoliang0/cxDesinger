import type { ElectronApi } from "../shared/api";

declare global {
  interface Window {
    aiProductDesigner: ElectronApi;
  }
}

export {};
