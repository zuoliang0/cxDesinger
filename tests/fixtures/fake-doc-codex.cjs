#!/usr/bin/env node
const fs = require("node:fs");

const args = process.argv.slice(2);
const outputIndex = args.findIndex((arg) => arg === "--output-last-message" || arg === "-o");
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : "";

if (!outputPath) {
  console.error("missing output path");
  process.exit(2);
}

process.stdin.resume();
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  console.log("2026-05-07T06:13:53.134706Z WARN codex_core::plugins::manifest: ignoring interface.defaultPrompt: prompt must be at most 128 characters path=/Users/demo/.codex/tmp/plugins/noisy/plugin.json");
  console.log("2026-05-07T07:02:32.800427Z WARN codex_core_skills::loader: ignoring interface.icon_small: icon path must not contain '..'");
  console.log("2026-05-07T07:02:32.800433Z WARN codex_core_skills::loader: ignoring interface.icon_large: icon path must not contain '..'");
  console.log("doc stdout: revising markdown");
  console.error("WARNING: proceeding, even though we could not update PATH: Operation not permitted (os error 1)");
  console.error("2026-05-07T07:02:22.150409Z WARN codex_rmcp_client::stdio_server_launcher: Failed to terminate MCP process group 10237: Operation not permitted (os error 1)");
  console.error("doc stderr: progress detail");

  if (input.includes("新建一份 Markdown 文档")) {
    fs.writeFileSync(
      outputPath,
      JSON.stringify({
        title: "商业模式说明",
        fileName: "business-model.md",
        content: "# 商业模式说明\n\n这是参考已有文档生成的新文档。",
        summary: "已创建商业模式说明文档"
      })
    );
    return;
  }

  fs.writeFileSync(
    outputPath,
    JSON.stringify({
      content: "# PRD\n\n已按修改意见更新当前文档。",
      summary:
        args.includes("gpt-5.4") && args.includes('model_reasoning_effort="high"')
          ? "高思考 gpt-5.4"
          : "已更新当前文档"
    })
  );
});
