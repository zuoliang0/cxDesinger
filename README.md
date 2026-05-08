# cxDesinger

[简体中文](./README.zh-CN.md)

cxDesinger is an open-source AI product design studio built around Codex. Think of it as an early, local-first answer to the question: what would a Figma-like workspace look like if product planning, interface generation, asset extraction, and implementation were all powered by an AI coding agent?

It turns a product idea into a structured project workspace: requirements become living documents, page plans become generated UI concepts, UI concepts become reusable assets, and the same workspace can continue into code. The ambition is to make cxDesinger the open-source creative operating system for AI-native product teams, indie makers, and builders who want to move from idea to working software without stitching together five separate tools.

> This project is still early-stage software, but the direction is intentionally bold: an open, hackable product-design-to-code environment for the Codex era. Codex CLI and image generation capabilities are not bundled with the app; users must install and authenticate Codex separately.

## Why cxDesinger

- **A Figma-like center of gravity for AI product creation**: one place for product thinking, page design, asset slicing, and implementation context.
- **Local-first project ownership**: every generated document, UI image, background, slice asset, and metadata file stays inside the user's project folder.
- **AI-native design pipeline**: Codex does not just chat; it reads project context, updates planning files, generates UI images, extracts assets, and prepares implementation-ready metadata.
- **Built for builders, not slideware**: the workflow continues into a real project file tree and Codex terminal, so design decisions can turn into code in the same workspace.

## Features

### Project Workspace

![Home screen](./docs/imgs/主页.png)

- Create a new self-contained product project or open an existing project folder.
- Initialize `docs/`, `assets/`, `logs/`, `pages.json`, and a local Git repository for the product project.
- Keep planning documents, UI images, generated assets, slice selections, and page metadata inside the selected project directory.
- Export the current AI product project as a ZIP archive.
- Switch the application UI between English, Simplified Chinese, and German.

### Product Planning

![Product planning screen](./docs/imgs/产品规划页面.png)

- Describe a product idea in natural language and let Codex generate a structured planning package.
- Generate and maintain PRD, feature plan, technical plan, style guide, page plan, feature list, and optional animation list for app projects.
- Render generated documents as Markdown inside the app.
- Add line-level comments to documents and send document-specific revision instructions without regenerating the entire planning package.
- Sync `page-plan.md` back into `pages.json` so later UI generation can use the latest page list and page descriptions.

### Page Design and Asset Extraction

![Page generation screen](./docs/imgs/页面生成.png)

- Generate UI concept images for each page from `pages.json` and user prompts.
- Keep page image versions on disk and switch the active version without losing previous results.
- Annotate regions on an existing UI image, send the annotation plus the reference image to Codex, and regenerate a new image version.
- Extract clean reusable page backgrounds and store the selected background path in `pages.json`.
- Let AI identify candidate slice regions, review/edit them, select multiple regions, and batch-generate assets.
- Force-regenerate selected slices when an existing asset needs to be retried.
- Store generated assets with stable IDs, names, descriptions, paths, source images, and selection coordinates for later implementation work.

### Code Workspace

![Code workspace screen](./docs/imgs/代码编写.png)

- Browse the current product project directory from a built-in file tree.
- Open text files in editor tabs with line numbers, syntax highlighting, formatting support, and save conflict checks.
- Keep a fixed Home Codex terminal running in the selected project directory.
- Duplicate terminal or file tabs for parallel implementation workflows.

### Safety Boundary

- The renderer process does not directly access the filesystem or spawn processes.
- All filesystem, Codex, terminal, ZIP, and image-related capabilities are routed through the Electron main process and preload IPC API.
- Project files stay local unless the user explicitly exports or publishes them.

## Important: Codex Authentication

cxDesinger expects Codex to run with account-based authentication, usually through the Codex CLI browser login flow.

Do not rely on an API-token-only setup for this app:

- The page-image and asset-generation workflows depend on Codex's built-in image generation capability.
- API-token-only mode is not a supported path for image generation in this app.
- Long planning, UI generation, and batch asset generation can consume a large amount of usage quota.

A paid plan with sufficient Codex/image-generation quota is strongly recommended. If you are choosing a plan for regular use, prefer a paid subscription tier with enough allowance for long Codex sessions and image generation. If you are considering an entry paid tier around USD 20/month, verify the current Codex and image-generation limits first; plan names, prices, and quotas should always be checked against OpenAI's official pages.

## Requirements

- macOS. The current packaging script mainly targets Apple Silicon.
- Node.js 20 or later.
- npm 10 or later.
- Codex CLI installed and authenticated through the account login flow.

If the app cannot discover Codex from `PATH`, set the executable path in app settings or via environment variable:

```bash
CODEX_CLI_PATH=/absolute/path/to/codex
```

## Quick Start

```bash
npm install
npm run dev
```

Development mode starts both Vite and Electron. The renderer is usually served at `http://127.0.0.1:5173/`.

To use a fixed renderer port:

```bash
npm run dev:renderer -- --host 127.0.0.1 --port 5184
VITE_DEV_SERVER_URL=http://127.0.0.1:5184 npm run dev:electron
```

## Scripts

```bash
npm run typecheck
npm test
npm run build
npm run dist:mac:arm64
```

- `typecheck`: checks renderer and main-process TypeScript.
- `test`: runs Vitest unit tests.
- `build`: builds the Electron main process and Vite renderer.
- `dist:mac:arm64`: creates an unsigned Apple Silicon DMG in `release/`.

## Project Data Layout

User-created AI product projects are self-contained:

```text
project-root/
  docs/
  assets/
  logs/
  pages.json
```

`pages.json` stores the core project metadata:

- `project`: project identity and type.
- `documents`: generated and revised document index.
- `pages`: page plan, UI prompts, active image version, background image, and update state.
- `sliceSelections`: user or AI identified slice regions.
- `assets`: generated assets with stable `id`, name, description, path, and source selection.

## Architecture

```text
electron/
  main/       Electron main process: filesystem, Codex calls, terminals, ZIP export
  preload/    Safe IPC API bridge
src/
  renderer/   React renderer process
  shared/     Shared types and validation
tests/        Service, provider, component, and utility tests
```

The renderer process does not directly access the filesystem or spawn processes. It uses the minimal IPC API exposed by preload.

## Security and Privacy

- The app reads and writes files inside the project directory selected by the user.
- Codex calls may read project documents, page plans, image paths, and asset descriptions.
- This repository does not include API keys and should not store secrets.
- Do not commit `.env`, logs, generated packages, user projects, private screenshots, or sensitive generated assets.

## Packaging

```bash
npm run build
npm run dist:mac:arm64
```

The current DMG is unsigned and not notarized. Test users may need to right-click to open the app or allow it from macOS System Settings.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before contributing.

## License

This project is open source under the [MIT License](./LICENSE).
