import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AssetMeta,
  PageImageAnnotation,
  PageImageVersion,
  ProjectInfo,
  SliceSelectionMeta
} from "../../../src/shared/types";
import { ensureInsideProject, makeId, nowIso, pathExists } from "../utils/fs";
import { createCodexProcessEnv } from "../utils/codex-command";
import type {
  CodexImageStreamOptions,
  GeneratedSliceAssetResult,
  GeneratePageImageParams,
  GeneratePageBackgroundParams,
  IdentifiedSliceSelectionResult,
  IdentifySliceSelectionsParams,
  GenerateSliceAssetsParams
} from "./codex-image-provider";
import { ProjectService } from "./project-service";

const execFileAsync = promisify(execFile);

interface ImageProvider {
  generatePageImage(
    params: GeneratePageImageParams,
    streamOptions?: CodexImageStreamOptions
  ): Promise<string>;
  generatePageBackground(
    params: GeneratePageBackgroundParams,
    streamOptions?: CodexImageStreamOptions
  ): Promise<string>;
  identifySliceSelections(
    params: IdentifySliceSelectionsParams,
    streamOptions?: CodexImageStreamOptions
  ): Promise<IdentifiedSliceSelectionResult[]>;
  generateSliceAssets(
    params: GenerateSliceAssetsParams,
    streamOptions?: CodexImageStreamOptions
  ): Promise<GeneratedSliceAssetResult[]>;
}

