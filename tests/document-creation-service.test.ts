import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DocumentCreationOutput } from "../src/shared/types";
import { DocumentCreationService } from "../electron/main/services/document-creation-service";
import { ProjectService } from "../electron/main/services/project-service";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

describe("DocumentCreationService", () => {
  it("creates a custom document and appends it to pages.json", async () => {
    const userDataDir = await makeTempDir("user-data");
    const rootDir = await makeTempDir("project-root");
    const projectService = new ProjectService(userDataDir);
    const project = await projectService.createProject({ name: "Demo", rootDir });
    const output: DocumentCreationOutput = {
      title: "商业模式说明",
      fileName: "business-model.md",
      content: "# 商业模式说明\n\n参考已有文档生成。",
      summary: "已创建商业模式说明"
    };
    const provider = {
      createDocument: vi.fn(async () => output)
    };

    await projectService.writePagesJson(rootDir, {
      ...project.meta,
      documents: [
        {
          type: "prd",
          title: "PRD",
          path: "docs/prd.md",
          updatedAt: project.meta.project.updatedAt
        }
      ]
    });

    const service = new DocumentCreationService(projectService, provider as never);
    const result = await service.createDocument(rootDir, "新增商业模式说明");

    expect(provider.createDocument).toHaveBeenCalledWith(rootDir, "新增商业模式说明", {});
    expect(result.documentPath).toBe("docs/business-model.md");
    expect(result.project.meta.documents.at(-1)).toMatchObject({
      type: "custom",
      title: "商业模式说明",
      path: "docs/business-model.md"
    });
    await expect(fs.readFile(path.join(rootDir, "docs/business-model.md"), "utf8")).resolves.toContain(
      "参考已有文档生成"
    );
  });

  it("does not overwrite an existing generated document", async () => {
    const userDataDir = await makeTempDir("user-data");
    const rootDir = await makeTempDir("project-root");
    const projectService = new ProjectService(userDataDir);
    await projectService.createProject({ name: "Demo", rootDir });
    const provider = {
      createDocument: vi.fn(async () => ({
        title: "商业模式说明",
        fileName: "business-model.md",
        content: "# 新文档",
        summary: "已创建"
      }))
    };

    await fs.writeFile(path.join(rootDir, "docs/business-model.md"), "# 旧文档\n", "utf8");

    const service = new DocumentCreationService(projectService, provider as never);
    const result = await service.createDocument(rootDir, "新增商业模式说明");

    expect(result.documentPath).toBe("docs/business-model-2.md");
    await expect(fs.readFile(path.join(rootDir, "docs/business-model.md"), "utf8")).resolves.toContain("旧文档");
    await expect(fs.readFile(path.join(rootDir, "docs/business-model-2.md"), "utf8")).resolves.toContain("新文档");
  });
});
