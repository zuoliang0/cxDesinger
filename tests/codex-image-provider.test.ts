import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CodexImageProvider } from "../electron/main/services/codex-image-provider";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

describe("CodexImageProvider", () => {
  it("runs codex exec and returns the generated project-relative image path", async () => {
    const projectRoot = await makeTempDir("image-project");
    const provider = new CodexImageProvider({
      command: process.execPath,
      args: [path.resolve("tests/fixtures/fake-image-codex.cjs")],
      timeoutMs: 5_000
    });
    const events: Array<{ level: string; message: string }> = [];

    await fs.writeFile(
      path.join(projectRoot, "pages.json"),
      JSON.stringify({
        schemaVersion: 1,
        project: {
          id: "project_demo",
          name: "Demo",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        documents: [],
        pages: [],
        assets: []
      }),
      "utf8"
    );

    const result = await provider.generatePageImage(
      {
        projectRoot,
        page: {
          id: "page_home",
          name: "首页",
          route: "/",
          description: "首页",
          uiPrompt: "首页 UI",
          assetIds: []
        },
        prompt: "生成儿童海洋首页",
        outputPath: path.join(projectRoot, "assets/pages/page_home/ui.png")
      },
      {
        onEvent: (level, message) => events.push({ level, message })
      }
    );

    expect(result).toBe("assets/pages/page_home/ui.png");
    await expect(fs.stat(path.join(projectRoot, result))).resolves.toBeTruthy();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "stdout", message: expect.stringContaining("generating png") }),
        expect.objectContaining({ level: "complete" })
      ])
    );
  });

  it("reports codex timeout clearly", async () => {
    const projectRoot = await makeTempDir("image-project");
    const provider = new CodexImageProvider({
      command: process.execPath,
      args: [path.resolve("tests/fixtures/fake-image-codex.cjs"), "--timeout"],
      timeoutMs: 50
    });

    await expect(
      provider.generatePageImage({
        projectRoot,
        page: {
          id: "page_home",
          name: "首页",
          route: "/",
          description: "首页",
          uiPrompt: "首页 UI",
          assetIds: []
        },
        prompt: "生成儿童海洋首页",
        outputPath: path.join(projectRoot, "assets/pages/page_home/ui.png")
      })
    ).rejects.toThrow("Codex 调用超时");
  });

  it("returns generated slice asset metadata from codex output", async () => {
    const projectRoot = await makeTempDir("image-project");
    const provider = new CodexImageProvider({
      command: process.execPath,
      args: [path.resolve("tests/fixtures/fake-image-codex.cjs")],
      timeoutMs: 5_000
    });

    await fs.writeFile(
      path.join(projectRoot, "pages.json"),
      JSON.stringify({
        schemaVersion: 1,
        project: {
          id: "project_demo",
          name: "Demo",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        documents: [],
        pages: [],
        assets: []
      }),
      "utf8"
    );

    const result = await provider.generateSliceAsset({
      projectRoot,
      page: {
        id: "page_home",
        name: "首页",
        route: "/",
        description: "首页",
        uiPrompt: "儿童海洋首页 UI",
        imagePath: "assets/pages/page_home/versions/v001.png",
        assetIds: []
      },
      sourceImagePath: "assets/pages/page_home/versions/v001.png",
      selection: { x: 10, y: 20, width: 120, height: 80 },
      sliceSelection: {
        id: "selection_primary",
        pageId: "page_home",
        name: "首页 素材 1",
        sourceImagePath: "assets/pages/page_home/versions/v001.png",
        selection: { x: 10, y: 20, width: 120, height: 80 },
        prompt: "",
        status: "pending",
        assetId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      outputPath: path.join(projectRoot, "assets/slices/page_home/asset_1.png")
    });

    expect(result).toMatchObject({
      path: "assets/slices/page_home/asset_1.png",
      name: "开始涂色按钮",
      description: expect.stringContaining("主操作按钮")
    });
  });
});
