import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type {
  AiStreamLevel,
  AppSettings,
  CodexModel,
  CodexReasoningEffort,
  PageMeta,
  PageImageAnnotation,
  SelectionRect,
  SliceSelectionMeta
} from "../../../src/shared/types";
import { pathExists, toProjectRelativePath } from "../utils/fs";
import { runProcess } from "../utils/process";

const CODEX_PAGE_IMAGE_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    path: { type: "string", minLength: 1 }
  }
};

const CODEX_SLICE_ASSETS_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assets"],
  properties: {
    assets: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["selectionId", "path", "name", "description"],
        properties: {
          selectionId: { type: "string", minLength: 1 },
          path: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 }
        }
      }
    }
  }
};

const CODEX_SLICE_IDENTIFICATION_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["selections"],
  properties: {
    selections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "selection"],
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          selection: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "width", "height"],
            properties: {
              x: { type: "number", minimum: 0 },
              y: { type: "number", minimum: 0 },
              width: { type: "number", exclusiveMinimum: 0 },
              height: { type: "number", exclusiveMinimum: 0 }
            }
          }
        }
      }
    }
  }
};

const codexPageImageOutputSchema = z.object({
  path: z.string().min(1)
});

const codexSliceAssetsOutputSchema = z.object({
  assets: z
    .array(
      z.object({
        selectionId: z.string().min(1),
        path: z.string().min(1),
        name: z.string().min(1),
        description: z.string().min(1)
      })
    )
    .min(1)
});

const codexSliceIdentificationOutputSchema = z.object({
  selections: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        selection: z.object({
          x: z.number().finite().nonnegative(),
          y: z.number().finite().nonnegative(),
          width: z.number().finite().positive(),
          height: z.number().finite().positive()
        })
      })
    )
    .min(1)
});

export interface CodexImageProviderOptions {
  command: string;
  args: string[];
  timeoutMs: number;
}

export interface CodexImageStreamOptions {
  onEvent?: (level: AiStreamLevel, message: string) => void;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
  signal?: AbortSignal;
}

export interface GeneratePageImageParams {
  projectRoot: string;
  page: PageMeta;
  prompt: string;
  annotations?: PageImageAnnotation[];
  outputPath: string;
}

export interface GeneratePageBackgroundParams {
  projectRoot: string;
  page: PageMeta;
  sourceImagePath: string;
  outputPath: string;
}

export interface GenerateSliceAssetParams {
  projectRoot: string;
  page: PageMeta;
  sourceImagePath: string;
  selection: SelectionRect;
  sliceSelection?: SliceSelectionMeta;
  outputPath: string;
}

export interface GenerateSliceAssetsParams {
  projectRoot: string;
  page: PageMeta;
  items: GenerateSliceAssetItem[];
}

export interface IdentifySliceSelectionsParams {
  projectRoot: string;
  page: PageMeta;
  sourceImagePath: string;
}

export interface GenerateSliceAssetItem {
  assetId: string;
  sourceImagePath: string;
  selection: SelectionRect;
  sliceSelection: SliceSelectionMeta;
  instruction?: string;
  outputPath: string;
}

export interface GeneratedSliceAssetResult {
  selectionId: string;
  path: string;
  name: string;
  description: string;
}

export interface IdentifiedSliceSelectionResult {
  name: string;
  description: string;
  selection: SelectionRect;
}

export class CodexImageProvider {
  constructor(private readonly options: CodexImageProviderOptions) {}

  static fromSettings(settings: AppSettings): CodexImageProvider {
    return new CodexImageProvider(settings.codex);
  }

  async generatePageImage(
    params: GeneratePageImageParams,
    streamOptions: CodexImageStreamOptions = {}
  ): Promise<string> {
    const result = await this.runCodexImageTask({
      kind: "page-ui",
      projectRoot: params.projectRoot,
      outputPath: params.outputPath,
      prompt: this.createPageImagePrompt(params)
    }, streamOptions);

    return result.path;
  }

  async generatePageBackground(
    params: GeneratePageBackgroundParams,
    streamOptions: CodexImageStreamOptions = {}
  ): Promise<string> {
    const result = await this.runCodexImageTask({
      kind: "page-background",
      projectRoot: params.projectRoot,
      outputPath: params.outputPath,
      prompt: this.createPageBackgroundPrompt(params)
    }, streamOptions);

    return result.path;
  }

