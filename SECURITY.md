# Security Policy

## Supported Versions

当前项目仍处于 `0.x` 早期阶段，安全修复优先落在最新版本。

## Reporting a Vulnerability

如果你发现安全问题，请不要直接公开包含利用细节的 Issue。建议通过 GitHub 私密安全报告功能提交；如果仓库尚未启用该功能，请先创建一个不包含敏感细节的 Issue，说明需要私下沟通安全问题。

报告中请尽量包含：

- 影响范围。
- 复现步骤。
- 潜在影响。
- 已验证的环境版本。
- 建议修复方向，如有。

## Security Notes

- 不要提交 API Key、访问令牌、Cookie、用户项目数据或 Codex 会话日志。
- `pages.json`、`docs/`、`assets/` 可能包含用户业务信息，公开示例前请先脱敏。
- 本应用会调用本机 Codex CLI。请仅在可信项目目录中使用，并检查 Codex 配置和权限。
- Electron 主进程能力必须通过 preload 暴露最小 IPC API，避免在渲染进程开放 Node.js 能力。
