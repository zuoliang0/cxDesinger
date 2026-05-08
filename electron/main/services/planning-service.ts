import fs from "node:fs/promises";
import path from "node:path";
import type { DocumentMeta, PageMeta, PlanningOutput, ProjectInfo } from "../../../src/shared/types";
import { makeId, nowIso, slugify } from "../utils/fs";
import { CodexStreamOptions, CodexTextProvider } from "./codex-text-provider";
import { ProjectService } from "./project-service";

const DOCUMENTS: Array<{ type: DocumentMeta["type"]; title: string; fileName: string }> = [
  { type: "chat-history", title: "沟通记录", fileName: "chat-history.md" },
  { type: "prd", title: "PRD", fileName: "prd.md" },
  { type: "feature-plan", title: "功能规划", fileName: "feature-plan.md" },
  { type: "technical-plan", title: "技术方案", fileName: "technical-plan.md" },
  { type: "style-guide", title: "视觉规范", fileName: "style.md" },
  { type: "page-plan", title: "页面规划", fileName: "page-plan.md" },
  { type: "feature-list", title: "功能清单", fileName: "feature-list.md" }
];
const APP_ONLY_DOCUMENTS: Array<{ type: DocumentMeta["type"]; title: string; fileName: string }> = [
  { type: "animation-list", title: "动效清单", fileName: "animation-list.md" }
];

export class PlanningService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly codexTextProvider: CodexTextProvider
  ) {}

  async runPlanning(
    projectRoot: string,
    requirement: string,
    streamOptions: CodexStreamOptions = {}
  ): Promise<ProjectInfo> {
    const trimmedRequirement = requirement.trim();

    if (!trimmedRequirement) {
      throw new Error("需求描述不能为空");
    }

    const current = await this.projectService.readPagesJson(projectRoot);
    const output = await this.codexTextProvider.runPlanning(
      projectRoot,
      trimmedRequirement,
      current.project.type || "web",
      streamOptions
    );
    return this.applyPlanningOutput(projectRoot, output);
  }

  async applyPlanningOutput(projectRoot: string, output: PlanningOutput): Promise<ProjectInfo> {
    const current = await this.projectService.readPagesJson(projectRoot);
    const timestamp = nowIso();
    const docsDir = path.join(projectRoot, "docs");

    await fs.mkdir(docsDir, { recursive: true });
    await this.writeDocument(docsDir, "chat-history.md", output.conversationMarkdown);
    await this.writeDocument(docsDir, "prd.md", output.documents.prd);
    await this.writeDocument(docsDir, "feature-plan.md", output.documents.featurePlan);
    await this.writeDocument(docsDir, "technical-plan.md", output.documents.technicalPlan);
    await this.writeDocument(docsDir, "style.md", output.documents.styleGuide);
    if (current.project.type === "app") {
      await this.writeDocument(
        docsDir,
        "animation-list.md",
        output.documents.animationList || this.createFallbackAnimationList(current.project.name)
      );
    }
    await this.writeDocument(docsDir, "page-plan.md", output.documents.pagePlan);
    await this.writeDocument(docsDir, "feature-list.md", output.documents.featureList);

    const existingByRoute = new Map(current.pages.map((page) => [page.route, page]));
    const usedIds = new Set<string>();
    const pages: PageMeta[] = output.pages.map((page, index) => {
      const route = page.route.startsWith("/") ? page.route : `/${page.route}`;
      const existing = existingByRoute.get(route);
      const id = existing?.id || this.createPageId(page.name, index, usedIds);
      const hasGeneratedOutput = Boolean(existing?.imagePath || (existing?.assetIds.length ?? 0) > 0);
      usedIds.add(id);

      return {
        id,
        name: page.name,
        route,
        description: page.description,
        uiPrompt: page.uiPrompt,
        imagePath: existing?.imagePath,
        ...(hasGeneratedOutput || existing?.needUpdate ? { needUpdate: true } : {}),
        assetIds: existing?.assetIds || []
      };
    });

    const next = {
      ...current,
      project: {
        ...current.project,
        updatedAt: timestamp
      },
      documents: this.getDocumentsForProject(current.project.type || "web").map((doc) => ({
        type: doc.type,
        title: doc.title,
        path: `docs/${doc.fileName}`,
        updatedAt: timestamp
      })),
      pages
    };

    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return { rootDir: projectRoot, meta: next };
  }

  private getDocumentsForProject(projectType: "web" | "app") {
    if (projectType === "app") {
      return [
        ...DOCUMENTS.slice(0, 5),
        ...APP_ONLY_DOCUMENTS,
        ...DOCUMENTS.slice(5)
      ];
    }

    return DOCUMENTS;
  }

  private createFallbackAnimationList(projectName: string): string {
    return [
      "# 动效清单",
      "",
      `项目：${projectName}`,
      "",
      "## 页面转场",
      "",
      "- 待根据页面规划补充进入、返回、弹层和关键流程转场。",
      "",
      "## 组件动效",
      "",
      "- 待补充按钮反馈、加载状态、列表滚动、手势反馈和错误状态动效。",
      "",
      "## 开发注意事项",
      "",
      "- 动效需保持可取消、性能稳定，并避免影响核心操作效率。"
    ].join("\n");
  }

  private async writeDocument(docsDir: string, fileName: string, content: string): Promise<void> {
    await fs.writeFile(path.join(docsDir, fileName), `${content.trim()}\n`, "utf8");
  }

  private createPageId(name: string, index: number, usedIds: Set<string>): string {
    const base = slugify(name, `page-${index + 1}`);
    let candidate = `page_${base}`;
    let suffix = 2;

    while (usedIds.has(candidate)) {
      candidate = `page_${base}_${suffix}`;
      suffix += 1;
    }

    return candidate || makeId("page");
  }
}
