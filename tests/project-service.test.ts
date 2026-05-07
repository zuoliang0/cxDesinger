import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectService } from "../electron/main/services/project-service";
import { pagesJsonSchema } from "../src/shared/validation";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

describe("ProjectService", () => {
  it("creates a self-contained project directory", async () => {
    const userDataDir = await makeTempDir("user-data");
    const rootDir = await makeTempDir("project-root");
    const service = new ProjectService(userDataDir);

    const project = await service.createProject({ name: "Demo", rootDir });

    await expect(fs.stat(path.join(rootDir, "docs"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(rootDir, "assets"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(rootDir, "logs"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(rootDir, ".git"))).resolves.toBeTruthy();
    const raw = await fs.readFile(path.join(rootDir, "pages.json"), "utf8");
    expect(pagesJsonSchema.parse(JSON.parse(raw))).toEqual(project.meta);
    expect(await service.listProjects()).toHaveLength(1);
  });

  it("rejects non-empty roots", async () => {
    const userDataDir = await makeTempDir("user-data");
    const rootDir = await makeTempDir("project-root");
    await fs.writeFile(path.join(rootDir, "keep.txt"), "content", "utf8");
    const service = new ProjectService(userDataDir);

    await expect(service.createProject({ name: "Demo", rootDir })).rejects.toThrow("必须为空");
  });
});
