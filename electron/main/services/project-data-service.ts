import fs from "node:fs/promises";
import path from "node:path";
import type {
  AssetMeta,
  PageMeta,
  PagesIndexJson,
  PagesJson,
  ProjectInfo,
  SliceSelectionMeta
} from "../../../src/shared/types";
import {
  assetMetaSchema,
  legacyPagesJsonDiskSchema,
  pageDataJsonSchema,
  pagesIndexJsonSchema,
  pagesJsonSchema,
  sliceSelectionMetaSchema
} from "../../../src/shared/validation";
import { pathExists } from "../utils/fs";

const PAGES_JSON_NAME = "pages.json";
const LEGACY_BACKUP_NAME = "pages.v1.backup.json";

export class ProjectDataService {
  async readProject(projectRoot: string): Promise<ProjectInfo> {
    const rootDir = path.resolve(projectRoot);
    const meta = await this.readProjectMeta(rootDir);

    return { rootDir, meta };
  }

  async readProjectMeta(projectRoot: string): Promise<PagesJson> {
    const rootDir = path.resolve(projectRoot);
    const filePath = path.join(rootDir, PAGES_JSON_NAME);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { schemaVersion?: number };

    if (parsed.schemaVersion === 2) {
      return this.readSplitProjectMeta(rootDir, parsed);
    }

    return pagesJsonSchema.parse(legacyPagesJsonDiskSchema.parse(parsed)) as PagesJson;
  }

  async writeProjectMeta(projectRoot: string, meta: PagesJson): Promise<void> {
    const rootDir = path.resolve(projectRoot);
    const normalized = pagesJsonSchema.parse({
      ...meta,
      schemaVersion: 2
    }) as PagesJson;

    await this.backupLegacyPagesJson(rootDir);
    await this.writeSplitProjectMeta(rootDir, normalized);
  }

  async readPage(projectRoot: string, pageId: string): Promise<PageMeta> {
    const meta = await this.readProjectMeta(projectRoot);
    const page = meta.pages.find((item) => item.id === pageId);

    if (!page) {
      throw new Error("页面不存在");
    }

    return page;
  }

  async writePage(projectRoot: string, page: PageMeta): Promise<PagesJson> {
    const current = await this.readProjectMeta(projectRoot);
    const next = {
      ...current,
      pages: current.pages.map((item) => (item.id === page.id ? page : item))
    };

    await this.writeProjectMeta(projectRoot, next);

    return next;
  }

  async readPageAssets(projectRoot: string, pageId: string): Promise<AssetMeta[]> {
    const meta = await this.readProjectMeta(projectRoot);
    return meta.assets.filter((asset) => asset.pageId === pageId);
  }

  async writePageAssets(projectRoot: string, pageId: string, assets: AssetMeta[]): Promise<PagesJson> {
    const current = await this.readProjectMeta(projectRoot);
    const next = {
      ...current,
      assets: [
        ...current.assets.filter((asset) => asset.pageId !== pageId),
        ...assets.map((asset) => ({ ...asset, pageId }))
      ]
    };

    await this.writeProjectMeta(projectRoot, next);

    return next;
  }

  async readPageSliceSelections(projectRoot: string, pageId: string): Promise<SliceSelectionMeta[]> {
    const meta = await this.readProjectMeta(projectRoot);
    return (meta.sliceSelections || []).filter((selection) => selection.pageId === pageId);
  }

  async writePageSliceSelections(
    projectRoot: string,
    pageId: string,
    selections: SliceSelectionMeta[]
  ): Promise<PagesJson> {
    const current = await this.readProjectMeta(projectRoot);
    const next = {
      ...current,
      sliceSelections: [
        ...(current.sliceSelections || []).filter((selection) => selection.pageId !== pageId),
        ...selections.map((selection) => ({ ...selection, pageId }))
      ]
    };

    await this.writeProjectMeta(projectRoot, next);

    return next;
  }

  private async readSplitProjectMeta(projectRoot: string, parsed: unknown): Promise<PagesJson> {
    const index = pagesIndexJsonSchema.parse(parsed) as PagesIndexJson;
    const pages = await Promise.all(index.pages.map((pageIndex) => this.readPageFile(projectRoot, pageIndex)));
    const assetsByPage = await Promise.all(index.pages.map((pageIndex) => this.readAssetsFile(projectRoot, pageIndex.dataDir)));
    const selectionsByPage = await Promise.all(
      index.pages.map((pageIndex) => this.readSelectionsFile(projectRoot, pageIndex.dataDir))
    );
    const sliceSelections = selectionsByPage.flat();
    const meta = {
      schemaVersion: 2 as const,
      project: index.project,
      documents: index.documents,
      pages,
      assets: assetsByPage.flat(),
      ...(sliceSelections.length > 0 ? { sliceSelections } : {})
    };

    return pagesJsonSchema.parse(meta) as PagesJson;
  }

