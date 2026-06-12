import fs from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import type {
  ProjectFileNode,
  ReadProjectFileResult,
  WriteProjectFileInput,
  WriteProjectFileResult
} from "../../../src/shared/types";
import { ensureInsideProject } from "../utils/fs";

const MAX_EDITABLE_FILE_SIZE = 1_000_000;
const MAX_TREE_ENTRIES = 5_000;
const MAX_TREE_DEPTH = 12;

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-electron",
  "dist-renderer",
  ".vite",
  ".cache",
  "coverage"
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".zip",
  ".gz",
  ".tgz",
  ".pdf",
  ".mp4",
  ".mov",
  ".mp3",
  ".wav",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf"
]);

export class ProjectFileService {
  async listProjectFiles(projectRoot: string): Promise<ProjectFileNode[]> {
    const root = path.resolve(projectRoot);
    let entriesSeen = 0;

    const readDirectory = async (directory: string, depth: number): Promise<ProjectFileNode[]> => {
      if (depth > MAX_TREE_DEPTH || entriesSeen >= MAX_TREE_ENTRIES) {
        return [];
      }

      const entries = await fs.readdir(directory, { withFileTypes: true });
      const visibleEntries = entries
        .filter((entry) => !this.shouldSkipEntry(entry.name, entry.isDirectory()))
        .sort((left, right) => {
          if (left.isDirectory() !== right.isDirectory()) {
            return left.isDirectory() ? -1 : 1;
          }

          return left.name.localeCompare(right.name, "zh-Hans-CN");
        });

      const nodes: ProjectFileNode[] = [];

      for (const entry of visibleEntries) {
        if (entriesSeen >= MAX_TREE_ENTRIES) {
          break;
        }

        entriesSeen += 1;
        const absolutePath = path.join(directory, entry.name);
        const relativePath = this.toRelative(root, absolutePath);

        if (entry.isDirectory()) {
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: "directory",
            children: await readDirectory(absolutePath, depth + 1)
          });
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const stat = await fs.stat(absolutePath);
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: "file",
          editable: this.canEditByName(entry.name, stat.size),
          size: stat.size,
          mtimeMs: stat.mtimeMs
        });
      }

      return nodes;
    };

    return readDirectory(root, 0);
  }

  async readProjectFile(projectRoot: string, relativePath: string): Promise<ReadProjectFileResult> {
    const filePath = ensureInsideProject(projectRoot, relativePath);
    const stat = await fs.stat(filePath);

    if (!stat.isFile()) {
      throw new Error("只能读取文件");
    }

    if (!this.canEditByName(filePath, stat.size)) {
      throw new Error("当前文件不是可编辑文本文件");
    }

    const content = await fs.readFile(filePath);

    if (this.hasBinaryMarker(content)) {
      throw new Error("当前文件包含二进制内容，不能作为文本编辑");
    }

    return {
      path: this.normalizeRelativePath(relativePath),
      content: this.decodeUtf8(content),
      mtimeMs: stat.mtimeMs,
      size: stat.size
    };
  }

  async writeProjectFile(input: WriteProjectFileInput): Promise<WriteProjectFileResult> {
    const filePath = ensureInsideProject(input.projectRoot, input.relativePath);
    const stat = await fs.stat(filePath);

    if (!stat.isFile()) {
      throw new Error("只能保存文件");
    }

    if (!this.canEditByName(filePath, Buffer.byteLength(input.content, "utf8"))) {
      throw new Error("当前文件不是可编辑文本文件");
    }

    if (
      typeof input.expectedMtimeMs === "number" &&
      Math.abs(stat.mtimeMs - input.expectedMtimeMs) > 1
    ) {
      throw new Error("文件已在外部发生变化，请重新加载后再保存");
    }

    await fs.writeFile(filePath, input.content, "utf8");
    const nextStat = await fs.stat(filePath);

    return {
      path: this.normalizeRelativePath(input.relativePath),
      mtimeMs: nextStat.mtimeMs,
      size: nextStat.size
    };
  }

  async deleteProjectFile(projectRoot: string, relativePath: string): Promise<void> {
    const normalizedPath = this.normalizeRelativePath(relativePath);

    if (!normalizedPath) {
      throw new Error("不能删除项目根目录");
    }

    const filePath = ensureInsideProject(projectRoot, normalizedPath);
    await fs.rm(filePath, { recursive: true, force: false });
  }

  private shouldSkipEntry(name: string, isDirectory: boolean): boolean {
    if (name === ".DS_Store") {
      return true;
    }

    return isDirectory && EXCLUDED_DIRECTORIES.has(name);
  }

  private canEditByName(filePath: string, size: number): boolean {
    if (size > MAX_EDITABLE_FILE_SIZE) {
      return false;
    }

    return !BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  private hasBinaryMarker(content: Buffer): boolean {
    const sample = content.subarray(0, 8192);
    return sample.includes(0);
  }

  private decodeUtf8(content: Buffer): string {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  }

  private toRelative(root: string, absolutePath: string): string {
    return this.normalizeRelativePath(path.relative(root, absolutePath));
  }

  private normalizeRelativePath(relativePath: string): string {
    return relativePath.split(path.sep).join("/");
  }
}
