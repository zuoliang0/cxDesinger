# cxDesinger

cxDesinger 是一个基于 Electron 封装的 Codex 客户端，帮助用户一站式完成产品的规划、设计、资产切图和代码编写工作。

> 当前项目处于早期验证阶段，适合本地试用、二次开发和原型探索。Codex CLI 与图片生成能力不随应用内置，需要用户自行安装和配置。

## 功能概览

- 项目管理：创建或打开自包含项目目录，项目内维护 `docs/`、`assets/`、`pages.json`。
- 产品规划：调用 Codex 生成 PRD、功能规划、技术方案、视觉规范、页面规划和功能清单。
- 文档协作：Markdown 渲染、行级备注、针对单文档的修改沟通。
- 页面管理：基于 `pages.json` 生成页面 UI 图片，支持版本切换、批注重绘、背景提取、AI 识别切图、多区域切图和素材索引。
- 代码编写：内置项目文件树、轻量文件编辑器和运行在项目目录下的 Codex 终端。
- 项目导出：将当前项目根目录导出为 ZIP。

## 系统要求

- macOS，当前打包脚本主要面向 Apple Silicon。
- Node.js 20 或更高版本。
- npm 10 或更高版本。
- 已安装并登录可用的 Codex CLI。

如果应用无法从 PATH 找到 Codex CLI，可以在设置中填写完整路径，或通过环境变量指定：

```bash
CODEX_CLI_PATH=/absolute/path/to/codex
```

## 快速开始

```bash
npm install
npm run dev
```

开发模式默认启动 Vite 和 Electron。渲染进程地址通常为 `http://127.0.0.1:5173/`。

如果需要使用固定端口调试：

```bash
npm run dev:renderer -- --host 127.0.0.1 --port 5184
VITE_DEV_SERVER_URL=http://127.0.0.1:5184 npm run dev:electron
```

## 常用命令

```bash
npm run typecheck
npm test
npm run build
npm run dist:mac:arm64
```

说明：

- `typecheck`：检查渲染进程和主进程 TypeScript。
- `test`：运行 Vitest 单元测试。
- `build`：构建 Electron 主进程和 Vite 渲染产物。
- `dist:mac:arm64`：生成 Apple Silicon 未签名 DMG，输出到 `release/`。

## 项目数据结构

用户创建的 AI 产品项目目录是自包含的：

```text
project-root/
  docs/
  assets/
  logs/
  pages.json
```

核心数据在 `pages.json` 中维护：

- `project`：项目基础信息。
- `documents`：生成或修改后的文档索引。
- `pages`：页面规划、UI 提示词、当前图片版本、背景图等。
- `sliceSelections`：切图框选区域。
- `assets`：已生成素材，包含稳定 `id`、名称、描述、路径和来源选区。

## 架构概览

```text
electron/
  main/       Electron 主进程，负责文件系统、Codex 调用、终端、ZIP 导出
  preload/    安全 IPC API 暴露
src/
  renderer/   React 渲染进程
  shared/     主进程与渲染进程共享类型和校验
tests/        服务、Provider、组件与工具函数测试
```

渲染进程不直接访问文件系统或启动进程，所有能力都通过 preload 暴露的最小 IPC API 调用。

## 安全与隐私

- 应用会读取用户选择的项目目录，并在该目录内创建或修改项目文件。
- Codex 调用可能读取项目内文档、页面规划、图片路径和资源描述。
- 本项目不内置 API Key，也不要求在仓库中保存任何密钥。
- 不要提交 `.env`、日志、生成包、用户项目数据或包含敏感内容的截图。

## 打包说明

```bash
npm run build
npm run dist:mac:arm64
```

当前 DMG 未签名、未 notarize。分发给测试用户时，macOS 可能需要通过右键打开，或在系统设置中允许打开。

## 贡献

欢迎提交 Issue 和 Pull Request。开始前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。
