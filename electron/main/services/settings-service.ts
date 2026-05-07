import fs from "node:fs/promises";
import path from "node:path";
import type { AppSettings } from "../../../src/shared/types";
import { pathExists } from "../utils/fs";

const LEGACY_DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export class SettingsService {
  private readonly settingsPath: string;

  constructor(private readonly userDataDir: string) {
    this.settingsPath = path.join(userDataDir, "settings.json");
  }

  async getSettings(): Promise<AppSettings> {
    const defaults = this.getDefaultSettings();

    if (!(await pathExists(this.settingsPath))) {
      return defaults;
    }

    const raw = await fs.readFile(this.settingsPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;

    return {
      codex: {
        command: parsed.codex?.command || defaults.codex.command,
        args: Array.isArray(parsed.codex?.args) ? parsed.codex.args : defaults.codex.args,
        timeoutMs:
          parsed.codex?.timeoutMs === LEGACY_DEFAULT_TIMEOUT_MS
            ? defaults.codex.timeoutMs
            : parsed.codex?.timeoutMs || defaults.codex.timeoutMs
      }
    };
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const normalized: AppSettings = {
      codex: {
        command: settings.codex.command.trim() || "codex",
        args: settings.codex.args.filter(Boolean),
        timeoutMs: settings.codex.timeoutMs || DEFAULT_TIMEOUT_MS
      }
    };

    await fs.mkdir(this.userDataDir, { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(normalized, null, 2), "utf8");

    return normalized;
  }

  private getDefaultSettings(): AppSettings {
    return {
      codex: {
        command: process.env.CODEX_CLI_PATH || "codex",
        args: [],
        timeoutMs: DEFAULT_TIMEOUT_MS
      }
    };
  }
}
