import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function createCodexProcessEnv(): NodeJS.ProcessEnv {
  const fallbackPaths = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin"
  ];
  const pathValue = [...fallbackPaths, process.env.PATH || ""].filter(Boolean).join(":");

  return {
    ...process.env,
    PATH: pathValue
  };
}

export async function resolveCodexCommand(command: string, pathValue: string): Promise<string> {
  const normalized = command.trim() || "codex";

  if (normalized.includes(path.sep)) {
    await assertExecutable(normalized);
    return normalized;
  }

  const shellResolved = await resolveWithLoginShell(normalized);

  if (shellResolved) {
    return shellResolved;
  }

  for (const directory of pathValue.split(":").filter(Boolean)) {
    const candidate = path.join(directory, normalized);

    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  throw new Error(createMissingCodexCliMessage(normalized));
}

export function createMissingCodexCliMessage(command = "codex"): string {
  return [
    `未找到 Codex 命令行工具：${command}。`,
    "请先确认本机已安装 Codex CLI，并在系统终端运行 `codex --version` 检查是否可用。",
    "如果终端可用但 cxDesinger 仍找不到，请打开应用设置，将 Codex CLI 完整路径填进去；可在终端运行 `command -v codex` 获取路径。",
    "macOS 图形应用可能拿不到你的 shell PATH，所以只在终端能运行并不一定代表应用内能找到。"
  ].join(" ");
}

async function resolveWithLoginShell(command: string): Promise<string | null> {
  const shell = process.env.SHELL || "/bin/zsh";
  const quotedCommand = command.replace(/'/g, "'\\''");

  try {
    const { stdout } = await execFileAsync(shell, ["-lc", `command -v '${quotedCommand}'`], {
      timeout: 3000
    });
    const resolved = stdout.trim().split("\n")[0];

    if (resolved && (await isExecutable(resolved))) {
      return resolved;
    }
  } catch {
    return null;
  }

  return null;
}

async function assertExecutable(command: string): Promise<void> {
  if (!(await isExecutable(command))) {
    throw new Error(
      [
        `Codex 命令行工具不可执行：${command}。`,
        "请检查该路径是否存在、是否有执行权限，或在应用设置中重新填写正确的 Codex CLI 路径。"
      ].join(" ")
    );
  }
}

async function isExecutable(command: string): Promise<boolean> {
  try {
    await fs.access(command, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
