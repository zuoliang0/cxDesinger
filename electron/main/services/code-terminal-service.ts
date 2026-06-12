import fs from "node:fs/promises";
import path from "node:path";
import { spawn as spawnChild } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { WebContents } from "electron";
import type { IPty } from "node-pty";
import { spawn as spawnPty } from "node-pty";
import type {
  AppSettings,
  CreateCodeTerminalInput,
  ResizeCodeTerminalInput,
  WriteCodeTerminalInput
} from "../../../src/shared/types";
import { prepareCodexProcess } from "../utils/codex-command";

interface TerminalSession {
  terminal: TerminalProcess;
  webContentsId: number;
}

interface TerminalProcess {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode?: number; signal?: number }) => void): void;
}

export class CodeTerminalService {
  private readonly sessions = new Map<string, TerminalSession>();

  async createTerminal(
    input: CreateCodeTerminalInput,
    settings: AppSettings,
    webContents: WebContents
  ): Promise<void> {
    await fs.access(input.projectRoot);
    this.closeTerminal(input.terminalId);

    const codexProcess = await prepareCodexProcess(settings.codex.command || "codex", settings.codex.proxy);
    const env = this.createTerminalEnv(codexProcess.env);
    const command = codexProcess.command;
    const args = this.createTerminalArgs(command, settings.codex.args, Boolean(input.resumeLast));
    const terminal = this.spawnTerminal(command, args, input.projectRoot, env, {
      cols: input.cols || 100,
      rows: input.rows || 30
    });

    this.sessions.set(input.terminalId, {
      terminal,
      webContentsId: webContents.id
    });

    terminal.onData((data) => {
      if (!webContents.isDestroyed()) {
        webContents.send("codeTerminal:data", {
          terminalId: input.terminalId,
          data
        });
      }
    });

    terminal.onExit(({ exitCode, signal }) => {
      this.sessions.delete(input.terminalId);

      if (!webContents.isDestroyed()) {
        webContents.send("codeTerminal:exit", {
          terminalId: input.terminalId,
          exitCode,
          signal
        });
      }
    });
  }

  writeTerminal(input: WriteCodeTerminalInput): void {
    this.sessions.get(input.terminalId)?.terminal.write(input.data);
  }

  resizeTerminal(input: ResizeCodeTerminalInput): void {
    this.sessions.get(input.terminalId)?.terminal.resize(input.cols, input.rows);
  }

  closeTerminal(terminalId: string): void {
    const session = this.sessions.get(terminalId);

    if (!session) {
      return;
    }

    this.sessions.delete(terminalId);
    session.terminal.kill();
  }

  closeWebContentsTerminals(webContentsId: number): void {
    for (const [terminalId, session] of this.sessions.entries()) {
      if (session.webContentsId === webContentsId) {
        this.closeTerminal(terminalId);
      }
    }
  }

  closeAll(): void {
    for (const terminalId of this.sessions.keys()) {
      this.closeTerminal(terminalId);
    }
  }

  private getSession(terminalId: string): TerminalSession {
    const session = this.sessions.get(terminalId);

    if (!session) {
      throw new Error("终端会话不存在或已退出");
    }

    return session;
  }

  private createTerminalEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return {
      ...env,
      TERM: "xterm-256color"
    };
  }

  private createTerminalArgs(command: string, args: string[], resumeLast: boolean): string[] {
    if (!resumeLast || !this.isCodexCommand(command)) {
      return args;
    }

    if (args[0] === "resume") {
      return args;
    }

    return ["resume", "--last", ...args];
  }

  private isCodexCommand(command: string): boolean {
    return path.basename(command).toLowerCase() === "codex";
  }

  private spawnTerminal(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    size: { cols: number; rows: number }
  ): TerminalProcess {
    try {
      return spawnPty(command, args, {
        name: "xterm-256color",
        cols: size.cols,
        rows: size.rows,
        cwd,
        env
      });
    } catch (error) {
      if (!String((error as Error).message || error).includes("posix_spawnp failed")) {
        throw error;
      }

      return new ExpectTerminalProcess(command, args, cwd, env);
    }
  }
}

class ExpectTerminalProcess implements TerminalProcess {
  private readonly child: ChildProcessWithoutNullStreams;

  constructor(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
    const commandAndArgs = [command, ...args].map((value) => this.quoteTclString(value)).join(" ");
    const script = [
      "log_user 1",
      "set timeout -1",
      `set command_and_args [list ${commandAndArgs}]`,
      "spawn -noecho {*}$command_and_args",
      "interact"
    ].join("\n");

    this.child = spawnChild("/usr/bin/expect", ["-c", script], {
      cwd,
      env,
      stdio: "pipe"
    });
  }

  write(data: string): void {
    this.child.stdin.write(data);
  }

  resize(): void {
    // The expect fallback allocates a PTY but does not expose resize controls.
  }

  kill(): void {
    this.child.kill();
  }

  onData(listener: (data: string) => void): void {
    this.child.stdout.on("data", (chunk) => listener(chunk.toString()));
    this.child.stderr.on("data", (chunk) => listener(chunk.toString()));
  }

  onExit(listener: (event: { exitCode?: number; signal?: number }) => void): void {
    this.child.on("exit", (exitCode, signal) => {
      listener({
        exitCode: exitCode ?? undefined,
        signal: typeof signal === "string" ? undefined : signal ?? undefined
      });
    });
  }

  private quoteTclString(value: string): string {
    return `"${value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\$/g, "\\$")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]")}"`;
  }
}
