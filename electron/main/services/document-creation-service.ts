import fs from "node:fs/promises";
import path from "node:path";
import type { CreateDocumentResult, DocumentCreationOutput } from "../../../src/shared/types";
import type { CodexStreamOptions, CodexTextProvider } from "./codex-text-provider";
import { nowIso, pathExists, slugify } from "../utils/fs";
import { ProjectService } from "./project-service";

export class DocumentCreationService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly codexTextProvider: CodexTextProvider
  ) {}

  async createDocument(
    projectRoot: string,
    instruction: string,
    streamOptions: CodexStreamOptions = {}
  ): Promise<CreateDocumentResult> {
    const trimmedInstruction = instruction.trim();

    if (!trimmedInstruction) {
      throw new Error("新增文档需求不能为空");
    }

    const output = await this.codexTextProvider.createDocument(projectRoot, trimmedInstruction, streamOptions);
    return this.applyDocumentCreationOutput(projectRoot, output);
  }

  async applyDocumentCreationOutput(
    projectRoot: string,
    output: DocumentCreationOutput
  ): Promise<CreateDocumentResult> {
    const current = await this.projectService.readPagesJson(projectRoot);
    const timestamp = nowIso();
    const docsDir = path.join(projectRoot, "docs");
    const fileName = await this.createUniqueFileName(projectRoot, output.fileName || output.title);
    const documentPath = `docs/${fileName}`;
    const content = `${output.content.trim()}\n`;
    const next = {
      ...current,
      project: {
        ...current.project,
        updatedAt: timestamp
      },
      documents: [
        ...current.documents,
        {
          type: "custom" as const,
          title: output.title.trim() || path.basename(fileName, ".md"),
          path: documentPath,
          updatedAt: timestamp
        }
      ]
    };

    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, fileName), content, "utf8");
    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return {
      project: {
        rootDir: projectRoot,
        meta: next
      },
      documentPath,
      content,
      summary: output.summary
    };
  }

  private async createUniqueFileName(projectRoot: string, suggestedName: string): Promise<string> {
    const normalized = this.normalizeFileName(suggestedName);
    const ext = ".md";
    const base = path.basename(normalized, ext);
    let candidate = `${base}${ext}`;
    let suffix = 2;

    while (await pathExists(path.join(projectRoot, "docs", candidate))) {
      candidate = `${base}-${suffix}${ext}`;
      suffix += 1;
    }

    return candidate;
  }

  private normalizeFileName(value: string): string {
    const baseName = path.basename(value.trim()).replace(/\.md$/iu, "");
    const normalized = baseName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gu, "-")
      .replace(/^-+|-+$/gu, "");

    return `${normalized || slugify(value, "custom-document")}.md`;
  }
}
