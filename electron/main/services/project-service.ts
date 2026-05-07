import fs from "node:fs/promises";
import path from "node:path";
import type {
  CreateProjectInput,
  PagesJson,
  ProjectIndexEntry,
  ProjectInfo
} from "../../../src/shared/types";
import { pagesJsonSchema } from "../../../src/shared/validation";
import { makeId, nowIso, pathExists } from "../utils/fs";
import { runProcess } from "../utils/process";

const PAGES_JSON_NAME = "pages.json";
const IGNORED_EMPTY_DIR_ENTRIES = new Set([".DS_Store"]);

export class ProjectService {
  private readonly indexPath: string;

  constructor(private readonly userDataDir: string) {
    this.indexPath = path.join(userDataDir, "projects-index.json");
  }

  async listProjects(): Promise<ProjectIndexEntry[]> {
    const index = await this.readIndex();
    return index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createProject(input: CreateProjectInput): Promise<ProjectInfo> {
    const name = input.name.trim();

    if (!name) {
      throw new Error("项目名称不能为空");
    }

    if (!path.isAbsolute(input.rootDir)) {
      throw new Error("项目目录必须是绝对路径");
    }

    const rootDir = path.resolve(input.rootDir);
    await this.ensureEmptyProjectRoot(rootDir);

    const timestamp = nowIso();
    const meta: PagesJson = {
      schemaVersion: 1,
      project: {
        id: makeId("project"),
        name,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      documents: [],
      pages: [],
      assets: []
    };

    await this.initializeGitRepository(rootDir);
    await fs.mkdir(path.join(rootDir, "docs"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "assets"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "logs"), { recursive: true });
    await this.writePagesJson(rootDir, meta);
    await this.upsertIndex({
      id: meta.project.id,
      name: meta.project.name,
      rootDir,
      createdAt: meta.project.createdAt,
      updatedAt: meta.project.updatedAt
    });

    return { rootDir, meta };
  }

  async openProject(rootDir: string): Promise<ProjectInfo> {
    const projectRoot = path.resolve(rootDir);
    const meta = await this.readPagesJson(projectRoot);

    await this.upsertIndex({
      id: meta.project.id,
      name: meta.project.name,
      rootDir: projectRoot,
      createdAt: meta.project.createdAt,
      updatedAt: meta.project.updatedAt
    });

    return { rootDir: projectRoot, meta };
  }

  async readPagesJson(rootDir: string): Promise<PagesJson> {
    const filePath = path.join(path.resolve(rootDir), PAGES_JSON_NAME);
    const raw = await fs.readFile(filePath, "utf8");
    return pagesJsonSchema.parse(JSON.parse(raw)) as PagesJson;
  }

  async writePagesJson(rootDir: string, meta: PagesJson): Promise<void> {
    pagesJsonSchema.parse(meta);
    await fs.writeFile(
      path.join(path.resolve(rootDir), PAGES_JSON_NAME),
      `${JSON.stringify(meta, null, 2)}\n`,
      "utf8"
    );
  }

  async touchIndex(rootDir: string, meta: PagesJson): Promise<void> {
    await this.upsertIndex({
      id: meta.project.id,
      name: meta.project.name,
      rootDir: path.resolve(rootDir),
      createdAt: meta.project.createdAt,
      updatedAt: meta.project.updatedAt
    });
  }

  private async ensureEmptyProjectRoot(rootDir: string): Promise<void> {
    const pagesJsonPath = path.join(rootDir, PAGES_JSON_NAME);

    if (await pathExists(pagesJsonPath)) {
      throw new Error("该目录已经包含 pages.json，不能重复创建项目");
    }

    await fs.mkdir(rootDir, { recursive: true });
    const entries = await fs.readdir(rootDir);
    const meaningfulEntries = entries.filter((entry) => !IGNORED_EMPTY_DIR_ENTRIES.has(entry));

    if (meaningfulEntries.length > 0) {
      throw new Error("项目根目录必须为空");
    }
  }

  private async initializeGitRepository(rootDir: string): Promise<void> {
    try {
      await runProcess({
        command: "git",
        args: ["init"],
        cwd: rootDir,
        timeoutMs: 10_000
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Git 仓库初始化失败：${message}`);
    }
  }

  private async readIndex(): Promise<ProjectIndexEntry[]> {
    if (!(await pathExists(this.indexPath))) {
      return [];
    }

    const raw = await fs.readFile(this.indexPath, "utf8");
    const parsed = JSON.parse(raw) as ProjectIndexEntry[];
    return Array.isArray(parsed) ? parsed : [];
  }

  private async writeIndex(index: ProjectIndexEntry[]): Promise<void> {
    await fs.mkdir(this.userDataDir, { recursive: true });
    await fs.writeFile(this.indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  }

  private async upsertIndex(entry: ProjectIndexEntry): Promise<void> {
    const index = await this.readIndex();
    const next = [entry, ...index.filter((item) => item.id !== entry.id && item.rootDir !== entry.rootDir)];
    await this.writeIndex(next);
  }
}
