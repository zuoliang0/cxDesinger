import fs from "node:fs/promises";
import type { PageMeta, PagePlanSyncOutput, PlanningPageOutput, ProjectInfo } from "../../../src/shared/types";
import { ensureInsideProject, makeId, nowIso, slugify } from "../utils/fs";
import type { CodexStreamOptions, CodexTextProvider } from "./codex-text-provider";
import { ProjectService } from "./project-service";

export class PagePlanSyncService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly codexTextProvider: CodexTextProvider
  ) {}

  async syncPagePlan(
    projectRoot: string,
    pagePlanPath: string,
    streamOptions: CodexStreamOptions = {}
  ): Promise<ProjectInfo> {
    const normalizedPagePlanPath = pagePlanPath.trim() || "docs/page-plan.md";
    const absolutePagePlanPath = ensureInsideProject(projectRoot, normalizedPagePlanPath);

    await fs.access(absolutePagePlanPath);

    const output = await this.codexTextProvider.syncPagePlan(
      projectRoot,
      normalizedPagePlanPath,
      streamOptions
    );

    return this.applyPagePlanSyncOutput(projectRoot, output);
  }

  async applyPagePlanSyncOutput(
    projectRoot: string,
    output: PagePlanSyncOutput
  ): Promise<ProjectInfo> {
    const current = await this.projectService.readPagesJson(projectRoot);
    const timestamp = nowIso();
    const existingByRoute = new Map(current.pages.map((page) => [this.normalizeRoute(page.route), page]));
    const usedIds = new Set<string>();
    const pages = output.pages.map((page, index) =>
      this.mergePage(page, index, existingByRoute, usedIds)
    );
    const next = {
      ...current,
      project: {
        ...current.project,
        updatedAt: timestamp
      },
      pages
    };

    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return { rootDir: projectRoot, meta: next };
  }

  private mergePage(
    page: PlanningPageOutput,
    index: number,
    existingByRoute: Map<string, PageMeta>,
    usedIds: Set<string>
  ): PageMeta {
    const route = this.normalizeRoute(page.route);
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
      ...(hasGeneratedOutput ? { needUpdate: true } : {}),
      assetIds: existing?.assetIds || []
    };
  }

  private normalizeRoute(route: string): string {
    const trimmed = route.trim();
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
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
