import fs from "node:fs";
import archiver from "archiver";

export class ZipService {
  exportProject(projectRoot: string, zipPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => resolve());
      output.on("error", reject);
      archive.on("error", reject);

      archive.pipe(output);
      archive.directory(projectRoot, false);
      archive.finalize().catch(reject);
    });
  }
}
