import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareCodexProcess } from "../electron/main/utils/codex-command";

const originalShell = process.env.SHELL;
const originalHttpProxy = process.env.HTTP_PROXY;

async function makeExecutable(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, "utf8");
  await fs.chmod(filePath, 0o755);
}

describe("codex command utilities", () => {
  afterEach(() => {
    if (originalShell) {
      process.env.SHELL = originalShell;
    } else {
      delete process.env.SHELL;
    }

    if (originalHttpProxy) {
      process.env.HTTP_PROXY = originalHttpProxy;
      return;
    }

    delete process.env.HTTP_PROXY;
  });

  it("adds login shell PATH entries to the codex process environment", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-command-"));
    const shellPath = path.join(rootDir, "fake-shell");
    const commandPath = path.join(rootDir, "codex");
    const nodeBinPath = path.join(rootDir, "node-bin");

    await makeExecutable(
      shellPath,
      [
        "#!/bin/sh",
        "if [ \"$2\" = 'printf \"%s\" \"$PATH\"' ]; then",
        `  printf "%s" "${nodeBinPath}:/usr/bin:/bin"`,
        "fi"
      ].join("\n")
    );
    await makeExecutable(commandPath, "#!/bin/sh\n");
    process.env.SHELL = shellPath;

    const prepared = await prepareCodexProcess(commandPath, "");

    expect(prepared.command).toBe(commandPath);
    expect(prepared.env.PATH?.split(":")).toContain(nodeBinPath);
  });

  it("sets proxy environment variables only when proxy is configured", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-command-"));
    const commandPath = path.join(rootDir, "codex");

    await makeExecutable(commandPath, "#!/bin/sh\n");
    process.env.HTTP_PROXY = "http://old.proxy:8080";

    const withoutProxy = await prepareCodexProcess(commandPath, "");
    const withProxy = await prepareCodexProcess(commandPath, "socks5://127.0.0.1:7890/");

    expect(withoutProxy.env.HTTP_PROXY).toBeUndefined();
    expect(withoutProxy.env.HTTPS_PROXY).toBeUndefined();
    expect(withProxy.env.HTTP_PROXY).toBe("socks5://127.0.0.1:7890/");
    expect(withProxy.env.HTTPS_PROXY).toBe("socks5://127.0.0.1:7890/");
    expect(withProxy.env.ALL_PROXY).toBe("socks5://127.0.0.1:7890/");
  });
});
