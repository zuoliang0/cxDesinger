import { spawn } from "node:child_process";

export interface RunProcessInput {
  command: string;
  args: string[];
  stdin?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface RunProcessResult {
  stdout: string;
  stderr: string;
}

export class ProcessRunError extends Error {
  constructor(
    message: string,
    readonly stdout: string,
    readonly stderr: string,
    readonly exitCode: number | null
  ) {
    super(message);
    this.name = "ProcessRunError";
  }
}

export function runProcess(input: RunProcessInput): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let cancelHandler: (() => void) | null = null;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      terminateChild();
      reject(new ProcessRunError(`命令执行超时：${input.command}`, stdout, stderr, null));
    }, input.timeoutMs);

    const terminateChild = () => {
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
          return;
        } catch {
          // Fall back to killing the direct child below.
        }
      }

      child.kill("SIGTERM");
    };

    cancelHandler = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      terminateChild();
      reject(new ProcessRunError(`命令已停止：${input.command}`, stdout, stderr, null));
    };

    if (input.signal?.aborted) {
      cancelHandler();
      return;
    }

    input.signal?.addEventListener("abort", cancelHandler, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      input.onStdout?.(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      input.onStderr?.(chunk);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      if (cancelHandler) {
        input.signal?.removeEventListener("abort", cancelHandler);
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      if (cancelHandler) {
        input.signal?.removeEventListener("abort", cancelHandler);
      }

      if (code !== 0) {
        reject(
          new ProcessRunError(
            stderr.trim() || stdout.trim() || `命令退出码：${code}`,
            stdout,
            stderr,
            code
          )
        );
        return;
      }

      resolve({ stdout, stderr });
    });

    if (input.stdin) {
      child.stdin.end(input.stdin);
    } else {
      child.stdin.end();
    }
  });
}
