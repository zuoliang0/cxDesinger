import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";

const EXPORT_ENTRIES = ["pages.json", "pages", "assets", "docs"] as const;

export class ZipService {
  exportProject(projectRoot: string, zipPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => resolve());
      output.on("error", reject);
      archive.on("error", reject);

      archive.pipe(output);
      for (const entry of EXPORT_ENTRIES) {
        const entryPath = path.join(projectRoot, entry);

        if (!fs.existsSync(entryPath)) {
          continue;
        }

        const stat = fs.statSync(entryPath);
        if (stat.isDirectory()) {
          archive.directory(entryPath, entry);
        } else if (stat.isFile()) {
          archive.file(entryPath, { name: entry });
        }
      }
      archive.finalize().catch(reject);
    });
  }
}
