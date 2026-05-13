import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import yauzl from "yauzl";
import { ZipService } from "../electron/main/services/zip-service";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

function readZipEntries(zipPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError);
        return;
      }

      const entries: string[] = [];
      zipFile.readEntry();
      zipFile.on("entry", (entry) => {
        if (!entry.fileName.endsWith("/")) {
          entries.push(entry.fileName);
        }
        zipFile.readEntry();
      });
      zipFile.on("end", () => resolve(entries.sort()));
      zipFile.on("error", reject);
    });
  });
}

describe("ZipService", () => {
  it("exports only pages.json, pages, assets and docs", async () => {
    const projectRoot = await makeTempDir("zip-project");
    const outputDir = await makeTempDir("zip-output");
    const zipPath = path.join(outputDir, "project.zip");
    const service = new ZipService();

    await fs.mkdir(path.join(projectRoot, "assets", "pages"), { recursive: true });
    await fs.mkdir(path.join(projectRoot, "pages", "page_home"), { recursive: true });
    await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true });
    await fs.mkdir(path.join(projectRoot, "logs"), { recursive: true });
    await fs.mkdir(path.join(projectRoot, "tmp"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "pages.json"), "{}\n", "utf8");
    await fs.writeFile(path.join(projectRoot, "pages", "page_home", "page.json"), "{}\n", "utf8");
    await fs.writeFile(path.join(projectRoot, "assets", "pages", "ui.png"), "image", "utf8");
    await fs.writeFile(path.join(projectRoot, "docs", "prd.md"), "# PRD\n", "utf8");
    await fs.writeFile(path.join(projectRoot, "logs", "debug.log"), "debug", "utf8");
    await fs.writeFile(path.join(projectRoot, "tmp", "scratch.txt"), "tmp", "utf8");

    await service.exportProject(projectRoot, zipPath);

    const entries = await readZipEntries(zipPath);

    expect(entries).toEqual([
      "assets/pages/ui.png",
      "docs/prd.md",
      "pages.json",
      "pages/page_home/page.json"
    ]);
    expect(entries.some((entry) => entry.startsWith("logs/"))).toBe(false);
    expect(entries.some((entry) => entry.startsWith("tmp/"))).toBe(false);
  });
});
