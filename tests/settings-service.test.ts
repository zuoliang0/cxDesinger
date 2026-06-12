import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SettingsService } from "../electron/main/services/settings-service";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

describe("SettingsService", () => {
  it("uses a 30 minute default timeout for long codex image tasks", async () => {
    const service = new SettingsService(await makeTempDir("settings"));

    await expect(service.getSettings()).resolves.toMatchObject({
      codex: {
        proxy: "",
        timeoutMs: 30 * 60 * 1000
      }
    });
  });

  it("migrates the previous 3 minute default timeout to 30 minutes", async () => {
    const userDataDir = await makeTempDir("settings");
    await fs.writeFile(
      path.join(userDataDir, "settings.json"),
      JSON.stringify({
        codex: {
          command: "codex",
          args: [],
          timeoutMs: 180_000
        }
      }),
      "utf8"
    );

    const service = new SettingsService(userDataDir);

    await expect(service.getSettings()).resolves.toMatchObject({
      codex: {
        proxy: "",
        timeoutMs: 30 * 60 * 1000
      }
    });
  });

  it("normalizes optional codex proxy settings", async () => {
    const service = new SettingsService(await makeTempDir("settings"));

    await expect(
      service.saveSettings({
        codex: {
          command: "codex",
          args: [],
          proxy: "127.0.0.1:7890",
          timeoutMs: 30 * 60 * 1000
        }
      })
    ).resolves.toMatchObject({
      codex: {
        proxy: "http://127.0.0.1:7890/"
      }
    });
  });

  it("rejects invalid codex proxy settings", async () => {
    const service = new SettingsService(await makeTempDir("settings"));

    await expect(
      service.saveSettings({
        codex: {
          command: "codex",
          args: [],
          proxy: "ftp://127.0.0.1:7890",
          timeoutMs: 30 * 60 * 1000
        }
      })
    ).rejects.toThrow("Codex 代理配置无效");
  });
});
