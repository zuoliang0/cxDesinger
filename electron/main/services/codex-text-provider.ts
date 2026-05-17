import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type {
  AiStreamLevel,
  AppSettings,
  CodexModel,
  CodexReasoningEffort,
  DocumentCreationOutput,
  DocumentRevisionOutput,
  PagePlanSyncOutput,
  PlanningOutput
} from "../../../src/shared/types";
import {
  documentCreationOutputSchema,
  documentRevisionOutputSchema,
  pagePlanSyncOutputSchema,
  planningOutputSchema
} from "../../../src/shared/validation";
import { createMissingCodexCliMessage, createCodexProcessEnv, resolveCodexCommand } from "../utils/codex-command";
import { runProcess } from "../utils/process";

const PLANNING_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["conversationMarkdown", "documents", "pages"],
  properties: {
    conversationMarkdown: { type: "string", minLength: 1 },
    documents: {
      type: "object",
      additionalProperties: false,
      required: ["prd", "featurePlan", "technicalPlan", "styleGuide", "animationList", "pagePlan", "featureList"],
      properties: {
        prd: { type: "string", minLength: 1 },
        featurePlan: { type: "string", minLength: 1 },
        technicalPlan: { type: "string", minLength: 1 },
        styleGuide: { type: "string", minLength: 1 },
        animationList: { type: "string" },
        pagePlan: { type: "string", minLength: 1 },
        featureList: { type: "string", minLength: 1 }
      }
    },
    pages: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "route", "description", "uiPrompt"],
        properties: {
          name: { type: "string", minLength: 1 },
          route: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          uiPrompt: { type: "string", minLength: 1 }
        }
      }
    }
  }
};

const DOCUMENT_REVISION_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["content", "summary"],
  properties: {
    content: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1 }
  }
};

const DOCUMENT_CREATION_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "fileName", "content", "summary"],
  properties: {
    title: { type: "string", minLength: 1 },
    fileName: { type: "string", minLength: 1 },
    content: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1 }
  }
};

const PAGE_PLAN_SYNC_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pages", "summary"],
  properties: {
    pages: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "route", "description", "uiPrompt"],
        properties: {
          name: { type: "string", minLength: 1 },
          route: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          uiPrompt: { type: "string", minLength: 1 }
        }
      }
    },
    summary: { type: "string", minLength: 1 }
  }
};

export interface CodexTextProviderOptions {
  command: string;
  args: string[];
  timeoutMs: number;
}

export interface CodexStreamOptions {
  onEvent?: (level: AiStreamLevel, message: string) => void;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
  referenceImagePaths?: string[];
  signal?: AbortSignal;
}

export class CodexTextProvider {
  constructor(private readonly options: CodexTextProviderOptions) {}

  static fromSettings(settings: AppSettings): CodexTextProvider {
    return new CodexTextProvider(settings.codex);
  }

