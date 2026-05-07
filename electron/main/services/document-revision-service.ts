import fs from "node:fs/promises";
import type { CodexStreamOptions, CodexTextProvider } from "./codex-text-provider";
import type { ReviseDocumentResult } from "../../../src/shared/types";
import { ensureInsideProject, nowIso } from "../utils/fs";
import { ProjectService } from "./project-service";

export class DocumentRevisionService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly codexTextProvider: CodexTextProvider
  ) {}

  async reviseDocument(
    projectRoot: string,
    documentPath: string,
    instruction: string,
    streamOptions: CodexStreamOptions = {}
  ): Promise<ReviseDocumentResult> {
    const trimmedInstruction = instruction.trim();

    if (!trimmedInstruction) {
      throw new Error("修改意见不能为空");
    }

    const absolutePath = ensureInsideProject(projectRoot, documentPath);
    await fs.access(absolutePath);
    const output = await this.codexTextProvider.reviseDocument(
      projectRoot,
      documentPath,
      trimmedInstruction,
      streamOptions
    );
    const timestamp = nowIso();
    const meta = await this.projectService.readPagesJson(projectRoot);
    const next = {
      ...meta,
      project: {
        ...meta.project,
        updatedAt: timestamp
      },
      documents: meta.documents.map((doc) =>
        doc.path === documentPath
          ? {
              ...doc,
              updatedAt: timestamp
            }
          : doc
      )
    };

    await fs.writeFile(absolutePath, `${output.content.trim()}\n`, "utf8");
    await this.projectService.writePagesJson(projectRoot, next);
    await this.projectService.touchIndex(projectRoot, next);

    return {
      project: {
        rootDir: projectRoot,
        meta: next
      },
      documentPath,
      content: `${output.content.trim()}\n`,
      summary: output.summary
    };
  }
}
