import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function slugify(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

export function ensureInsideProject(projectRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error("项目文件路径必须是相对路径");
  }

  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("项目文件路径不能越过项目根目录");
  }

  return resolved;
}

export function toProjectRelativePath(projectRoot: string, absolutePath: string): string {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(absolutePath);
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("生成文件必须位于项目根目录内");
  }

  return relative.split(path.sep).join("/");
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }

  if (ext === ".webp") {
    return "image/webp";
  }

  if (ext === ".svg") {
    return "image/svg+xml";
  }

  return "image/png";
}