  async runPlanning(
    projectRoot: string,
    requirement: string,
    projectType: "web" | "app" = "web",
    streamOptions: CodexStreamOptions = {}
  ): Promise<PlanningOutput> {
    const schemaPath = path.join(os.tmpdir(), `planning-output-${randomUUID()}.schema.json`);
    const outputPath = path.join(os.tmpdir(), `planning-output-${randomUUID()}.json`);
    const logRelativePath = `logs/planning-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    const logPath = path.join(projectRoot, logRelativePath);
    const args = [
      ...this.withRunOptions(this.options.args, streamOptions, projectRoot),
      "exec",
      "--cd",
      projectRoot,
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      "-"
    ];
    const env = createCodexProcessEnv();
    let command = this.options.command;
    let stdout = "";
    let stderr = "";

    await fs.writeFile(schemaPath, JSON.stringify(PLANNING_OUTPUT_JSON_SCHEMA, null, 2), "utf8");
    this.emitStream(streamOptions, "status", "正在启动整套规划任务");
    await this.appendLog(logPath, [
      `time=${new Date().toISOString()}`,
      `cwd=${projectRoot}`,
      `command=${command}`,
      `args=${args.join(" ")}`,
      `referenceImages=${this.normalizeReferenceImagePaths(projectRoot, streamOptions.referenceImagePaths).join(", ") || "(none)"}`,
      "",
      "[prompt]",
      requirement,
      ""
    ].join("\n"));

    try {
      this.emitStream(streamOptions, "status", "正在调用 Codex 生成结构化规划");
      command = await resolveCodexCommand(this.options.command, env.PATH || "");
      const result = await runProcess({
        command,
        args,
        env,
        stdin: this.createPlanningPrompt(requirement, projectType),
        timeoutMs: this.options.timeoutMs,
        signal: streamOptions.signal,
        onStdout: (chunk) => this.emitStream(streamOptions, "stdout", chunk),
        onStderr: (chunk) => this.emitStream(streamOptions, "stderr", chunk)
      });
      stdout = result.stdout;
      stderr = result.stderr;
      await this.appendCommandResult(logPath, stdout, stderr);

      const raw = await fs.readFile(outputPath, "utf8");
      await this.appendLog(logPath, ["", "[output-last-message]", raw, ""].join("\n"));
      const parsed = planningOutputSchema.parse(JSON.parse(raw)) as PlanningOutput;
      await this.appendLog(logPath, "status=success\n");
      this.emitStream(streamOptions, "complete", "整套规划已生成");
      return parsed;
    } catch (error) {
      const maybeProcessError = error as { stdout?: string; stderr?: string };
      stdout = maybeProcessError.stdout || stdout;
      stderr = maybeProcessError.stderr || stderr;
      await this.appendCommandResult(logPath, stdout, stderr);
      await this.appendLog(logPath, `status=failed\nerror=${this.formatErrorForLog(error)}\n`);
      this.emitStream(streamOptions, "error", this.formatUserFacingError(error, "产品规划生成"));
      throw new Error(`${this.formatUserFacingError(error, "产品规划生成")}。详细日志：${logRelativePath}`);
    } finally {
      await Promise.allSettled([fs.rm(schemaPath, { force: true }), fs.rm(outputPath, { force: true })]);
    }
  }

  async reviseDocument(
    projectRoot: string,
    documentPath: string,
    instruction: string,
    streamOptions: CodexStreamOptions = {}
  ): Promise<DocumentRevisionOutput> {
    const schemaPath = path.join(os.tmpdir(), `document-revision-${randomUUID()}.schema.json`);
    const outputPath = path.join(os.tmpdir(), `document-revision-${randomUUID()}.json`);
    const logRelativePath = `logs/document-revision-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    const logPath = path.join(projectRoot, logRelativePath);
    const args = [
      ...this.withRunOptions(this.options.args, streamOptions, projectRoot),
      "exec",
      "--cd",
      projectRoot,
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      "-"
    ];
    const env = createCodexProcessEnv();
    let command = this.options.command;
    let stdout = "";
    let stderr = "";

    await fs.writeFile(schemaPath, JSON.stringify(DOCUMENT_REVISION_OUTPUT_JSON_SCHEMA, null, 2), "utf8");
    this.emitStream(streamOptions, "status", `正在启动文档修改任务：${documentPath}`);
    await this.appendLog(logPath, [
      `time=${new Date().toISOString()}`,
      `cwd=${projectRoot}`,
      `document=${documentPath}`,
      `command=${command}`,
      `args=${args.join(" ")}`,
      `referenceImages=${this.normalizeReferenceImagePaths(projectRoot, streamOptions.referenceImagePaths).join(", ") || "(none)"}`,
      "",
      "[instruction]",
      instruction,
      ""
    ].join("\n"));

    try {
      this.emitStream(streamOptions, "status", "正在调用 Codex 修改当前文档");
      command = await resolveCodexCommand(this.options.command, env.PATH || "");
      const result = await runProcess({
        command,
        args,
        env,
        stdin: this.createDocumentRevisionPrompt(documentPath, instruction),
        timeoutMs: this.options.timeoutMs,
        signal: streamOptions.signal,
        onStdout: (chunk) => this.emitStream(streamOptions, "stdout", chunk),
        onStderr: (chunk) => this.emitStream(streamOptions, "stderr", chunk)
      });
      stdout = result.stdout;
      stderr = result.stderr;
      await this.appendCommandResult(logPath, stdout, stderr);

      const raw = await fs.readFile(outputPath, "utf8");
      await this.appendLog(logPath, ["", "[output-last-message]", raw, ""].join("\n"));
      const parsed = documentRevisionOutputSchema.parse(JSON.parse(raw)) as DocumentRevisionOutput;
      await this.appendLog(logPath, "status=success\n");
      this.emitStream(streamOptions, "complete", `当前文档已修改：${documentPath}`);
      return parsed;
    } catch (error) {
      const maybeProcessError = error as { stdout?: string; stderr?: string };
      stdout = maybeProcessError.stdout || stdout;
      stderr = maybeProcessError.stderr || stderr;
      await this.appendCommandResult(logPath, stdout, stderr);
      await this.appendLog(logPath, `status=failed\nerror=${this.formatErrorForLog(error)}\n`);
      this.emitStream(streamOptions, "error", this.formatUserFacingError(error, "文档修改"));
      throw new Error(`${this.formatUserFacingError(error, "文档修改")}。详细日志：${logRelativePath}`);
    } finally {
      await Promise.allSettled([fs.rm(schemaPath, { force: true }), fs.rm(outputPath, { force: true })]);
    }
  }