  private async readPageFile(
    projectRoot: string,
    pageIndex: PagesIndexJson["pages"][number]
  ): Promise<PageMeta> {
    const dataDir = this.resolveDataDir(projectRoot, pageIndex.dataDir);
    const raw = await fs.readFile(path.join(dataDir, "page.json"), "utf8");
    const page = pageDataJsonSchema.parse(JSON.parse(raw));

    return {
      ...page,
      dataDir: pageIndex.dataDir,
      updatedAt: pageIndex.updatedAt
    };
  }

  private async readAssetsFile(projectRoot: string, dataDirPath: string): Promise<AssetMeta[]> {
    const filePath = path.join(this.resolveDataDir(projectRoot, dataDirPath), "assets.json");

    if (!(await pathExists(filePath))) {
      return [];
    }

    const raw = await fs.readFile(filePath, "utf8");
    return assetMetaSchema.array().parse(JSON.parse(raw)) as AssetMeta[];
  }

  private async readSelectionsFile(projectRoot: string, dataDirPath: string): Promise<SliceSelectionMeta[]> {
    const filePath = path.join(this.resolveDataDir(projectRoot, dataDirPath), "slice-selections.json");

    if (!(await pathExists(filePath))) {
      return [];
    }

    const raw = await fs.readFile(filePath, "utf8");
    return sliceSelectionMetaSchema.array().parse(JSON.parse(raw)) as SliceSelectionMeta[];
  }

  private async writeSplitProjectMeta(projectRoot: string, meta: PagesJson): Promise<void> {
    const rootDir = path.resolve(projectRoot);
    const pages = meta.pages.map((page) => ({
      ...page,
      dataDir: page.dataDir || this.defaultPageDataDir(page.id),
      updatedAt: page.updatedAt || meta.project.updatedAt
    }));
    const index: PagesIndexJson = {
      schemaVersion: 2,
      project: meta.project,
      documents: meta.documents,
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        route: page.route,
        description: page.description,
        dataDir: page.dataDir || this.defaultPageDataDir(page.id),
        updatedAt: page.updatedAt || meta.project.updatedAt
      }))
    };

    await fs.mkdir(path.join(rootDir, "pages"), { recursive: true });
    await Promise.all(pages.map((page) => this.writePageBundle(rootDir, page, meta)));
    await fs.writeFile(
      path.join(rootDir, PAGES_JSON_NAME),
      `${JSON.stringify(pagesIndexJsonSchema.parse(index), null, 2)}\n`,
      "utf8"
    );
  }

  private async writePageBundle(projectRoot: string, page: PageMeta, meta: PagesJson): Promise<void> {
    const dataDir = page.dataDir || this.defaultPageDataDir(page.id);
    const absoluteDataDir = this.resolveDataDir(projectRoot, dataDir);
    const pageData = {
      id: page.id,
      name: page.name,
      route: page.route,
      description: page.description,
      uiPrompt: page.uiPrompt,
      ...(page.imagePath ? { imagePath: page.imagePath } : {}),
      ...(page.backgroundImagePath ? { backgroundImagePath: page.backgroundImagePath } : {}),
      ...(page.needUpdate ? { needUpdate: page.needUpdate } : {}),
      assetIds: page.assetIds
    };
    const pageAssets = meta.assets.filter((asset) => asset.pageId === page.id);
    const pageSelections = (meta.sliceSelections || []).filter((selection) => selection.pageId === page.id);

    await fs.mkdir(absoluteDataDir, { recursive: true });
    await fs.writeFile(
      path.join(absoluteDataDir, "page.json"),
      `${JSON.stringify(pageDataJsonSchema.parse(pageData), null, 2)}\n`,
      "utf8"
    );
    await fs.writeFile(path.join(absoluteDataDir, "assets.json"), `${JSON.stringify(pageAssets, null, 2)}\n`, "utf8");
    await fs.writeFile(
      path.join(absoluteDataDir, "slice-selections.json"),
      `${JSON.stringify(pageSelections, null, 2)}\n`,
      "utf8"
    );
  }

  private async backupLegacyPagesJson(projectRoot: string): Promise<void> {
    const pagesJsonPath = path.join(projectRoot, PAGES_JSON_NAME);
    const backupPath = path.join(projectRoot, LEGACY_BACKUP_NAME);

    if (await pathExists(backupPath)) {
      return;
    }

    if (!(await pathExists(pagesJsonPath))) {
      return;
    }

    const raw = await fs.readFile(pagesJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { schemaVersion?: number };

    if (parsed.schemaVersion === 1) {
      await fs.writeFile(backupPath, raw, "utf8");
    }
  }

  private resolveDataDir(projectRoot: string, dataDirPath: string): string {
    const rootDir = path.resolve(projectRoot);
    const absolutePath = path.resolve(rootDir, dataDirPath);
    const relative = path.relative(rootDir, absolutePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("页面数据目录必须位于项目目录内");
    }

    return absolutePath;
  }

  private defaultPageDataDir(pageId: string): string {
    return `pages/${pageId}`;
  }
}
