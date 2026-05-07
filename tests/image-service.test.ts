import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ImageService } from "../electron/main/services/image-service";
import { ProjectService } from "../electron/main/services/project-service";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

async function createProjectWithPage() {
  const userDataDir = await makeTempDir("user-data");
  const rootDir = await makeTempDir("project-root");
  const projectService = new ProjectService(userDataDir);
  const project = await projectService.createProject({ name: "Demo", rootDir });
  const meta = {
    ...project.meta,
    pages: [
      {
        id: "page_home",
        name: "首页",
        route: "/home",
        description: "首页",
        uiPrompt: "生成首页",
        needUpdate: true,
        assetIds: []
      }
    ]
  };
  await projectService.writePagesJson(rootDir, meta);

  return { rootDir, projectService };
}

describe("ImageService", () => {
  it("generates versioned page images and stores the active relative asset path", async () => {
    const { rootDir, projectService } = await createProjectWithPage();
    const imageProvider = createFakeImageProvider();
    const service = new ImageService(projectService, imageProvider);

    const updated = await service.generatePageImage(rootDir, "page_home", "新的界面提示");
    const second = await service.generatePageImage(rootDir, "page_home", "第二版界面提示");

    expect(updated.meta.pages[0].imagePath).toBe("assets/pages/page_home/versions/v001.png");
    expect(second.meta.pages[0].imagePath).toBe("assets/pages/page_home/versions/v002.png");
    expect(updated.meta.pages[0].needUpdate).toBeUndefined();
    await expect(fs.stat(path.join(rootDir, "assets/pages/page_home/versions/v001.png"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(rootDir, "assets/pages/page_home/versions/v002.png"))).resolves.toBeTruthy();

    const versions = await service.listPageImageVersions(rootDir, "page_home");
    expect(versions.map((version) => version.version)).toEqual(["v001", "v002"]);
    expect(versions[1].active).toBe(true);

    const switched = await service.setActivePageImageVersion(
      rootDir,
      "page_home",
      "assets/pages/page_home/versions/v001.png"
    );
    expect(switched.meta.pages[0].imagePath).toBe("assets/pages/page_home/versions/v001.png");
  });

  it("generates slice assets from saved selections and links them to pages.json", async () => {
    const { rootDir, projectService } = await createProjectWithPage();
    const imageProvider = createFakeImageProvider();
    const service = new ImageService(projectService, imageProvider);
    const withImage = await service.generatePageImage(rootDir, "page_home", "新的界面提示");
    const timestamp = new Date().toISOString();
    const withSelections = await service.saveSliceSelections(rootDir, "page_home", [
      {
        id: "selection_primary",
        pageId: "page_home",
        name: "主按钮",
        sourceImagePath: withImage.meta.pages[0].imagePath || "",
        selection: { x: 10, y: 10, width: 20, height: 20 },
        prompt: "",
        status: "pending",
        assetId: null,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "selection_dialog",
        pageId: "page_home",
        name: "确认弹窗",
        sourceImagePath: withImage.meta.pages[0].imagePath || "",
        selection: { x: 40, y: 40, width: 30, height: 30 },
        prompt: "",
        status: "pending",
        assetId: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]);

    const updated = await service.generateSliceAssets(
      rootDir,
      "page_home",
      ["selection_primary", "selection_dialog"]
    );

    expect(withSelections.meta.sliceSelections).toHaveLength(2);
    expect(imageProvider.sliceBatchCalls).toBe(1);
    expect(updated.meta.assets).toHaveLength(2);
    expect(updated.meta.assets[0]).toMatchObject({
      name: "开始涂色按钮",
      selectionId: "selection_primary",
      prompt: "参考图中的主操作按钮素材"
    });
    expect(updated.meta.pages[0].assetIds).toEqual(updated.meta.assets.map((asset) => asset.id));
    expect(updated.meta.sliceSelections?.[0]).toMatchObject({
      id: "selection_primary",
      name: "开始涂色按钮",
      prompt: "参考图中的主操作按钮素材",
      status: "generated",
      assetId: updated.meta.assets[0].id
    });
    await Promise.all(
      updated.meta.assets.map((asset) =>
        expect(fs.stat(path.join(rootDir, asset.path))).resolves.toBeTruthy()
      )
    );

    const oldPrimaryAssetId = updated.meta.sliceSelections?.[0].assetId;
    const retried = await service.generateSliceAssets(
      rootDir,
      "page_home",
      ["selection_primary"],
      {},
      { force: true, replaceExisting: true, prompt: "补上按钮左侧漏切阴影" }
    );
    const nextPrimaryAssetId = retried.meta.sliceSelections?.[0].assetId;

    expect(nextPrimaryAssetId).not.toBe(oldPrimaryAssetId);
    expect(retried.meta.assets).toHaveLength(2);
    expect(retried.meta.assets.some((asset) => asset.id === oldPrimaryAssetId)).toBe(false);
    expect(retried.meta.pages[0].assetIds).not.toContain(oldPrimaryAssetId);
    expect(retried.meta.assets.find((asset) => asset.id === nextPrimaryAssetId)?.prompt).toContain(
      "补上按钮左侧漏切阴影"
    );
  });

  it("extracts a page background and stores it on the page meta", async () => {
    const { rootDir, projectService } = await createProjectWithPage();
    const imageProvider = createFakeImageProvider();
    const service = new ImageService(projectService, imageProvider);
    const withImage = await service.generatePageImage(rootDir, "page_home", "新的界面提示");

    const updated = await service.generatePageBackground(rootDir, "page_home");

    expect(withImage.meta.pages[0].imagePath).toBe("assets/pages/page_home/versions/v001.png");
    expect(updated.meta.pages[0].backgroundImagePath).toBe("assets/pages/page_home/backgrounds/bg001.png");
    await expect(fs.stat(path.join(rootDir, "assets/pages/page_home/backgrounds/bg001.png"))).resolves.toBeTruthy();
  });

  it("identifies pending slice selections from the active page image", async () => {
    const { rootDir, projectService } = await createProjectWithPage();
    const imageProvider = createFakeImageProvider();
    const service = new ImageService(projectService, imageProvider);
    await service.generatePageImage(rootDir, "page_home", "新的界面提示");

    const updated = await service.identifySliceSelections(rootDir, "page_home");

    expect(updated.meta.sliceSelections).toHaveLength(2);
    expect(updated.meta.sliceSelections?.[0]).toMatchObject({
      pageId: "page_home",
      name: "主按钮",
      prompt: "橙色主操作按钮，保留阴影和图标",
      sourceImagePath: "assets/pages/page_home/versions/v001.png",
      status: "pending",
      assetId: null
    });
  });
});

function createFakeImageProvider() {
  let sliceBatchCalls = 0;

  return {
    get sliceBatchCalls() {
      return sliceBatchCalls;
    },
    async generatePageImage({ outputPath, projectRoot }: { outputPath: string; projectRoot: string }) {
      await writePng(outputPath);
      return path.relative(projectRoot, outputPath).split(path.sep).join("/");
    },
    async generatePageBackground({ outputPath, projectRoot }: { outputPath: string; projectRoot: string }) {
      await writePng(outputPath);
      return path.relative(projectRoot, outputPath).split(path.sep).join("/");
    },
    async identifySliceSelections() {
      return [
        {
          name: "主按钮",
          description: "橙色主操作按钮，保留阴影和图标",
          selection: { x: 10, y: 20, width: 120, height: 80 }
        },
        {
          name: "设置按钮",
          description: "蓝色圆形设置按钮，保留齿轮图标",
          selection: { x: 300, y: 20, width: 64, height: 64 }
        }
      ];
    },
    async generateSliceAssets({
      items,
      projectRoot
    }: {
      items: Array<{ outputPath: string; instruction?: string; sliceSelection: { id: string } }>;
      projectRoot: string;
    }) {
      sliceBatchCalls += 1;
      await Promise.all(items.map((item) => writePng(item.outputPath)));
      return items.map((item) => ({
        selectionId: item.sliceSelection.id,
        path: path.relative(projectRoot, item.outputPath).split(path.sep).join("/"),
        name: "开始涂色按钮",
        description: item.instruction
          ? `参考图中的主操作按钮素材；备注：${item.instruction}`
          : "参考图中的主操作按钮素材"
      }));
    }
  };
}

async function writePng(outputPath: string) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lp/90wAAAABJRU5ErkJggg==",
      "base64"
    )
  );
}