  async createDocument(
    projectRoot: string,
    instruction: string,
    streamOptions: CodexStreamOptions = {}
  ): Promise<DocumentCreationOutput> {
    const schemaPath = path.join(os.tmpdir(), `document-creation-${randomUUID()}.schema.json`);
    const outputPath = path.join(os.tmpdir(), `document-creation-${randomUUID()}.json`);
    const logRelativePath = `logs/document-creation-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    const logPath = path.join(projectRoot, logRelativePath);
    const args = [
      ...this.withRunOptions(this.options.args, streamOptions, projectRoot),
      "exec",
      "--cd",
      projectRoot,
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      "-"
    ];
    const env = createCodexProcessEnv();
    let command = this.options.command;
    let stdout = "";
    let stderr = "";

    await fs.writeFile(schemaPath, JSON.stringify(DOCUMENT_CREATION_OUTPUT_JSON_SCHEMA, null, 2), "utf8");
    this.emitStream(streamOptions, "status", "正在启动新建文档任务");
    await this.appendLog(logPath, [
      `time=${new Date().toISOString()}`,
      `cwd=${projectRoot}`,
      `command=${command}`,
      `args=${args.join(" ")}`,
      `referenceImages=${this.normalizeReferenceImagePaths(projectRoot, streamOptions.referenceImagePaths).join(", ") || "(none)"}`,
      "",
      "[instruction]",
      instruction,
      ""
    ].join("\n"));

    try {
      this.emitStream(streamOptions, "status", "正在调用 Codex 生成新文档");
      command = await resolveCodexCommand(this.options.command, env.PATH || "");
      const result = await runProcess({
        command,
        args,
        env,
        stdin: this.createDocumentCreationPrompt(instruction),
        timeoutMs: this.options.timeoutMs,
        signal: streamOptions.signal,
        onStdout: (chunk) => this.emitStream(streamOptions, "stdout", chunk),
        onStderr: (chunk) => this.emitStream(streamOptions, "stderr", chunk)
      });
      stdout = result.stdout;
      stderr = result.stderr;
      await this.appendCommandResult(logPath, stdout, stderr);

      const raw = await fs.readFile(outputPath, "utf8");
      await this.appendLog(logPath, ["", "[output-last-message]", raw, ""].join("\n"));
      const parsed = documentCreationOutputSchema.parse(JSON.parse(raw)) as DocumentCreationOutput;
      await this.appendLog(logPath, "status=success\n");
      this.emitStream(streamOptions, "complete", "新文档已生成");
      return parsed;
    } catch (error) {
      const maybeProcessError = error as { stdout?: string; stderr?: string };
      stdout = maybeProcessError.stdout || stdout;
      stderr = maybeProcessError.stderr || stderr;
      await this.appendCommandResult(logPath, stdout, stderr);
      await this.appendLog(logPath, `status=failed\nerror=${this.formatErrorForLog(error)}\n`);
      this.emitStream(streamOptions, "error", this.formatUserFacingError(error, "新建文档"));
      throw new Error(`${this.formatUserFacingError(error, "新建文档")}。详细日志：${logRelativePath}`);
    } finally {
      await Promise.allSettled([fs.rm(schemaPath, { force: true }), fs.rm(outputPath, { force: true })]);
    }
  }

  async syncPagePlan(
    projectRoot: string,
    pagePlanPath: string,
    streamOptions: CodexStreamOptions = {}
  ): Promise<PagePlanSyncOutput> {
    const schemaPath = path.join(os.tmpdir(), `page-plan-sync-${randomUUID()}.schema.json`);
    const outputPath = path.join(os.tmpdir(), `page-plan-sync-${randomUUID()}.json`);
    const logRelativePath = `logs/page-plan-sync-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    const logPath = path.join(projectRoot, logRelativePath);
    const args = [
      ...this.withRunOptions(this.options.args, streamOptions, projectRoot),
      "exec",
      "--cd",
      projectRoot,
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      "-"
    ];
    const env = createCodexProcessEnv();
    let command = this.options.command;
    let stdout = "";
    let stderr = "";

    await fs.writeFile(schemaPath, JSON.stringify(PAGE_PLAN_SYNC_OUTPUT_JSON_SCHEMA, null, 2), "utf8");
    this.emitStream(streamOptions, "status", "正在启动页面规划同步任务");
    await this.appendLog(logPath, [
      `time=${new Date().toISOString()}`,
      `cwd=${projectRoot}`,
      `pagePlan=${pagePlanPath}`,
      "pagesJson=pages.json",
      `command=${command}`,
      `args=${args.join(" ")}`,
      `referenceImages=${this.normalizeReferenceImagePaths(projectRoot, streamOptions.referenceImagePaths).join(", ") || "(none)"}`,
      "",
      "[instruction]",
      "read page plan and pages.json from the project root, then output normalized pages metadata",
      ""
    ].join("\n"));

    try {
      this.emitStream(streamOptions, "status", "正在调用 Codex 提取页面规划");
      command = await resolveCodexCommand(this.options.command, env.PATH || "");
      const result = await runProcess({
        command,
        args,
        env,
        stdin: this.createPagePlanSyncPrompt(pagePlanPath),
        timeoutMs: this.options.timeoutMs,
        signal: streamOptions.signal,
        onStdout: (chunk) => this.emitStream(streamOptions, "stdout", chunk),
        onStderr: (chunk) => this.emitStream(streamOptions, "stderr", chunk)
      });
      stdout = result.stdout;
      stderr = result.stderr;
      await this.appendCommandResult(logPath, stdout, stderr);

      const raw = await fs.readFile(outputPath, "utf8");
      await this.appendLog(logPath, ["", "[output-last-message]", raw, ""].join("\n"));
      const parsed = pagePlanSyncOutputSchema.parse(JSON.parse(raw)) as PagePlanSyncOutput;
      await this.appendLog(logPath, "status=success\n");
      this.emitStream(streamOptions, "complete", "页面规划已提取");
      return parsed;
    } catch (error) {
      const maybeProcessError = error as { stdout?: string; stderr?: string };
      stdout = maybeProcessError.stdout || stdout;
      stderr = maybeProcessError.stderr || stderr;
      await this.appendCommandResult(logPath, stdout, stderr);
      await this.appendLog(logPath, `status=failed\nerror=${this.formatErrorForLog(error)}\n`);
      this.emitStream(streamOptions, "error", this.formatUserFacingError(error, "页面规划同步"));
      throw new Error(`${this.formatUserFacingError(error, "页面规划同步")}。详细日志：${logRelativePath}`);
    } finally {
      await Promise.allSettled([fs.rm(schemaPath, { force: true }), fs.rm(outputPath, { force: true })]);
    }
  }

