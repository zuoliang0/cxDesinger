import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PlanningOutput } from "../src/shared/types";
import { ProjectService } from "../electron/main/services/project-service";
import { PlanningService } from "../electron/main/services/planning-service";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

describe("PlanningService", () => {
  it("writes planning documents and updates pages.json", async () => {
    const userDataDir = await makeTempDir("user-data");
    const rootDir = await makeTempDir("project-root");
    const projectService = new ProjectService(userDataDir);
    await projectService.createProject({ name: "Demo", rootDir, type: "app" });
    const output: PlanningOutput = {
      conversationMarkdown: "# 沟通记录",
      documents: {
        prd: "# PRD",
        featurePlan: "# 功能规划",
        technicalPlan: "# 技术方案",
        styleGuide: "# 视觉规范",
        animationList: "# 动效清单",
        pagePlan: "# 页面规划",
        featureList: "# 功能清单"
      },
      pages: [
        {
          name: "首页",
          route: "/home",
          description: "项目首页",
          uiPrompt: "简洁的桌面应用首页"
        }
      ]
    };
    const provider = { runPlanning: async () => output };
    const service = new PlanningService(projectService, provider as never);

    const updated = await service.runPlanning(rootDir, "需求");

    expect(updated.meta.documents).toHaveLength(8);
    expect(updated.meta.documents.map((doc) => doc.path)).toContain("docs/animation-list.md");
    expect(updated.meta.pages[0]).toMatchObject({ name: "首页", route: "/home" });
    await expect(fs.readFile(path.join(rootDir, "docs/prd.md"), "utf8")).resolves.toContain("PRD");
    await expect(fs.readFile(path.join(rootDir, "docs/style.md"), "utf8")).resolves.toContain("视觉规范");
    await expect(fs.readFile(path.join(rootDir, "docs/animation-list.md"), "utf8")).resolves.toContain("动效清单");
  });
});
