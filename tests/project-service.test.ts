import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectService } from "../electron/main/services/project-service";
import { pagesIndexJsonSchema } from "../src/shared/validation";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

describe("ProjectService", () => {
  it("creates a self-contained project directory", async () => {
    const userDataDir = await makeTempDir("user-data");
    const rootDir = await makeTempDir("project-root");
    const service = new ProjectService(userDataDir);

    const project = await service.createProject({ name: "Demo", rootDir, type: "app" });

    await expect(fs.stat(path.join(rootDir, "docs"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(rootDir, "assets"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(rootDir, "logs"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(rootDir, "pages"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(rootDir, ".git"))).resolves.toBeTruthy();
    const raw = await fs.readFile(path.join(rootDir, "pages.json"), "utf8");
    const index = pagesIndexJsonSchema.parse(JSON.parse(raw));
    expect(index.schemaVersion).toBe(2);
    expect(index.project).toEqual(project.meta.project);
    expect(index.pages).toEqual([]);
    expect(project.meta.project.type).toBe("app");
    expect(project.meta.schemaVersion).toBe(2);
    expect(await service.listProjects()).toHaveLength(1);
  });

  it("rejects non-empty roots", async () => {
    const userDataDir = await makeTempDir("user-data");
    const rootDir = await makeTempDir("project-root");
    await fs.writeFile(path.join(rootDir, "keep.txt"), "content", "utf8");
    const service = new ProjectService(userDataDir);

    await expect(service.createProject({ name: "Demo", rootDir })).rejects.toThrow("必须为空");
  });

  it("opens an existing project folder and adds it to the index", async () => {
    const userDataDir = await makeTempDir("user-data");
    const rootDir = await makeTempDir("project-root");
    const timestamp = "2026-05-08T00:00:00.000Z";
    const meta = {
      schemaVersion: 1,
      project: {
        id: "project_existing",
        name: "Existing",
        type: "web",
        createdAt: timestamp,
        updatedAt: timestamp
      },
      documents: [],
      pages: [],
      assets: []
    };
    await fs.writeFile(path.join(rootDir, "pages.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    const service = new ProjectService(userDataDir);

    const opened = await service.openProject(rootDir);
    const projects = await service.listProjects();

    expect(opened.meta.project.name).toBe("Existing");
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: "project_existing",
      name: "Existing",
      rootDir
    });
  });

  it("migrates a legacy v1 project to split page files on write", async () => {
    const userDataDir = await makeTempDir("user-data");
    const rootDir = await makeTempDir("project-root");
    const timestamp = "2026-05-08T00:00:00.000Z";
    const meta = {
      schemaVersion: 1 as const,
      project: {
        id: "project_existing",
        name: "Existing",
        type: "web" as const,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      documents: [],
      pages: [
        {
          id: "page_home",
          name: "Home",
          route: "/",
          description: "Home page",
          uiPrompt: "Home prompt",
          imagePath: "assets/pages/page_home/versions/v001.png",
          assetIds: ["asset_logo"]
        }
      ],
      assets: [
        {
          id: "asset_logo",
          pageId: "page_home",
          type: "slice" as const,
          name: "Logo",
          path: "assets/slices/page_home/asset_logo.png",
          sourceImagePath: "assets/pages/page_home/versions/v001.png",
          selection: { x: 1, y: 2, width: 3, height: 4 },
          selectionId: "selection_logo",
          prompt: "Logo asset",
          createdAt: timestamp
        }
      ],
      sliceSelections: [
        {
          id: "selection_logo",
          pageId: "page_home",
          name: "Logo",
          sourceImagePath: "assets/pages/page_home/versions/v001.png",
          selection: { x: 1, y: 2, width: 3, height: 4 },
          prompt: "Logo asset",
          status: "generated" as const,
          assetId: "asset_logo",
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ]
    };
    await fs.writeFile(path.join(rootDir, "pages.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    const service = new ProjectService(userDataDir);
    const opened = await service.openProject(rootDir);

    await service.writePagesJson(rootDir, {
      ...opened.meta,
      project: {
        ...opened.meta.project,
        updatedAt: "2026-05-08T01:00:00.000Z"
      }
    });

    const index = pagesIndexJsonSchema.parse(
      JSON.parse(await fs.readFile(path.join(rootDir, "pages.json"), "utf8"))
    );
    const page = JSON.parse(await fs.readFile(path.join(rootDir, "pages", "page_home", "page.json"), "utf8"));
    const assets = JSON.parse(await fs.readFile(path.join(rootDir, "pages", "page_home", "assets.json"), "utf8"));
    const selections = JSON.parse(
      await fs.readFile(path.join(rootDir, "pages", "page_home", "slice-selections.json"), "utf8")
    );

    expect(await fs.stat(path.join(rootDir, "pages.v1.backup.json"))).toBeTruthy();
    expect(index.pages[0]).toMatchObject({
      id: "page_home",
      dataDir: "pages/page_home"
    });
    expect(page).toMatchObject({
      id: "page_home",
      uiPrompt: "Home prompt"
    });
    expect(assets).toHaveLength(1);
    expect(selections).toHaveLength(1);
  });
});