  private withRunOptions(args: string[], options: CodexStreamOptions, projectRoot: string): string[] {
    if (!this.isCodexCommand()) {
      return args;
    }

    const model = options.model || process.env.CODEX_PLANNING_MODEL || "gpt-5.5";
    const reasoningEffort = options.reasoningEffort || "high";
    const filteredArgs = this.removeOverriddenCodexArgs(args);

    return [
      ...filteredArgs,
      ...this.toCodexImageArgs(projectRoot, options.referenceImagePaths),
      "--model",
      model,
      "--config",
      `model_reasoning_effort="${reasoningEffort}"`
    ];
  }

  private toCodexImageArgs(projectRoot: string, referenceImagePaths: string[] | undefined): string[] {
    return this.normalizeReferenceImagePaths(projectRoot, referenceImagePaths).flatMap((imagePath) => [
      "-i",
      imagePath
    ]);
  }

  private normalizeReferenceImagePaths(projectRoot: string, referenceImagePaths: string[] | undefined): string[] {
    const root = path.resolve(projectRoot);
    const unique = new Set<string>();

    for (const imagePath of referenceImagePaths || []) {
      const trimmed = imagePath.trim();

      if (!trimmed) {
        continue;
      }

      const resolved = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(root, trimmed);
      const relative = path.relative(root, resolved);

      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("参考图片必须位于项目根目录内");
      }

      unique.add(resolved);
    }