export class ImageService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly imageProvider: ImageProvider
  ) {}

  async generatePageImage(
    projectRoot: string,
    pageId: string,
    prompt: string,
    annotations: PageImageAnnotation[] = [],
    streamOptions: CodexImageStreamOptions = {}
  ): Promise<ProjectInfo> {
    const current = await this.projectService.ensureSplitProject(projectRoot);
    const page = current.pages.find((item) => item.id === pageId);

    if (!page) {
      throw new Error("页面不存在");
    }

    const finalPrompt = prompt.trim() || page.uiPrompt;
    const outputPath = await this.getNextPageImageVersionPath(projectRoot, page.id);
    const imagePath = await this.imageProvider.generatePageImage({
      projectRoot,
      page,
      prompt: finalPrompt,
      annotations,
      outputPath
    }, streamOptions);
    await this.writePageImageAnnotations(outputPath, annotations);
    const latest = await this.projectService.readPagesJson(projectRoot);
    const timestamp = nowIso();
    const pages = latest.pages.map((item) =>
      item.id === page.id ? this.withClearedUpdateFlag(item, finalPrompt, imagePath) : item
    );
    const next = {
      ...latest,
      project: {
        ...latest.project,
        updatedAt: timestamp
      },
      pages
    };

    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return { rootDir: projectRoot, meta: next };
  }

  async listPageImageVersions(projectRoot: string, pageId: string): Promise<PageImageVersion[]> {
    const current = await this.projectService.ensureSplitProject(projectRoot);
    const page = current.pages.find((item) => item.id === pageId);

    if (!page) {
      throw new Error("页面不存在");
    }

    const versionsDir = path.join(projectRoot, "assets", "pages", pageId, "versions");

    if (!(await pathExists(versionsDir))) {
      return [];
    }

    const entries = await fs.readdir(versionsDir, { withFileTypes: true });
    const versions = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^v\d{3}\.png$/u.test(entry.name))
        .map(async (entry) => {
          const filePath = path.join(versionsDir, entry.name);
          const relativePath = path.relative(projectRoot, filePath).split(path.sep).join("/");
          const stats = await fs.stat(filePath);

          return {
            version: path.basename(entry.name, ".png"),
            path: relativePath,
            createdAt: stats.birthtime.toISOString(),
            active: page.imagePath === relativePath
          };
        })
    );

    return versions.sort((a, b) => a.version.localeCompare(b.version));
  }

  async generatePageBackground(
    projectRoot: string,
    pageId: string,
    streamOptions: CodexImageStreamOptions = {}
  ): Promise<ProjectInfo> {
    const current = await this.projectService.ensureSplitProject(projectRoot);
    const page = current.pages.find((item) => item.id === pageId);

    if (!page) {
      throw new Error("页面不存在");
    }

    if (!page.imagePath) {
      throw new Error("请先生成页面图片，再提取背景");
    }

    const outputPath = await this.getNextPageBackgroundPath(projectRoot, page.id);
    const backgroundImagePath = await this.imageProvider.generatePageBackground({
      projectRoot,
      page,
      sourceImagePath: page.imagePath,
      outputPath
    }, streamOptions);
    const latest = await this.projectService.readPagesJson(projectRoot);
    const timestamp = nowIso();
    const next = {
      ...latest,
      project: {
        ...latest.project,
        updatedAt: timestamp
      },
      pages: latest.pages.map((item) =>
        item.id === page.id
          ? {
              ...item,
              backgroundImagePath
            }
          : item
      )
    };

    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return { rootDir: projectRoot, meta: next };
  }

  async identifySliceSelections(
    projectRoot: string,
    pageId: string,
    streamOptions: CodexImageStreamOptions = {}
  ): Promise<ProjectInfo> {
    const current = await this.projectService.ensureSplitProject(projectRoot);
    const page = current.pages.find((item) => item.id === pageId);

    if (!page) {
      throw new Error("页面不存在");
    }

    if (!page.imagePath) {
      throw new Error("请先生成页面图片，再识别切图区域");
    }

    const identified = await this.imageProvider.identifySliceSelections({
      projectRoot,
      page,
      sourceImagePath: page.imagePath
    }, streamOptions);
    const latest = await this.projectService.readPagesJson(projectRoot);
    const timestamp = nowIso();
    const existingSelections = latest.sliceSelections || [];
    const generatedSelections = existingSelections.filter(
      (selection) => selection.pageId === pageId && selection.status === "generated"
    );
    const otherPageSelections = existingSelections.filter((selection) => selection.pageId !== pageId);
    const nextSelections: SliceSelectionMeta[] = [
      ...otherPageSelections,
      ...generatedSelections,
      ...identified.map((item) => ({
        id: makeId("selection"),
        pageId,
        name: item.name.trim() || `${page.name} 素材`,
        sourceImagePath: page.imagePath || "",
        selection: item.selection,
        prompt: item.description.trim(),
        status: "pending" as const,
        assetId: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }))
    ];
    const next = {
      ...latest,
      project: {
        ...latest.project,
        updatedAt: timestamp
      },
      sliceSelections: nextSelections
    };

    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return { rootDir: projectRoot, meta: next };
  }

  async setActivePageImageVersion(
    projectRoot: string,
    pageId: string,
    imagePath: string
  ): Promise<ProjectInfo> {
    const current = await this.projectService.ensureSplitProject(projectRoot);
    const page = current.pages.find((item) => item.id === pageId);

    if (!page) {
      throw new Error("页面不存在");
    }

    if (!imagePath.startsWith(`assets/pages/${pageId}/versions/`)) {
      throw new Error("页面图片版本路径无效");
    }

    await fs.access(ensureInsideProject(projectRoot, imagePath));
    const timestamp = nowIso();
    const next = {
      ...current,
      project: {
        ...current.project,
        updatedAt: timestamp
      },
      pages: current.pages.map((item) =>
        item.id === pageId
          ? {
              ...item,
              imagePath
            }
          : item
      )
    };

    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return { rootDir: projectRoot, meta: next };
  }

  async saveSliceSelections(
    projectRoot: string,
    pageId: string,
    selections: SliceSelectionMeta[]
  ): Promise<ProjectInfo> {
    const current = await this.projectService.ensureSplitProject(projectRoot);

    if (!current.pages.some((page) => page.id === pageId)) {
      throw new Error("页面不存在");
    }

    const timestamp = nowIso();
    const normalized = selections.map((selection) => ({
      ...selection,
      pageId,
      name: selection.name.trim() || "未命名素材",
      sourceImagePath: selection.sourceImagePath,
      prompt: selection.prompt,
      updatedAt: timestamp
    }));
    const next = {
      ...current,
      project: {
        ...current.project,
        updatedAt: timestamp
      },
      sliceSelections: [
        ...(current.sliceSelections || []).filter((selection) => selection.pageId !== pageId),
        ...normalized
      ]
    };

    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return { rootDir: projectRoot, meta: next };
  }

  private withClearedUpdateFlag(
    page: ProjectInfo["meta"]["pages"][number],
    uiPrompt: string,
    imagePath: string
  ): ProjectInfo["meta"]["pages"][number] {
    const next = { ...page };
    delete next.needUpdate;

    return {
      ...next,
      uiPrompt,
      imagePath
    };
  }

  async generateSliceAsset(
    projectRoot: string,
    pageId: string,
    sourceImagePath: string,
    selection: { x: number; y: number; width: number; height: number },
    prompt: string,
    streamOptions: CodexImageStreamOptions = {}
  ): Promise<ProjectInfo> {
    const current = await this.projectService.ensureSplitProject(projectRoot);
    const page = current.pages.find((item) => item.id === pageId);
    const timestamp = nowIso();
    const selectionId = makeId("selection");
    const sliceSelection: SliceSelectionMeta = {
      id: selectionId,
      pageId,
      name: `${page?.name || "页面"} 切图`,
      sourceImagePath,
      selection,
      prompt,
      status: "pending",
      assetId: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await this.saveSliceSelections(projectRoot, pageId, [
      ...((current.sliceSelections || []).filter((item) => item.pageId === pageId)),
      sliceSelection
    ]);

    return this.generateSliceAssets(projectRoot, pageId, [selectionId], streamOptions);
  }

  async generateSliceAssets(
    projectRoot: string,
    pageId: string,
    selectionIds: string[],
    streamOptions: CodexImageStreamOptions = {},
    options: { force?: boolean; prompt?: string; replaceExisting?: boolean } = {}
  ): Promise<ProjectInfo> {
    const current = await this.projectService.ensureSplitProject(projectRoot);
    const page = current.pages.find((item) => item.id === pageId);

    if (!page) {
      throw new Error("页面不存在");
    }

    const timestamp = nowIso();
    const requestedIds = new Set(selectionIds);
    const selections = current.sliceSelections || [];
    const targetSelections = selections.filter(
      (selection) =>
        selection.pageId === pageId &&
        requestedIds.has(selection.id) &&
        (options.force || selection.status === "pending")
    );
    let assets = [...current.assets];
    let pageAssetIds = [...page.assetIds];
    let nextSelections = selections.map((selection) => ({ ...selection }));
    const instruction = options.prompt?.trim();
    const batchItems = targetSelections.map((selection) => {
      const assetId = makeId("asset");

      return {
        assetId,
        sourceImagePath: selection.sourceImagePath || page.imagePath || "",
        selection: selection.selection,
        sliceSelection: selection,
        instruction,
        outputPath: path.join(projectRoot, "assets", "slices", page.id, `${assetId}.png`)
      };
    });

    if (batchItems.length > 0) {
      try {
        streamOptions.onEvent?.("status", `正在批量生成 ${batchItems.length} 个切图素材`);
        const generatedAssets = await this.imageProvider.generateSliceAssets({
          projectRoot,
          page,
          items: batchItems
        }, streamOptions);
        const generatedBySelectionId = new Map(
          generatedAssets.map((asset) => [asset.selectionId, asset])
        );
        const latest = await this.projectService.readPagesJson(projectRoot);
        const latestPage = latest.pages.find((item) => item.id === pageId) || page;
        const latestSelections = latest.sliceSelections || [];

        assets = [...latest.assets];
        pageAssetIds = [...latestPage.assetIds];
        nextSelections = latestSelections.map((selection) => ({ ...selection }));

        for (const item of batchItems) {
          const generated = generatedBySelectionId.get(item.sliceSelection.id);

          if (!generated) {
            throw new Error(`缺少切图结果：${item.sliceSelection.id}`);
          }

          const index = nextSelections.findIndex((selection) => selection.id === item.sliceSelection.id);
          const latestSelection = latestSelections.find((selection) => selection.id === item.sliceSelection.id);
          const assetName = generated.name.trim() || item.sliceSelection.name;
          const assetDescription = generated.description.trim();
          const replacedAssetId = options.replaceExisting
            ? latestSelection?.assetId || item.sliceSelection.assetId
            : null;

          if (replacedAssetId) {
            assets = assets.filter((asset) => asset.id !== replacedAssetId);
            pageAssetIds = pageAssetIds.filter((assetId) => assetId !== replacedAssetId);
          }

          assets.push({
            id: item.assetId,
            pageId: page.id,
            type: "slice" as const,
            name: assetName,
            path: generated.path,
            sourceImagePath: item.sourceImagePath,
            selection: item.selection,
            selectionId: item.sliceSelection.id,
            prompt: assetDescription,
            createdAt: timestamp
          });
          pageAssetIds = [...new Set([...pageAssetIds, item.assetId])];

          if (index >= 0) {
            nextSelections[index] = {
              ...nextSelections[index],
              name: assetName,
              prompt: assetDescription,
              status: "generated",
              assetId: item.assetId,
              updatedAt: timestamp
            };
          }
        }
      } catch {
        for (const item of batchItems) {
          const index = nextSelections.findIndex((selection) => selection.id === item.sliceSelection.id);

          if (index >= 0) {
            nextSelections[index] = {
              ...nextSelections[index],
              status: "failed",
              updatedAt: timestamp
            };
          }
        }
        streamOptions.onEvent?.("error", "批量切图生成失败");
      }
    }

    const next = {
      ...current,
      project: {
        ...current.project,
        updatedAt: timestamp
      },
      pages: current.pages.map((item) =>
        item.id === page.id
          ? {
              ...item,
              assetIds: pageAssetIds
            }
          : item
      ),
      assets,
      sliceSelections: nextSelections
    };

    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return { rootDir: projectRoot, meta: next };
  }

  async vectorizeSliceAsset(projectRoot: string, pageId: string, assetId: string): Promise<ProjectInfo> {
    const current = await this.projectService.ensureSplitProject(projectRoot);
    const page = current.pages.find((item) => item.id === pageId);

    if (!page) {
      throw new Error("页面不存在");
    }

    const asset = current.assets.find((item) => item.pageId === pageId && item.id === assetId);

    if (!asset) {
      throw new Error("切图素材不存在");
    }

    const sourcePath = ensureInsideProject(projectRoot, asset.path);
    const outputRelativePath = `assets/vectors/${pageId}/${assetId}.svg`;
    const outputPath = ensureInsideProject(projectRoot, outputRelativePath);
    const timestamp = nowIso();

    await this.runVTracer(projectRoot, sourcePath, outputPath);

    const next = {
      ...current,
      project: {
        ...current.project,
        updatedAt: timestamp
      },
      assets: current.assets.map((item) =>
        item.id === asset.id
          ? {
              ...item,
              vectorPath: outputRelativePath
            }
          : item
      )
    };

    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return { rootDir: projectRoot, meta: next };
  }

  async vectorizeSliceSelection(projectRoot: string, pageId: string, selectionId: string): Promise<ProjectInfo> {
    const current = await this.projectService.ensureSplitProject(projectRoot);
    const page = current.pages.find((item) => item.id === pageId);

    if (!page) {
      throw new Error("页面不存在");
    }

    const selection = current.sliceSelections?.find(
      (item) => item.pageId === pageId && item.id === selectionId
    );

    if (!selection) {
      throw new Error("切图区域不存在");
    }

    if (selection.assetId) {
      const existingAsset = current.assets.find((item) => item.id === selection.assetId);

      if (existingAsset) {
        return this.vectorizeSliceAsset(projectRoot, pageId, existingAsset.id);
      }
    }

    const timestamp = nowIso();
    const assetId = makeId("asset");
    const sliceRelativePath = `assets/slices/${pageId}/${assetId}.png`;
    const vectorRelativePath = `assets/vectors/${pageId}/${assetId}.svg`;
    const slicePath = ensureInsideProject(projectRoot, sliceRelativePath);
    const vectorPath = ensureInsideProject(projectRoot, vectorRelativePath);
    const sourcePath = ensureInsideProject(projectRoot, selection.sourceImagePath);

    await this.cropSelectionToPng(projectRoot, sourcePath, slicePath, selection);
    await this.runVTracer(projectRoot, slicePath, vectorPath);

    const asset: AssetMeta = {
      id: assetId,
      pageId,
      type: "slice",
      name: selection.name,
      path: sliceRelativePath,
      vectorPath: vectorRelativePath,
      sourceImagePath: selection.sourceImagePath,
      selection: selection.selection,
      selectionId: selection.id,
      prompt: selection.prompt,
      createdAt: timestamp
    };

    const nextSelections = (current.sliceSelections ?? []).map((item) =>
      item.id === selection.id
        ? {
            ...item,
            status: "generated" as const,
            assetId,
            updatedAt: timestamp
          }
        : item
    );
    const pageAssetIds = Array.from(new Set([...page.assetIds, assetId]));
    const next = {
      ...current,
      project: {
        ...current.project,
        updatedAt: timestamp
      },
      pages: current.pages.map((item) =>
        item.id === page.id
          ? {
              ...item,
              assetIds: pageAssetIds
            }
          : item
      ),
      assets: [...current.assets, asset],
      sliceSelections: nextSelections
    };

    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return { rootDir: projectRoot, meta: next };
  }

  private async cropSelectionToPng(
    projectRoot: string,
    sourcePath: string,
    outputPath: string,
    selection: SliceSelectionMeta
  ): Promise<void> {
    const rect = selection.selection;
    const x = Math.max(0, Math.round(rect.x));
    const y = Math.max(0, Math.round(rect.y));
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    try {
      await execFileAsync(
        "sips",
        [sourcePath, "--cropOffset", String(y), String(x), "-c", String(height), String(width), "--out", outputPath],
        {
          cwd: projectRoot,
          env: createCodexProcessEnv(),
          timeout: 60_000,
          maxBuffer: 1024 * 1024 * 4
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`按选区裁剪 PNG 失败：${message}`);
    }

    if (!(await pathExists(outputPath))) {
      throw new Error("按选区裁剪 PNG 失败：未生成输出文件");
    }
  }

  private async runVTracer(projectRoot: string, sourcePath: string, outputPath: string): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    try {
      await execFileAsync(
        "vtracer",
        ["--input", sourcePath, "--output", outputPath, "--preset", "poster"],
        {
          cwd: projectRoot,
          env: createCodexProcessEnv(),
          timeout: 120_000,
          maxBuffer: 1024 * 1024 * 4
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("ENOENT") || message.includes("not found")) {
        throw new Error(
          [
            "未找到 VTracer 命令行工具，无法转换 SVG。",
            "请先安装 VTracer：`cargo install vtracer`，或从 https://github.com/visioncortex/vtracer/releases 下载可执行文件并加入 PATH。",
            "安装后重启 cxDesinger 再重试。"
          ].join(" ")
        );
      }

      throw new Error(`VTracer 转换失败：${message}`);
    }

    if (!(await pathExists(outputPath))) {
      throw new Error("VTracer 未生成 SVG 文件");
    }
  }

  private async getNextPageImageVersionPath(projectRoot: string, pageId: string): Promise<string> {
    const versionsDir = path.join(projectRoot, "assets", "pages", pageId, "versions");
    await fs.mkdir(versionsDir, { recursive: true });
    const entries = await fs.readdir(versionsDir);
    const maxVersion = entries.reduce((max, entry) => {
      const match = /^v(\d{3})\.png$/u.exec(entry);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    const nextVersion = `v${String(maxVersion + 1).padStart(3, "0")}.png`;

    return path.join(versionsDir, nextVersion);
  }

  private async getNextPageBackgroundPath(projectRoot: string, pageId: string): Promise<string> {
    const backgroundsDir = path.join(projectRoot, "assets", "pages", pageId, "backgrounds");
    await fs.mkdir(backgroundsDir, { recursive: true });
    const entries = await fs.readdir(backgroundsDir);
    const maxVersion = entries.reduce((max, entry) => {
      const match = /^bg(\d{3})\.png$/u.exec(entry);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    const nextVersion = `bg${String(maxVersion + 1).padStart(3, "0")}.png`;

    return path.join(backgroundsDir, nextVersion);
  }

  private async writePageImageAnnotations(
    outputPath: string,
    annotations: PageImageAnnotation[]
  ): Promise<void> {
    if (annotations.length === 0) {
      return;
    }

    const basePath = outputPath.replace(/\.png$/u, "");
    const markdown = [
      "# 图片版本批注",
      "",
      ...annotations.map((annotation, index) =>
        [
          `## ${index + 1}. ${annotation.id}`,
          "",
          `- 页面 ID：${annotation.pageId}`,
          `- 来源图片：${annotation.sourceImagePath}`,
          `- 区域：x=${annotation.selection.x}, y=${annotation.selection.y}, width=${annotation.selection.width}, height=${annotation.selection.height}`,
          `- 时间：${annotation.createdAt}`,
          "",
          annotation.note
        ].join("\n")
      )
    ].join("\n");

    await fs.writeFile(`${basePath}.annotations.json`, `${JSON.stringify(annotations, null, 2)}\n`, "utf8");
    await fs.writeFile(`${basePath}.annotations.md`, `${markdown.trim()}\n`, "utf8");
  }
}
