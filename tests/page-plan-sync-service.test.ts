import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PagePlanSyncOutput } from "../src/shared/types";
import { PagePlanSyncService } from "../electron/main/services/page-plan-sync-service";
import { ProjectService } from "../electron/main/services/project-service";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

describe("PagePlanSyncService", () => {
  it("syncs page-plan.md into pages.json and marks generated pages stale", async () => {
    const userDataDir = await makeTempDir("user-data");
    const rootDir = await makeTempDir("project-root");
    const projectService = new ProjectService(userDataDir);
    const project = await projectService.createProject({ name: "Demo", rootDir });
    const output: PagePlanSyncOutput = {
      pages: [
        {
          name: "首页",
          route: "/home",
          description: "新的首页描述",
          uiPrompt: "新的首页 UI 提示"
        },
        {
          name: "作品墙",
          route: "/gallery",
          description: "展示儿童作品",
          uiPrompt: "横屏作品墙，卡片网格展示海洋动物作品"
        }
      ],
      summary: "同步页面规划"
    };
    const provider = {
      syncPagePlan: async () => output
    };
    const originalMeta = {
      ...project.meta,
      documents: [
        {
          type: "page-plan" as const,
          title: "页面规划",
          path: "docs/page-plan.md",
          updatedAt: project.meta.project.updatedAt
        }
      ],
      pages: [
        {
          id: "page_home",
          name: "旧首页",
          route: "/home",
          description: "旧描述",
          uiPrompt: "旧提示",
          imagePath: "assets/pages/page_home/ui.png",
          assetIds: ["asset_header"]
        }
      ]
    };

    await fs.writeFile(path.join(rootDir, "docs/page-plan.md"), "# 页面规划\n", "utf8");
    await projectService.writePagesJson(rootDir, originalMeta);

    const service = new PagePlanSyncService(projectService, provider as never);
    const updated = await service.syncPagePlan(rootDir, "docs/page-plan.md");

    expect(updated.meta.pages).toHaveLength(2);
    expect(updated.meta.pages[0]).toMatchObject({
      id: "page_home",
      name: "首页",
      route: "/home",
      description: "新的首页描述",
      uiPrompt: "新的首页 UI 提示",
      imagePath: "assets/pages/page_home/ui.png",
      needUpdate: true,
      assetIds: ["asset_header"]
    });
    expect(updated.meta.pages[1]).toMatchObject({
      name: "作品墙",
      route: "/gallery",
      assetIds: []
    });
    expect(updated.meta.pages[1].needUpdate).toBeUndefined();
  });
});