    return [...unique];
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

  private createPlanningPrompt(requirement: string, projectType: "web" | "app"): string {
    return [
      "你是一个资深产品经理、UI 信息架构师和技术方案设计师。",
      "请基于用户需求生成结构化项目规划，最终只返回符合 JSON Schema 的 JSON。",
      "如果本次命令通过 -i 附加了参考图片，请把图片内容作为产品规划、视觉风格和页面规划的参考，但不要臆造与用户需求冲突的业务设定。",
      `项目类型：${projectType === "app" ? "APP" : "WEB"}`,
      "需要覆盖：沟通记录、PRD、功能规划、技术方案、全局视觉风格规范、页面规划、功能清单。",
      "documents.styleGuide 将写入 docs/style.md，作为后续所有页面图片生成的统一视觉规范。",
      "styleGuide 必须明确：目标用户与情绪、画幅与布局密度、色彩系统、字体层级、组件形态、图标/插画风格、动效/状态表达、禁用风格和跨页面一致性规则。",
      "默认 UI 与技术栈规则：如果用户没有明确指定 UI 框架、设计库或技术栈，WEB/桌面端/管理后台默认采用 React + TypeScript + Vite + Ant Design；移动 APP/H5 默认采用 React + TypeScript + Vite + Ant Design Mobile；默认使用执行时可获得的 Ant Design 最新稳定版本（当前官方文档参考版本为 6.3.7），若项目依赖已有更高稳定版本则以项目依赖为准。",
      "默认设计规范规则：如果用户没有明确指定其它设计体系，styleGuide 和所有 uiPrompt 必须遵守 Ant Design 官方设计规范 https://ant.design/docs/spec/overview-cn/ 的核心规则：服务企业级业务，优先保持确定性、一致性、可复用和研发效率；使用 Ant Design 的全局样式体系组织色彩、布局、字体、图标、暗黑模式与阴影；页面模式要优先参考反馈、导航、数据录入、数据展示、数据格式、文案、按钮、数据列表等全局规则；布局与交互要体现亲密性、对齐、对比、重复、直截了当、足不出户、简化交互、提供邀请、巧用过渡、即时反应等原则。",
      "默认实现方案规则：技术方案中需要明确 Ant Design/Ant Design Mobile 的组件选型、主题 token、表单/表格/列表/反馈/导航/空状态/异常状态的实现方式；不要在未获用户要求时引入与 Ant Design 冲突的重型 UI 库或一套完全不同的视觉语言。",
      "代码实现阶段规则：技术方案中必须注明，后续使用 Codex 编写 Ant Design 代码时，应先阅读并理解 https://ant.design/llms-full.txt；组件 API、Props、Design Token、Semantic DOM、版本说明和示例应以该官方 LLM 文档为准，不要凭记忆使用过期 API。",
      projectType === "app"
        ? "这是 APP 项目，documents.animationList 必须生成并写入 docs/animation-list.md，内容要覆盖页面转场、组件动效、手势反馈、加载/空/错误状态动画、关键业务流程动效和开发实现注意事项。"
        : "这是 WEB 项目，documents.animationList 仍必须作为字段返回；除非用户明确要求动效清单，否则请返回空字符串。",
      "pages 数组必须可直接写入 pages.json，每个页面包含 name、route、description、uiPrompt。",
      "uiPrompt 用于后续生成界面 UI 图片，必须具体描述布局、层级、关键组件和状态；视觉风格要引用 styleGuide 的统一规则，避免每个页面各写一套冲突风格。",
      "",
      "用户需求：",
      requirement
    ].join("\n");
  }

