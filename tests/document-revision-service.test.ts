import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DocumentRevisionOutput } from "../src/shared/types";
import { DocumentRevisionService } from "../electron/main/services/document-revision-service";
import { ProjectService } from "../electron/main/services/project-service";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

describe("DocumentRevisionService", () => {
  it("updates only the selected document and preserves pages", async () => {
    const userDataDir = await makeTempDir("user-data");
    const rootDir = await makeTempDir("project-root");
    const projectService = new ProjectService(userDataDir);
    const project = await projectService.createProject({ name: "Demo", rootDir });
    const originalPage = {
      id: "page_home",
      name: "首页",
      route: "/home",
      description: "首页说明",
      uiPrompt: "首页 UI",
      assetIds: []
    };
    const originalMeta = {
      ...project.meta,
      documents: [
        {
          type: "prd" as const,
          title: "PRD",
          path: "docs/prd.md",
          updatedAt: project.meta.project.updatedAt
        }
      ],
      pages: [originalPage]
    };
    const output: DocumentRevisionOutput = {
      content: "# PRD\n\n已补充儿童涂色流程。",
      summary: "补充涂色流程"
    };
    const provider = {
      reviseDocument: vi.fn(async () => output)
    };
    const streamEvents = vi.fn();

    await fs.writeFile(path.join(rootDir, "docs/prd.md"), "# PRD\n\n旧内容\n", "utf8");
    await projectService.writePagesJson(rootDir, originalMeta);

    const service = new DocumentRevisionService(projectService, provider as never);
    const result = await service.reviseDocument(rootDir, "docs/prd.md", "补充儿童涂色流程", {
      onEvent: streamEvents
    });

    expect(provider.reviseDocument).toHaveBeenCalledWith(
      rootDir,
      "docs/prd.md",
      "补充儿童涂色流程",
      { onEvent: streamEvents }
    );
    expect(result.content).toContain("已补充儿童涂色流程");
    expect(result.project.meta.pages).toEqual([originalPage]);
    await expect(fs.readFile(path.join(rootDir, "docs/prd.md"), "utf8")).resolves.toContain(
      "已补充儿童涂色流程"
    );
  });
});
