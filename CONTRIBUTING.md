# Contributing

感谢你考虑为 cxDesinger 贡献代码。项目仍处于早期阶段，优先接受范围清晰、可验证、能改善核心工作流的改动。

## 开发流程

1. Fork 仓库并创建特性分支。
2. 安装依赖：

   ```bash
   npm install
   ```

3. 启动开发环境：

   ```bash
   npm run dev
   ```

4. 修改完成后运行验证：

   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

5. 提交 Pull Request，并说明变更动机、测试结果和潜在风险。

## 代码原则

- 保持改动小而聚焦，避免无关重构。
- 渲染进程不得直接访问文件系统或启动进程，必须走 preload 暴露的安全 IPC API。
- 主进程处理文件系统、Codex 调用、终端和导出能力。
- 新增跨进程接口时，同步更新共享类型、preload API 和测试。
- 不提交用户项目数据、日志、构建产物、DMG、ZIP 或密钥。

## Pull Request Checklist

- [ ] 变更范围清晰，没有混入无关格式化。
- [ ] 已运行 `npm run typecheck`。
- [ ] 已运行 `npm test`。
- [ ] 已运行 `npm run build`。
- [ ] 如涉及 UI，已手动验证关键路径。
- [ ] 如涉及文件或进程能力，已考虑路径穿越、二进制文件和超时处理。

## Issue 建议

提交 Bug 时请尽量包含：

- 操作系统和芯片架构。
- Node.js、npm、Codex CLI 版本。
- 复现步骤。
- 预期行为与实际行为。
- 相关日志或截图，注意先移除敏感信息。