  private createDocumentRevisionPrompt(
    documentPath: string,
    instruction: string
  ): string {
    return [
      "你是一个资深产品文档编辑助手。",
      "请只根据用户修改意见更新当前这一份 Markdown 文档，不要生成或改写其它文档。",
      "如果本次命令通过 -i 附加了参考图片，请结合图片内容理解用户修改意见，并在当前文档中准确体现相关调整。",
      "当前工作目录是项目根目录；如需了解现有内容，请自行读取下面给出的相对路径文件。",
      "保留文档原有结构中仍然有效的内容；只做用户要求的补充、删改、重排或语气调整。",
      "最终只返回符合 JSON Schema 的 JSON：content 为完整的新 Markdown 文档，summary 为本次修改摘要。",
      "",
      `文档路径：${documentPath}`,
      "",
      "用户修改意见：",
      instruction
    ].join("\n");
  }

  private createDocumentCreationPrompt(instruction: string): string {
    return [
      "你是一个资深产品文档作者。",
      "请根据用户输入，新建一份 Markdown 文档。",
      "当前工作目录是项目根目录；必须先读取 pages.json，了解项目名称、项目类型和已有文档列表。",
      "请按需要自行读取 docs/ 下已有相关文档，参考其术语、业务背景、结构、视觉规范、页面规划和功能口径，保持一致。",
      "不要修改已有文件；只生成新文档的结构化结果。",
      "如果本次命令通过 -i 附加了参考图片，请结合图片内容理解用户想新增的文档范围。",
      "最终只返回符合 JSON Schema 的 JSON：title 为文档标题，fileName 为建议的英文 kebab-case Markdown 文件名，content 为完整 Markdown 内容，summary 为生成摘要。",
      "fileName 只允许文件名，不要包含 docs/ 或其它目录；必须以 .md 结尾。",
      "",
      "用户新增文档需求：",
      instruction
    ].join("\n");
  }

  private createPagePlanSyncPrompt(pagePlanPath: string): string {
    return [
      "你是一个资深产品信息架构师。",
      "请根据项目根目录下的页面规划文档、pages.json 项目索引和现有页面数据目录，输出完整页面数组。",
      "只返回符合 JSON Schema 的 JSON，不要输出 Markdown 或解释性文本。",
      "不要在提示词中依赖内嵌文档内容；请自行读取下面给出的相对路径文件。",
      "必须读取 pages.json 的 project.type、project.name、pages[].dataDir 和 docs/style.md（如果存在），并保持页面规划与当前项目类型、目标用户和视觉规范一致。",
      "如需了解某个旧页面的完整 uiPrompt、图片路径或已有素材，只读取对应 pages/<pageId>/page.json、assets.json、slice-selections.json；不要读取无关页面目录。",
      "需要保留语义稳定的页面 route；route 必须以 / 开头。",
      "每个页面必须包含 name、route、description、uiPrompt。",
      "uiPrompt 用于生成界面图片，必须描述页面布局、关键组件、交互状态、视觉风格、适配平台和响应式/设备适配要点。",
      "不得引入与当前项目无关的领域设定、目标用户、设备类型或视觉风格。",
      "不要输出 imagePath、assetIds、needUpdate 或 assets；这些字段由主进程按现有 pages.json 合并。",
      "",
      `页面规划文档路径：${pagePlanPath}`,
      "项目索引路径：pages.json",
      "页面数据目录：pages/<pageId>/",
      "全局视觉规范路径：docs/style.md"
    ].join("\n");
  }

  private async appendCommandResult(logPath: string, stdout: string, stderr: string): Promise<void> {
    await this.appendLog(logPath, ["", "[stdout]", stdout || "(empty)", "", "[stderr]", stderr || "(empty)", ""].join("\n"));
  }

  private async appendLog(logPath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  }

  private emitStream(
    streamOptions: CodexStreamOptions,
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

  private formatUserFacingError(error: unknown, action: string): string {
    const text = this.formatErrorForLog(error);

    if (text.includes("requires a newer version of Codex")) {
      return `${action}失败：当前 Codex CLI 不支持所选模型，请升级 CLI，或切换到 GPT-5.4`;
    }

    if (text.includes("命令执行超时")) {
      return `${action}失败：Codex 调用超时`;
    }

    if (text.includes("找不到 Codex 可执行文件") || text.includes("spawn codex ENOENT")) {
      return `${action}失败：${createMissingCodexCliMessage(this.options.command)}`;
    }

    if (text.includes("output-last-message")) {
      return `${action}失败：Codex 未返回有效结构化结果`;
    }

    return `${action}失败`;
  }

  private formatErrorForLog(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    return String(error);
  }
}
