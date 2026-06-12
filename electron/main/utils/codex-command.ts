import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PreparedCodexProcess {
  command: string;
  env: NodeJS.ProcessEnv;
}

const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "npm_config_proxy",
  "npm_config_https_proxy"
];

export function createCodexProcessEnv(): NodeJS.ProcessEnv {
  const pathValue = createCodexPathValue(null);

  return {
    ...process.env,
    PATH: pathValue
  };
}

export async function prepareCodexProcess(command: string, proxy: string): Promise<PreparedCodexProcess> {
  const shellPathValue = await resolveLoginShellPath();
  const pathValue = createCodexPathValue(shellPathValue);
  const env = createProcessEnv(pathValue, proxy);
  const resolvedCommand = await resolveCodexCommand(command, pathValue);

  return {
    command: resolvedCommand,
    env
  };
}

function createProcessEnv(pathValue: string, proxy: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: pathValue
  };
  const trimmedProxy = proxy.trim();

  for (const key of PROXY_ENV_KEYS) {
    delete env[key];
  }

  if (!trimmedProxy) {
    return env;
  }

  return {
    ...env,
    HTTP_PROXY: trimmedProxy,
    HTTPS_PROXY: trimmedProxy,
    ALL_PROXY: trimmedProxy,
    http_proxy: trimmedProxy,
    https_proxy: trimmedProxy,
    all_proxy: trimmedProxy,
    npm_config_proxy: trimmedProxy,
    npm_config_https_proxy: trimmedProxy
  };
}

function createCodexPathValue(shellPathValue: string | null): string {
  const fallbackPaths = [
    path.join(os.homedir(), ".local", "devtools", "node", "current", "bin"),
    path.join(os.homedir(), ".local", "npm-global", "bin"),
    path.join(os.homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin"
  ];
  const segments = [...fallbackPaths, shellPathValue || "", process.env.PATH || ""]
    .flatMap((value) => value.split(":"))
    .filter(Boolean);

  return [...new Set(segments)].join(":");
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

export function createMissingCodexCliMessage(command: string): string {
  return [
    `未找到 Codex 命令行工具：${command}。`,
    "请先确认本机已安装 Codex CLI，并在系统终端运行 `codex --version` 检查是否可用。",
    "如果终端可用但 cxDesinger 仍找不到，请打开应用设置，将 Codex CLI 完整路径填进去；可在终端运行 `command -v codex` 获取路径。",
    "macOS 图形应用可能拿不到你的 shell PATH，所以只在终端能运行并不一定代表应用内能找到。"
  ].join(" ");
}

async function resolveLoginShellPath(): Promise<string | null> {
  const shell = process.env.SHELL || "/bin/zsh";

  try {
    const { stdout } = await execFileAsync(shell, ["-lc", 'printf "%s" "$PATH"'], {
      timeout: 3000,
      env: {
        ...process.env,
        TERM: "xterm-256color"
      }
    });
    const pathValue = stdout.trim();

    return pathValue || null;
  } catch {
    return null;
  }
}

async function resolveWithLoginShell(command: string): Promise<string | null> {
  const shell = process.env.SHELL || "/bin/zsh";
  const quotedCommand = command.replace(/'/g, "'\\''");

  try {
    const { stdout } = await execFileAsync(shell, ["-lc", `command -v '${quotedCommand}'`], {
      timeout: 3000,
      env: {
        ...process.env,
        TERM: "xterm-256color"
      }
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
