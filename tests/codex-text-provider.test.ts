import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CodexTextProvider } from "../electron/main/services/codex-text-provider";

async function makeCodexShim(fixturePath: string): Promise<string> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "fake-codex-bin-"));
  const commandPath = path.join(rootDir, "codex");

  await fs.writeFile(commandPath, `#!/usr/bin/env node\nrequire(${JSON.stringify(fixturePath)});\n`, "utf8");
  await fs.chmod(commandPath, 0o755);
  return commandPath;
}

describe("CodexTextProvider", () => {
  it("uses Ant Design as the default UI and design system in planning prompts", () => {
    const provider = new CodexTextProvider({
      command: process.execPath,
      args: [],
      proxy: "",
      timeoutMs: 5_000
    });
    const prompt = (provider as unknown as {
      createPlanningPrompt: (requirement: string, projectType: "web" | "app") => string;
    }).createPlanningPrompt("做一个设备管理系统", "web");

    expect(prompt).toContain("React + TypeScript + Vite + Ant Design");
    expect(prompt).toContain("最新稳定版本");
    expect(prompt).toContain("6.3.7");
    expect(prompt).toContain("https://ant.design/docs/spec/overview-cn/");
    expect(prompt).toContain("https://ant.design/llms-full.txt");
    expect(prompt).toContain("组件 API、Props、Design Token、Semantic DOM");
    expect(prompt).toContain("亲密性、对齐、对比、重复");
    expect(prompt).toContain("反馈、导航、数据录入、数据展示");
  });

  it("parses structured planning output from codex exec", async () => {
    const provider = new CodexTextProvider({
      command: process.execPath,
      args: [path.resolve("tests/fixtures/fake-codex.cjs")],
      proxy: "",
      timeoutMs: 5_000
    });

    const output = await provider.runPlanning(process.cwd(), "做一个 AI 产品设计工具");

    expect(output.documents.prd).toContain("PRD");
    expect(output.documents.styleGuide).toContain("视觉规范");
    expect(output.pages[0]).toMatchObject({
      name: "项目首页",
      route: "/projects"
    });
  });

  it("passes project reference images to codex with -i arguments", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "text-reference-project-"));
    const command = await makeCodexShim(path.resolve("tests/fixtures/fake-codex.cjs"));
    const provider = new CodexTextProvider({
      command,
      args: [],
      proxy: "",
      timeoutMs: 5_000
    });
    const referencePath = path.join(projectRoot, "tmp/reference-images/ref.png");

    await fs.mkdir(path.dirname(referencePath), { recursive: true });
    await fs.writeFile(referencePath, "fake image");

    await provider.runPlanning(projectRoot, "做一个参考图片驱动的应用", "web", {
      referenceImagePaths: ["tmp/reference-images/ref.png"]
    });

    const logDir = path.join(projectRoot, "logs");
    const [logFile] = await fs.readdir(logDir);
    const log = await fs.readFile(path.join(logDir, logFile), "utf8");

    expect(log).toContain(`-i ${referencePath}`);
    expect(log).toContain(`referenceImages=${referencePath}`);
  });

  it("parses document revision output and streams process chunks", async () => {
    const command = await makeCodexShim(path.resolve("tests/fixtures/fake-doc-codex.cjs"));
    const provider = new CodexTextProvider({
      command,
      args: [],
      proxy: "",
      timeoutMs: 5_000
    });
    const events: Array<{ level: string; message: string }> = [];

    const output = await provider.reviseDocument(
      process.cwd(),
      "docs/prd.md",
      "补充儿童涂色流程",
      {
        model: "gpt-5.4",
        reasoningEffort: "high",
        onEvent: (level, message) => events.push({ level, message })
      }
    );

    expect(output).toMatchObject({
      content: expect.stringContaining("已按修改意见更新当前文档"),
      summary: "高思考 gpt-5.4"
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "stdout", message: expect.stringContaining("revising markdown") }),
        expect.objectContaining({ level: "stderr", message: expect.stringContaining("progress detail") }),
        expect.objectContaining({ level: "complete" })
      ])
    );
    expect(events.map((event) => event.message).join("\n")).not.toContain("codex_core::plugins::manifest");
    expect(events.map((event) => event.message).join("\n")).not.toContain("codex_core_skills::loader");
    expect(events.map((event) => event.message).join("\n")).not.toContain("codex_rmcp_client::stdio_server_launcher");
    expect(events.map((event) => event.message).join("\n")).not.toContain("icon path must not contain");
    expect(events.map((event) => event.message).join("\n")).not.toContain("Failed to terminate MCP process group");
    expect(events.map((event) => event.message).join("\n")).not.toContain("could not update PATH");
  });

  it("parses document creation output from codex exec", async () => {
    const command = await makeCodexShim(path.resolve("tests/fixtures/fake-doc-codex.cjs"));
    const provider = new CodexTextProvider({
      command,
      args: [],
      proxy: "",
      timeoutMs: 5_000
    });

    const output = await provider.createDocument(process.cwd(), "新增一份商业模式说明", {
      model: "gpt-5.5",
      reasoningEffort: "high"
    });

    expect(output).toMatchObject({
      title: "商业模式说明",
      fileName: "business-model.md",
      content: expect.stringContaining("参考已有文档"),
      summary: "已创建商业模式说明文档"
    });
  });
});