  async generateSliceAsset(
    params: GenerateSliceAssetParams,
    streamOptions: CodexImageStreamOptions = {}
  ): Promise<GeneratedSliceAssetResult> {
    const sliceSelection = params.sliceSelection || {
      id: randomUUID(),
      pageId: params.page.id,
      name: params.page.name,
      sourceImagePath: params.sourceImagePath,
      selection: params.selection,
      prompt: "",
      status: "pending" as const,
      assetId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const [result] = await this.generateSliceAssets({
      projectRoot: params.projectRoot,
      page: params.page,
      items: [
        {
          assetId: path.basename(params.outputPath, path.extname(params.outputPath)),
          sourceImagePath: params.sourceImagePath,
          selection: params.selection,
          sliceSelection,
          outputPath: params.outputPath
        }
      ]
    }, streamOptions);

    return {
      selectionId: result.selectionId,
      path: result.path,
      name: result.name || sliceSelection.name || params.page.name,
      description: result.description || params.page.uiPrompt
    };
  }

  async generateSliceAssets(
    params: GenerateSliceAssetsParams,
    streamOptions: CodexImageStreamOptions = {}
  ): Promise<GeneratedSliceAssetResult[]> {
    return this.runCodexSliceAssetsTask(params, streamOptions);
  }

  async identifySliceSelections(
    params: IdentifySliceSelectionsParams,
    streamOptions: CodexImageStreamOptions = {}
  ): Promise<IdentifiedSliceSelectionResult[]> {
    return this.runCodexSliceIdentificationTask(params, streamOptions);
  }

  private async runCodexImageTask(
    task: {
      kind: "page-ui" | "page-background";
      projectRoot: string;
      outputPath: string;
      prompt: string;
    },
    streamOptions: CodexImageStreamOptions
  ): Promise<{ path: string; name?: string; description?: string }> {
    const schemaPath = path.join(os.tmpdir(), `codex-image-${randomUUID()}.schema.json`);
    const outputMessagePath = path.join(os.tmpdir(), `codex-image-${randomUUID()}.json`);
    const relativeOutputPath = toProjectRelativePath(task.projectRoot, task.outputPath);
    const logRelativePath = `logs/image-${task.kind}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    const logPath = path.join(task.projectRoot, logRelativePath);
    const args = [
      ...this.withRunOptions(this.options.args, streamOptions),
      "exec",
      "--cd",
      task.projectRoot,
      "--sandbox",
      "workspace-write",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputMessagePath,
      "-"
    ];
    let stdout = "";
    let stderr = "";

    await fs.mkdir(path.dirname(task.outputPath), { recursive: true });
    await fs.writeFile(
      schemaPath,
      JSON.stringify(
        CODEX_PAGE_IMAGE_OUTPUT_JSON_SCHEMA,
        null,
        2
      ),
      "utf8"
    );
    this.emitStream(streamOptions, "status", "正在启动 Codex 图片生成任务");
    await this.appendLog(logPath, [
      `time=${new Date().toISOString()}`,
      `cwd=${task.projectRoot}`,
      `kind=${task.kind}`,
      `output=${relativeOutputPath}`,
      `command=${this.options.command}`,
      `args=${args.join(" ")}`,
      "",
      "[prompt]",
      task.prompt,
      ""
    ].join("\n"));

    try {
      this.emitStream(streamOptions, "status", "正在调用 Codex 生成图片文件");
      const result = await runProcess({
        command: this.options.command,
        args,
        stdin: task.prompt,
        timeoutMs: this.options.timeoutMs,
        signal: streamOptions.signal,
        onStdout: (chunk) => this.emitStream(streamOptions, "stdout", chunk),
        onStderr: (chunk) => this.emitStream(streamOptions, "stderr", chunk)
      });
      stdout = result.stdout;
      stderr = result.stderr;
      await this.appendCommandResult(logPath, stdout, stderr);

      const raw = await fs.readFile(outputMessagePath, "utf8");
      await this.appendLog(logPath, ["", "[output-last-message]", raw, ""].join("\n"));
      const parsed = codexPageImageOutputSchema.parse(JSON.parse(raw));
      const generatedPath = path.resolve(task.projectRoot, parsed.path);

      if (!(await pathExists(generatedPath))) {
        throw new Error("Codex 未生成有效图片文件");
      }

      if (path.resolve(task.outputPath) !== generatedPath) {
        await fs.copyFile(generatedPath, task.outputPath);
      }

      this.emitStream(streamOptions, "complete", "图片文件已生成并写入项目");
      await this.appendLog(logPath, "status=success\n");
      return {
        ...parsed,
        path: relativeOutputPath
      };
    } catch (error) {
      const maybeProcessError = error as { stdout?: string; stderr?: string };
      stdout = maybeProcessError.stdout || stdout;
      stderr = maybeProcessError.stderr || stderr;
      await this.appendCommandResult(logPath, stdout, stderr);
      await this.appendLog(logPath, `status=failed\nerror=${this.formatErrorForLog(error)}\n`);
      this.emitStream(streamOptions, "error", this.formatUserFacingError(error));
      throw new Error(`${this.formatUserFacingError(error)}。详细日志：${logRelativePath}`);
    } finally {
      await Promise.allSettled([
        fs.rm(schemaPath, { force: true }),
        fs.rm(outputMessagePath, { force: true })
      ]);
    }
  }

  private async runCodexSliceAssetsTask(
    params: GenerateSliceAssetsParams,
    streamOptions: CodexImageStreamOptions
  ): Promise<GeneratedSliceAssetResult[]> {
    const schemaPath = path.join(os.tmpdir(), `codex-image-${randomUUID()}.schema.json`);
    const outputMessagePath = path.join(os.tmpdir(), `codex-image-${randomUUID()}.json`);
    const relativeOutputPaths = params.items.map((item) => toProjectRelativePath(params.projectRoot, item.outputPath));
    const logRelativePath = `logs/image-slice-assets-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    const logPath = path.join(params.projectRoot, logRelativePath);
    const args = [
      ...this.withRunOptions(this.options.args, streamOptions),
      "exec",
      "--cd",
      params.projectRoot,
      "--sandbox",
      "workspace-write",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputMessagePath,
      "-"
    ];
    let stdout = "";
    let stderr = "";

    await Promise.all(params.items.map((item) => fs.mkdir(path.dirname(item.outputPath), { recursive: true })));
    await fs.writeFile(schemaPath, JSON.stringify(CODEX_SLICE_ASSETS_OUTPUT_JSON_SCHEMA, null, 2), "utf8");
    this.emitStream(streamOptions, "status", `正在启动 Codex 批量切图任务（${params.items.length} 个区域）`);
    await this.appendLog(logPath, [
      `time=${new Date().toISOString()}`,
      `cwd=${params.projectRoot}`,
      "kind=slice-assets",
      `outputs=${relativeOutputPaths.join(", ")}`,
      `command=${this.options.command}`,
      `args=${args.join(" ")}`,
      "",
      "[prompt]",
      this.createSliceAssetsPrompt(params),
      ""
    ].join("\n"));

    try {
      this.emitStream(streamOptions, "status", "正在调用 Codex 批量生成切图素材");
      const prompt = this.createSliceAssetsPrompt(params);
      const result = await runProcess({
        command: this.options.command,
        args,
        stdin: prompt,
        timeoutMs: this.options.timeoutMs,
        signal: streamOptions.signal,
        onStdout: (chunk) => this.emitStream(streamOptions, "stdout", chunk),
        onStderr: (chunk) => this.emitStream(streamOptions, "stderr", chunk)
      });
      stdout = result.stdout;
      stderr = result.stderr;
      await this.appendCommandResult(logPath, stdout, stderr);

      const raw = await fs.readFile(outputMessagePath, "utf8");
      await this.appendLog(logPath, ["", "[output-last-message]", raw, ""].join("\n"));
      const parsed = codexSliceAssetsOutputSchema.parse(JSON.parse(raw));
      const parsedBySelectionId = new Map(parsed.assets.map((asset) => [asset.selectionId, asset]));
      const generated: GeneratedSliceAssetResult[] = [];

      for (const item of params.items) {
        const selectionId = item.sliceSelection.id;
        const parsedAsset = parsedBySelectionId.get(selectionId);

        if (!parsedAsset) {
          throw new Error(`Codex 未返回切图区域 ${selectionId} 的结果`);
        }

        const generatedPath = path.resolve(params.projectRoot, parsedAsset.path);

        if (!(await pathExists(generatedPath))) {
          throw new Error(`Codex 未生成切图区域 ${selectionId} 的有效图片文件`);
        }

        if (path.resolve(item.outputPath) !== generatedPath) {
          await fs.copyFile(generatedPath, item.outputPath);
        }

        generated.push({
          selectionId,
          path: toProjectRelativePath(params.projectRoot, item.outputPath),
          name: parsedAsset.name,
          description: parsedAsset.description
        });
      }

      this.emitStream(streamOptions, "complete", "批量切图素材已生成并写入项目");
      await this.appendLog(logPath, "status=success\n");
      return generated;
    } catch (error) {
      const maybeProcessError = error as { stdout?: string; stderr?: string };
      stdout = maybeProcessError.stdout || stdout;
      stderr = maybeProcessError.stderr || stderr;
      await this.appendCommandResult(logPath, stdout, stderr);
      await this.appendLog(logPath, `status=failed\nerror=${this.formatErrorForLog(error)}\n`);
      this.emitStream(streamOptions, "error", this.formatUserFacingError(error));
      throw new Error(`${this.formatUserFacingError(error)}。详细日志：${logRelativePath}`);
    } finally {
      await Promise.allSettled([
        fs.rm(schemaPath, { force: true }),
        fs.rm(outputMessagePath, { force: true })
      ]);
    }
  }

  private async runCodexSliceIdentificationTask(
    params: IdentifySliceSelectionsParams,
    streamOptions: CodexImageStreamOptions
  ): Promise<IdentifiedSliceSelectionResult[]> {
    const schemaPath = path.join(os.tmpdir(), `codex-slice-identify-${randomUUID()}.schema.json`);
    const outputMessagePath = path.join(os.tmpdir(), `codex-slice-identify-${randomUUID()}.json`);
    const logRelativePath = `logs/image-slice-identify-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    const logPath = path.join(params.projectRoot, logRelativePath);
    const prompt = this.createSliceIdentificationPrompt(params);
    const args = [
      ...this.withRunOptions(this.options.args, streamOptions),
      "exec",
      "--cd",
      params.projectRoot,
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputMessagePath,
      "-"
    ];
    let stdout = "";
    let stderr = "";

    await fs.writeFile(schemaPath, JSON.stringify(CODEX_SLICE_IDENTIFICATION_OUTPUT_JSON_SCHEMA, null, 2), "utf8");
    this.emitStream(streamOptions, "status", "正在启动 Codex 切图识别任务");
    await this.appendLog(logPath, [
      `time=${new Date().toISOString()}`,
      `cwd=${params.projectRoot}`,
      "kind=slice-identification",
      `source=${params.sourceImagePath}`,
      `command=${this.options.command}`,
      `args=${args.join(" ")}`,
      "",
      "[prompt]",
      prompt,
      ""
    ].join("\n"));

    try {
      this.emitStream(streamOptions, "status", "正在调用 Codex 识别可切图组件");
      const result = await runProcess({
        command: this.options.command,
        args,
        stdin: prompt,
        timeoutMs: this.options.timeoutMs,
        signal: streamOptions.signal,
        onStdout: (chunk) => this.emitStream(streamOptions, "stdout", chunk),
        onStderr: (chunk) => this.emitStream(streamOptions, "stderr", chunk)
      });
      stdout = result.stdout;
      stderr = result.stderr;
      await this.appendCommandResult(logPath, stdout, stderr);

      const raw = await fs.readFile(outputMessagePath, "utf8");
      await this.appendLog(logPath, ["", "[output-last-message]", raw, ""].join("\n"));
      const parsed = codexSliceIdentificationOutputSchema.parse(JSON.parse(raw));

      this.emitStream(streamOptions, "complete", "切图区域识别完成");
      await this.appendLog(logPath, "status=success\n");
      return parsed.selections.map((selection) => ({
        name: selection.name.trim(),
        description: selection.description.trim(),
        selection: {
          x: Math.round(selection.selection.x),
          y: Math.round(selection.selection.y),
          width: Math.round(selection.selection.width),
          height: Math.round(selection.selection.height)
        }
      }));
    } catch (error) {
      const maybeProcessError = error as { stdout?: string; stderr?: string };
      stdout = maybeProcessError.stdout || stdout;
      stderr = maybeProcessError.stderr || stderr;
      await this.appendCommandResult(logPath, stdout, stderr);
      await this.appendLog(logPath, `status=failed\nerror=${this.formatErrorForLog(error)}\n`);
      this.emitStream(streamOptions, "error", this.formatUserFacingError(error));
      throw new Error(`${this.formatUserFacingError(error)}。详细日志：${logRelativePath}`);
    } finally {
      await Promise.allSettled([
        fs.rm(schemaPath, { force: true }),
        fs.rm(outputMessagePath, { force: true })
      ]);
    }
  }

  private createPageImagePrompt(params: GeneratePageImageParams): string {
    const outputRelativePath = toProjectRelativePath(params.projectRoot, params.outputPath);

    return [
      "你是一个具备图片生成能力的资深 UI 视觉设计师。",
      "请读取项目根目录下的 pages.json，结合完整页面规划和当前页面信息，为指定页面生成一张高质量 UI 效果图。",
      "必须调用 Codex 可用的图片生成工具或内置图片生成能力（例如 image_gen / image generation tool）来生成最终位图。",
      "必须直接在项目目录中生成 PNG 图片文件，不要只写 HTML、SVG、Markdown 或代码说明。",
      "最终只返回符合 JSON Schema 的 JSON：path 为生成图片相对项目根目录的路径。",
      "",
      "上下文文件：pages.json",
      "全局视觉规范文件：docs/style.md（如果存在，必须读取并优先遵循）",
      `当前页面 ID：${params.page.id}`,
      `当前页面路径：${params.page.route}`,
      `目标输出路径：${outputRelativePath}`,
      params.page.imagePath ? `参考图片路径：${params.page.imagePath}` : "参考图片路径：无",
      ...(params.annotations?.length
        ? [
            "",
            "用户在参考图片上的批注：",
            ...params.annotations.map((annotation, index) =>
              [
                `${index + 1}. 批注 ID：${annotation.id}`,
                `   区域：x=${annotation.selection.x}, y=${annotation.selection.y}, width=${annotation.selection.width}, height=${annotation.selection.height}`,
                `   内容：${annotation.note}`
              ].join("\n")
            )
          ]
        : []),
      "",
      "用户输入的当前页面描述：",
      params.prompt.trim() || params.page.uiPrompt,
      "",
      "生成要求：",
      "- 画面为 Pad 横屏 Web/H5 UI 效果图，适合直接用于产品界面设计评审。",
      "- 结合 pages.json 中的同项目页面风格，保持导航、色彩、组件语言一致。",
      "- 图片需要体现真实界面布局、关键组件、状态和主要文案，不要生成抽象插画。",
      "- 不要把 Swift、Python、HTML/CSS、SVG、Canvas、截图脚本或程序化绘图结果当作最终图片；这些只能作为临时辅助，最终 PNG 必须来自图片生成能力。",
      "- 如果存在批注，必须优先基于参考图片和批注内容做定向修改，未批注区域尽量保持原有设计连续性。",
      "- 保存到目标输出路径，并返回 {\"path\":\"目标输出路径\"}。"
    ].join("\n");
  }

  private createSliceIdentificationPrompt(params: IdentifySliceSelectionsParams): string {
    const stableUiPrompt = this.getStablePageUiPrompt(params.page);

    return [
      "你是一个资深 UI 设计资产标注专家。",
      "请读取 pages.json、docs/style.md（如果存在）和当前页面 UI 图片，自动识别适合切成独立素材的 UI 组件区域。",
      "最终只返回符合 JSON Schema 的 JSON：selections 为识别出的切图区域数组。",
      "",
      "上下文文件：pages.json",
      "全局视觉规范文件：docs/style.md（如果存在，必须读取并保持命名与风格判断一致）",
      `当前页面 ID：${params.page.id}`,
      `当前页面名称：${params.page.name}`,
      `当前页面路径：${params.page.route}`,
      `当前 UI 图片路径：${params.sourceImagePath}`,
      "",
      "页面描述：",
      stableUiPrompt,
      "",
      "识别要求：",
      "- 坐标必须使用当前 UI 图片的自然像素坐标，不是浏览器显示坐标。",
      "- 每个区域应覆盖一个可复用 UI 素材主体，并留出必要阴影、描边、发光或装饰边缘。",
      "- 优先识别：背景之外的按钮、卡片、弹窗、图标按钮、品牌标识、引导箭头、角色/装饰物、进度条、可复用面板。",
      "- 不要识别纯背景大块区域；背景已有单独提取功能。",
      "- 不要把多个相互独立的控件合并成一个区域，除非它们视觉上是一个完整组件。",
      "- 不要输出过小、无复用价值、仅文字碎片或临时标注框的区域。",
      "- name 使用简短、明确、可索引的中文名称，例如“开始涂色按钮”“声音按钮”“退出确认弹窗”。",
      "- description 说明该素材的视觉内容、用途、状态和边界注意事项，方便用户确认和后续 AI 切图。",
      "- 返回示例：{\"selections\":[{\"name\":\"开始涂色按钮\",\"description\":\"橙色主操作卡片，包含蜡笔图标与标题，需要保留外发光和阴影。\",\"selection\":{\"x\":100,\"y\":120,\"width\":320,\"height\":180}}]}。"
    ].join("\n");
  }

  private createPageBackgroundPrompt(params: GeneratePageBackgroundParams): string {
    const outputRelativePath = toProjectRelativePath(params.projectRoot, params.outputPath);
    const stableUiPrompt = this.getStablePageUiPrompt(params.page);

    return [
      "你是一个具备图片生成能力的资深 UI 背景资产设计师。",
      "请读取项目根目录下的 pages.json，并参考当前页面 UI 效果图，为指定页面提取或重绘一张可复用的纯背景 PNG。",
      "必须调用 Codex 可用的图片生成工具或内置图片生成能力（例如 image_gen / image generation tool）生成最终位图。",
      "必须直接在项目目录中生成 PNG 图片文件，不要只写 HTML、SVG、Markdown 或代码说明。",
      "最终只返回符合 JSON Schema 的 JSON：path 为生成图片相对项目根目录的路径。",
      "",
      "上下文文件：pages.json",
      "全局视觉规范文件：docs/style.md（如果存在，必须读取并保持一致）",
      `当前页面 ID：${params.page.id}`,
      `当前页面名称：${params.page.name}`,
      `当前页面路径：${params.page.route}`,
      `参考 UI 图片路径：${params.sourceImagePath}`,
      `目标输出路径：${outputRelativePath}`,
      "",
      "页面 UI 提示词：",
      stableUiPrompt,
      "",
      "背景提取要求：",
      "- 输出应是页面背景层，不包含按钮、卡片、弹窗、文本、图标、角色、进度条、选区边框或其他前景 UI 组件。",
      "- 保留参考图中的整体画幅比例、主题氛围、光照、纹理、装饰性环境元素和空间层次。",
      "- 移除前景组件后需要自然补全被遮挡区域，不能留下空洞、残影、文字碎片或组件边缘。",
      "- 背景应适合后续在业务实现中作为页面底图复用，清晰、干净、无水印。",
      "- 如果参考图是 Pad 横屏 UI，输出也保持同样横屏构图。",
      "- 保存到目标输出路径，并返回 {\"path\":\"目标输出路径\"}。"
    ].join("\n");
  }

  private createSliceAssetsPrompt(params: GenerateSliceAssetsParams): string {
    const stableUiPrompt = this.getStablePageUiPrompt(params.page);

    return [
      "Use $ai-product-sprite-slicer to generate these UI slice assets.",
      "你是一个具备图片生成能力的 UI 素材设计师。",
      "请读取 pages.json，并参考源界面图片、页面原始 UI 提示词和用户框选区域，为当前页面批量生成独立精修 PNG 素材。",
      "必须按 ai-product-sprite-slicer skill 的流程执行：一次生成 sprite sheet + manifest，再用 skill 内置 split_sprite_sheet.py 拆分为多个 PNG。",
      "必须调用 Codex 可用的图片生成工具或内置图片生成能力（例如 image_gen / image generation tool）生成 sprite sheet；不要对每个区域单独调用图片生成。",
      "必须直接在项目目录中生成 PNG 图片文件，不要只写 HTML、SVG、Markdown 或代码说明。",
      "最终只返回符合 JSON Schema 的 JSON：assets 为素材结果数组，每项包含 selectionId、path、name、description。",
      "禁止输出进度 JSON 或 status 占位 JSON；中间进度只能用普通文本日志，最终 JSON 只能输出一次。",
      "",
      "上下文文件：pages.json",
      "全局视觉规范文件：docs/style.md（如果存在，必须读取并保持一致）",
      `当前页面 ID：${params.page.id}`,
      `当前页面名称：${params.page.name}`,
      `当前页面路径：${params.page.route}`,
      "",
      "原始界面提示词：",
      stableUiPrompt,
      "",
      "待生成切图区域：",
      ...params.items.map((item, index) =>
        [
          `${index + 1}. 切图区域 ID：${item.sliceSelection.id}`,
          `   临时素材名称：${item.sliceSelection.name}`,
          `   源图路径：${item.sourceImagePath}`,
          `   框选区域：x=${item.selection.x}, y=${item.selection.y}, width=${item.selection.width}, height=${item.selection.height}`,
          item.instruction ? `   本次切图备注：${item.instruction}` : "",
          `   目标输出路径：${toProjectRelativePath(params.projectRoot, item.outputPath)}`
        ].filter(Boolean).join("\n")
      ),
      "",
      "生成要求：",
      "- 对全部切图区域批量生成独立可复用的 PNG 素材，视觉风格与源界面一致。",
      "- 优先生成单张 4096x4096 透明背景 sprite sheet；如果放不下，再拆成多张 sprite sheet。不要回退成每个区域一张独立生图。",
      "- 这不是普通裁剪任务，也不是代码绘图任务；不要把 sips、Swift、Python、ImageMagick、HTML/CSS、SVG、Canvas、截图脚本或程序化绘图结果当作最终素材。",
      "- 必须基于框选区域进行 AI 精修或重绘，补齐边缘、透明背景和独立素材细节，使输出适合作为后续页面实现的设计资产。",
      "- 如果某个区域有“本次切图备注”，必须优先按备注修正，例如补上漏切内容、去掉多切内容、保留/移除指定状态或边缘。",
      "- 如果确实需要写临时脚本或中间文件，只能写入系统临时目录，任务完成前必须清理；不要在项目根目录、tmp/、docs/、assets/ 中留下临时代码文件。",
      "- 先根据源图和框选坐标判断每个区域真实代表的 UI 元素，不要照搬原始界面提示词作为素材描述。",
      "- 保持主体清晰，边缘干净，适合后续切图管理。",
      "- name 使用简短、明确、可索引的中文名称，例如“开始涂色按钮”“退出确认弹窗”。",
      "- description 准确说明素材的视觉内容、用途、状态和适用页面，方便后续 AI 根据描述重建业务页面。",
      "- 每个素材必须保存到对应目标输出路径，返回的 selectionId 必须与输入区域 ID 一一对应。",
      "- 返回示例：{\"assets\":[{\"selectionId\":\"selection_xxx\",\"path\":\"assets/slices/page_xxx/asset_xxx.png\",\"name\":\"素材名称\",\"description\":\"素材描述\"}]}。"
    ].join("\n");
  }

  private getStablePageUiPrompt(page: PageMeta): string {
    return this.stripImageAnnotationText(page.uiPrompt).trim() || page.description || page.uiPrompt;
  }

  private stripImageAnnotationText(input: string): string {
    const lines = input.split(/\r?\n/u);
    const kept: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();

      if (/^针对参考图片\s+.+\s+的批注：?$/u.test(line)) {
        index += 1;

        while (index < lines.length && lines[index].trim() !== "") {
          index += 1;
        }

        continue;
      }

      kept.push(lines[index]);
    }

    return kept.join("\n").replace(/\n{3,}/gu, "\n\n").trim();
  }

  private withRunOptions(args: string[], options: CodexImageStreamOptions): string[] {
    if (!this.isCodexCommand()) {
      return args;
    }

    const model = options.model || process.env.CODEX_IMAGE_MODEL || "gpt-5.5";
    const reasoningEffort = options.reasoningEffort || "high";
    const filteredArgs = this.removeOverriddenCodexArgs(args);

    return [
      ...filteredArgs,
      "--model",
      model,
      "--config",
      `model_reasoning_effort="${reasoningEffort}"`
    ];
  }

  private removeOverriddenCodexArgs(args: string[]): string[] {
    const next: string[] = [];

    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];

      if (arg === "--model" || arg === "-m") {
        index += 1;
        continue;
      }

      if (arg.startsWith("--model=")) {
        continue;
      }

      if ((arg === "--config" || arg === "-c") && this.isReasoningEffortConfig(args[index + 1])) {
        index += 1;
        continue;
      }

      if (arg.startsWith("--config=") && this.isReasoningEffortConfig(arg.slice("--config=".length))) {
        continue;
      }

      next.push(arg);
    }

    return next;
  }

  private isReasoningEffortConfig(value: string | undefined): boolean {
    return Boolean(value?.trim().startsWith("model_reasoning_effort="));
  }

  private isCodexCommand(): boolean {
    return path.basename(this.options.command).toLowerCase() === "codex";
  }

  private async appendCommandResult(logPath: string, stdout: string, stderr: string): Promise<void> {
    await this.appendLog(logPath, ["", "[stdout]", stdout || "(empty)", "", "[stderr]", stderr || "(empty)", ""].join("\n"));
  }

  private async appendLog(logPath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  }

  private emitStream(
    streamOptions: CodexImageStreamOptions,
    level: AiStreamLevel,
    message: string
  ): void {
    const normalized = this.filterStreamMessage(level, message);

    if (!normalized) {
      return;
    }

    streamOptions.onEvent?.(level, normalized.length > 1600 ? `${normalized.slice(0, 1600)}...` : normalized);
  }

  private filterStreamMessage(level: AiStreamLevel, message: string): string {
    const normalized = message.trim();

    if (!normalized) {
      return "";
    }

    if (level === "status" || level === "complete" || level === "error") {
      return normalized;
    }

    return normalized
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !this.isNoisyCodexLine(line))
      .join("\n");
  }

  private isNoisyCodexLine(line: string): boolean {
    const noisePatterns = [
      /^WARNING: proceeding, even though we could not update PATH:/u,
      /\bWARN\b.*codex_core::plugins::manifest:/u,
      /\bWARN\b.*codex_core_plugins::manifest:/u,
      /\bWARN\b.*codex_core_skills::loader:/u,
      /\bWARN\b.*codex_rmcp_client::/u,
      /\bWARN\b.*codex_mcp::rmcp_client:/u,
      /\bWARN\b.*codex_core::protocol:/u,
      /\bWARN\b.*codex_core::plugins::manager:/u,
      /\bWARN\b.*codex_core::session_startup_prewarm:/u,
      /\bWARN\b.*codex_state::runtime:/u,
      /\bWARN\b.*codex_rollout::/u,
      /\bERROR\b.*codex_core_skills::manager:/u,
      /\bERROR\b.*codex_core::codex: failed to load skill/u,
      /\bERROR\b.*codex_core::session: failed to load skill/u,
      /migration \d+ was previously applied/u,
      /state db discrepancy/u,
      /failed to warm featured plugin ids cache/u,
      /failed to load plugin: plugin is not installed/u,
      /Failed to terminate MCP process group/u,
      /failed to initialize MCP client during shutdown/u,
      /ignoring interface\.icon_(small|large):/u,
      /ignoring interface\.defaultPrompt:/u,
      /\/\.codex\/tmp\/plugins\//u,
      /\/\.codex\/\.tmp\/plugins\//u,
      /\/\.codex\/state_\d+\.sqlite/u,
      /prompt must be at most \d+ characters/u,
      /maximum of \d+ prompts is supported/u
    ];

    return noisePatterns.some((pattern) => pattern.test(line));
  }

  private formatUserFacingError(error: unknown): string {
    const text = this.formatErrorForLog(error);

    if (text.includes("requires a newer version of Codex")) {
      return "图片生成失败：当前 Codex CLI 不支持所选模型，请升级 CLI，或切换到 GPT-5.4";
    }

    if (text.includes("命令执行超时")) {
      return "图片生成失败：Codex 调用超时";
    }

    if (text.includes("未生成有效图片文件")) {
      return "图片生成失败：Codex 未写入有效图片文件";
    }

    return "图片生成失败";
  }

  private formatErrorForLog(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    return String(error);
  }
}
