# Open Source Checklist

开源前建议逐项确认以下内容。

## 已准备

- [x] `README.md`：项目介绍、功能、运行方式、架构、打包和隐私说明。
- [x] `LICENSE`：MIT License。
- [x] `CONTRIBUTING.md`：贡献流程、验证命令和 PR checklist。
- [x] `SECURITY.md`：安全报告流程和安全注意事项。
- [x] `CODE_OF_CONDUCT.md`：基础社区行为规范。
- [x] `.github/ISSUE_TEMPLATE/*`：Bug 和 Feature 模板。
- [x] `.github/pull_request_template.md`：PR 模板。
- [x] `.env.example`：可选环境变量示例。
- [x] `.gitignore`：忽略依赖、构建产物、日志、本机 IDE 目录、测试临时文件、未签名安装包。
- [x] `package.json`：补充 `license: MIT`。

## 已验证

- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] `npm audit --audit-level=moderate`
- [x] 扫描源码未发现真实密钥。
- [x] 扫描源码未发现产品运行逻辑依赖用户机器固定绝对路径。

## 发布前仍需决策

- [x] 确认 MIT 是最终许可证。
- [ ] 确认 `LICENSE` 中版权主体是否保持 `cxDesinger contributors`，或替换为个人/组织名。
- [ ] 创建 GitHub 仓库后，在 `package.json` 中补充 `repository`、`bugs`、`homepage`。
- [ ] 决定是否保持 `private: true`。如果只在 GitHub 开源且不发布 npm 包，保留可以避免误发布；如果未来要发布 npm 包，需要移除。
- [x] 处理 `npm audit` 中的依赖风险：已升级 Electron 和 Vitest，并验证 audit、typecheck、test、build。
- [ ] 如果公开发布可下载应用，建议增加 macOS 签名和 notarize 流程。
- [ ] 如果仓库会启用 GitHub Actions，补充 CI：`npm ci`、`npm run typecheck`、`npm test`、`npm run build`。

## 不应提交

- `node_modules/`
- `dist-renderer/`
- `dist-electron/`
- `release/`
- `logs/`
- `.playwright-mcp/`
- `.idea/`
- `tmp/`
- `.env` 或任何真实密钥
- 用户创建的 AI 产品项目目录
- 包含业务敏感信息的截图、文档或生成图片
