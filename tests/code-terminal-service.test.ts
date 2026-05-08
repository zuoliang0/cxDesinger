import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { WebContents } from "electron";
import type { IPty } from "node-pty";
import { beforeEach, describe, expect, it, vi } from "vitest";

let dataHandler: ((data: string) => void) | null = null;
let exitHandler: ((event: { exitCode: number; signal?: number }) => void) | null = null;
const fakePty = {
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn((handler: (data: string) => void) => {
    dataHandler = handler;
  }),
  onExit: vi.fn((handler: (event: { exitCode: number; signal?: number }) => void) => {
    exitHandler = handler;
  })
};

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => fakePty)
}));

import { spawn } from "node-pty";
import { CodeTerminalService } from "../electron/main/services/code-terminal-service";

async function makeTempDir(name: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

describe("CodeTerminalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataHandler = null;
    exitHandler = null;
  });

  async function makeExecutableCommand(rootDir: string) {
    const command = path.join(rootDir, "fake-codex");
    await fs.writeFile(command, "#!/bin/sh\n", "utf8");
    await fs.chmod(command, 0o755);
    return command;
  }

  it("creates a codex pty in the project root and streams data back", async () => {
    const projectRoot = await makeTempDir("code-terminal");
    const command = await makeExecutableCommand(projectRoot);
    const send = vi.fn();
    const webContents = {
      id: 1,
      isDestroyed: () => false,
      send
    } as unknown as WebContents;
    const service = new CodeTerminalService();

    await service.createTerminal(
      { projectRoot, terminalId: "terminal-1", cols: 120, rows: 32 },
      { codex: { command, args: ["--model", "gpt-5.5"], timeoutMs: 1000 } },
      webContents
    );

    expect(spawn).toHaveBeenCalledWith(
      command,
      ["--model", "gpt-5.5"],
      expect.objectContaining({
        cols: 120,
        rows: 32,
        cwd: projectRoot
      })
    );

    dataHandler?.("hello");
    expect(send).toHaveBeenCalledWith("codeTerminal:data", {
      terminalId: "terminal-1",
      data: "hello"
    });
  });

  it("writes, resizes, closes, and reports exit for terminal sessions", async () => {
    const projectRoot = await makeTempDir("code-terminal");
    const command = await makeExecutableCommand(projectRoot);
    const send = vi.fn();
    const webContents = {
      id: 2,
      isDestroyed: () => false,
      send
    } as unknown as WebContents;
    const service = new CodeTerminalService();

    await service.createTerminal(
      { projectRoot, terminalId: "terminal-2" },
      { codex: { command, args: [], timeoutMs: 1000 } },
      webContents
    );

    service.writeTerminal({ terminalId: "terminal-2", data: "prompt\n" });
    service.resizeTerminal({ terminalId: "terminal-2", cols: 90, rows: 24 });
    expect(fakePty.write).toHaveBeenCalledWith("prompt\n");
    expect(fakePty.resize).toHaveBeenCalledWith(90, 24);

    exitHandler?.({ exitCode: 0 });
    expect(send).toHaveBeenCalledWith("codeTerminal:exit", {
      terminalId: "terminal-2",
      exitCode: 0,
      signal: undefined
    });
    expect(() => service.writeTerminal({ terminalId: "terminal-2", data: "again" })).not.toThrow();
  });
});
