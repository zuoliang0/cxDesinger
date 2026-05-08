import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectFileService } from "../electron/main/services/project-file-service";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

describe("ProjectFileService", () => {
  it("lists editable text files and excludes noisy directories", async () => {
    const rootDir = await makeTempDir("project-files");
    await fs.mkdir(path.join(rootDir, "src"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "node_modules/pkg"), { recursive: true });
    await fs.writeFile(path.join(rootDir, "src/app.ts"), "export const ok = true;\n", "utf8");
    await fs.writeFile(path.join(rootDir, "assets.png"), Buffer.from([0, 1, 2]));

    const service = new ProjectFileService();
    const files = await service.listProjectFiles(rootDir);

    expect(files.some((node) => node.name === "node_modules")).toBe(false);
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "src",
          type: "directory",
          children: expect.arrayContaining([
            expect.objectContaining({
              name: "app.ts",
              path: "src/app.ts",
              editable: true
            })
          ])
        }),
        expect.objectContaining({
          name: "assets.png",
          editable: false
        })
      ])
    );
  });

  it("reads and writes project text files with mtime conflict protection", async () => {
    const rootDir = await makeTempDir("project-files");
    await fs.writeFile(path.join(rootDir, "README.md"), "# Demo\n", "utf8");
    const service = new ProjectFileService();

    const file = await service.readProjectFile(rootDir, "README.md");
    expect(file.content).toBe("# Demo\n");

    const saved = await service.writeProjectFile({
      projectRoot: rootDir,
      relativePath: "README.md",
      content: "# Demo\n\nUpdated\n",
      expectedMtimeMs: file.mtimeMs
    });
    expect(saved.size).toBeGreaterThan(file.size);
    await expect(fs.readFile(path.join(rootDir, "README.md"), "utf8")).resolves.toContain("Updated");

    await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.writeFile(path.join(rootDir, "README.md"), "external\n", "utf8");
    await expect(
      service.writeProjectFile({
        projectRoot: rootDir,
        relativePath: "README.md",
        content: "stale\n",
        expectedMtimeMs: saved.mtimeMs
      })
    ).rejects.toThrow("外部发生变化");
  });

  it("rejects paths outside the project root and binary files", async () => {
    const rootDir = await makeTempDir("project-files");
    await fs.writeFile(path.join(rootDir, "binary.txt"), Buffer.from([65, 0, 66]));
    const service = new ProjectFileService();

    await expect(service.readProjectFile(rootDir, "../outside.txt")).rejects.toThrow("不能越过项目根目录");
    await expect(service.readProjectFile(rootDir, "binary.txt")).rejects.toThrow("二进制内容");
  });
});
