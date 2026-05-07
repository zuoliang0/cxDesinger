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
process.stdin.on("end", () => {
  if (args.includes("--fail")) {
    console.error("forced failure");
    process.exit(3);
  }

  fs.writeFileSync(
    outputPath,
    JSON.stringify({
      conversationMarkdown: "# 沟通记录\n\n用户提出了首版需求。",
      documents: {
        prd: "# PRD\n\n首版产品需求。",
        featurePlan: "# 功能规划\n\n- 新建项目\n- AI 规划",
        technicalPlan: "# 技术方案\n\nElectron + React。",
        styleGuide: "# 视觉规范\n\n- 使用统一的桌面工具视觉语言。\n- 保持页面色彩、按钮形态和信息密度一致。",
        pagePlan: "# 页面规划\n\n首页和页面管理。",
        featureList: "# 功能清单\n\n- 项目列表\n- 切图"
      },
      pages: [
        {
          name: "项目首页",
          route: "/projects",
          description: "展示项目列表和新建项目入口。",
          uiPrompt: "桌面工具首页，左侧项目列表，右上新建项目按钮。"
        }
      ]
    })
  );
});
