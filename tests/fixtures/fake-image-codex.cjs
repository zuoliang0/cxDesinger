#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const outputIndex = args.findIndex((arg) => arg === "--output-last-message" || arg === "-o");
const outputMessagePath = outputIndex >= 0 ? args[outputIndex + 1] : "";
const cdIndex = args.findIndex((arg) => arg === "--cd");
const projectRoot = cdIndex >= 0 ? args[cdIndex + 1] : process.cwd();

if (!outputMessagePath) {
  console.error("missing output-last-message path");
  process.exit(2);
}

if (args.includes("--timeout")) {
  setTimeout(() => undefined, 10_000);
  return;
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  const match = input.match(/目标输出路径：(.+)/);
  const relativePath = match ? match[1].trim() : "assets/pages/page_home/ui.png";
  const outputPath = path.join(projectRoot, relativePath);

  console.log("image stdout: generating png");
  if (input.includes("批量生成独立精修 PNG 素材")) {
    const selectionIds = Array.from(input.matchAll(/切图区域 ID：(.+)/g)).map((item) => item[1].trim());
    const outputPaths = Array.from(input.matchAll(/目标输出路径：(.+)/g)).map((item) => item[1].trim());
    const assets = outputPaths.map((itemPath, index) => {
      const itemOutputPath = path.join(projectRoot, itemPath);

      fs.mkdirSync(path.dirname(itemOutputPath), { recursive: true });
      fs.writeFileSync(
        itemOutputPath,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lp/90wAAAABJRU5ErkJggg==",
          "base64"
        )
      );

      return {
        selectionId: selectionIds[index] || `selection_${index + 1}`,
        path: itemPath,
        name: "开始涂色按钮",
        description: "参考图框选区域中的主操作按钮，使用高对比圆角卡片风格，适合儿童点击开始涂色。"
      };
    });

    fs.writeFileSync(outputMessagePath, JSON.stringify({ assets }));
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lp/90wAAAABJRU5ErkJggg==",
      "base64"
    )
  );
  fs.writeFileSync(outputMessagePath, JSON.stringify({ path: relativePath }));
});
