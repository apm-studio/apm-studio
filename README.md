# APM Studio

<p align="center">
  <img src="https://raw.githubusercontent.com/apm-studio/apm-studio/main/.github/apm-studio-icon.png" alt="APM Studio icon" width="112" />
</p>

**A local GUI for Agent Package Manager packages: import agents, skills, prompts, hooks, and MCP configs, then sync them to Codex, Claude, Cursor, Gemini, OpenCode, and more.**

[![npm version](https://img.shields.io/npm/v/apm-studio?style=flat-square)](https://www.npmjs.com/package/apm-studio)
![Node.js >=20.19.0](https://img.shields.io/badge/Node.js-%3E%3D20.19.0-3c873a?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-0f172a?style=flat-square)](./LICENSE)

[Quick Start](#quick-start) | [APM Studio Flow](#apm-studio-flow) | [Microsoft APM](#microsoft-apm) | [CLI](#cli) | [Development](#development)

![APM Studio interface](https://raw.githubusercontent.com/apm-studio/apm-studio/main/.github/screenshot.png)

APM Studio is the visual layer for the APM ecosystem. It imports source references from GitHub, manages local packages in `packages/*`, runs Studio Agents with local runtime settings, and exports selected APM primitives into assistant target files when you choose to sync.

The npm package is `apm-studio`.

## Quick Start

Requirements:

- Node.js `>=20.19.0`
- macOS, Linux, Windows, or WSL
- OpenCode for local Studio Agent runtime
- Microsoft APM CLI for full target sync coverage

Install:

```bash
curl -fsSL https://raw.githubusercontent.com/apm-studio/apm-studio/main/public/install.sh | sh
```

Start immediately after install:

```bash
curl -fsSL https://raw.githubusercontent.com/apm-studio/apm-studio/main/public/install.sh | sh -s -- --start
```

Windows:

```powershell
irm https://raw.githubusercontent.com/apm-studio/apm-studio/main/public/install.ps1 | iex
```

Start immediately on Windows:

```powershell
iex "& { $(irm https://raw.githubusercontent.com/apm-studio/apm-studio/main/public/install.ps1) } -Start"
```

Manual npm install:

```bash
npm install -g apm-studio
apm-studio
```

The installer installs or updates `apm-studio`, checks for the upstream Microsoft APM CLI, delegates missing APM CLI setup to Microsoft APM, and runs `apm install` when the current workspace already has an `apm.yml`. It prints the concrete `apm-studio` start command when installation finishes. Use `--start` on Unix or `-Start` on Windows to launch Studio immediately from the installer.

## APM Studio Flow

| Step | What happens |
| --- | --- |
| Import | Search source references or paste a GitHub repo, preview detected primitives, then install selected packages locally. |
| Manage | Edit local APM package metadata and Studio Agent composition while keeping canonical package content under `packages/<packageId>/`. |
| Run | Test Studio Agents locally with Studio-only model settings that are not emitted to target assistant files. |
| Export | Sync selected APM agents, instructions, skills, prompts, commands, hooks, or MCP config into supported assistant targets. |

APM Studio keeps source and output separate:

```text
GitHub source -> packages/<packageId>/apm.yml -> Studio Agent runtime
                                             -> Export target sync -> assistant files
```

Studio-only workspace state lives in `.apm-studio/`. Generated OpenCode runtime projection lives in `.opencode/`. Assistant target files are written only through Export.

## Microsoft APM

APM Studio is the visual layer for the upstream Microsoft APM package format and CLI:

- GitHub: [microsoft/apm](https://github.com/microsoft/apm)
- Docs: [microsoft.github.io/apm](https://microsoft.github.io/apm/)

APM Studio keeps package authoring, local Studio Agent runs, and assistant target sync in one UI while delegating package validation and broad target installs to Microsoft APM. Target sync is CLI-first: Studio tries `APM_STUDIO_APM_CLI`, then `apm`, then `uvx --from git+https://github.com/microsoft/apm.git apm`. Studio-native fallback is limited to supported agent and skill sync when no CLI runner is available.

## CLI

```bash
apm-studio [path] [options]
apm-studio open [path] [options]
apm-studio doctor [path] [options]
apm-studio --help
apm-studio --version
```

Examples:

```bash
apm-studio
apm-studio ~/projects/my-app
apm-studio open . --no-open
apm-studio open . --port 43111
apm-studio doctor
```

Default local ports:

| Runtime piece | Port |
| --- | ---: |
| Published CLI app and API | `43100` |
| Published CLI managed OpenCode sidecar | `43102` |
| Dev client | `43200` |
| Dev API | `43201` |
| Dev managed OpenCode sidecar | `43202` |

## Development

```bash
npm install
npm run dev
npm run type-check
npm test
```

Release check:

```bash
npm run pack:check
npm publish --dry-run
```

Publishing a fix requires a new npm version so `npm install -g apm-studio` and the installers' default `latest` tag can receive it.

Important directories:

- `src/`: browser UI and workspace state.
- `shared/`: client/server contracts for packages, runtime, workspace state, and target sync.
- `server/`: API routes, Import behavior, target sync, runtime preparation, and projections.
- `packages/`: canonical local APM package source.
- `.opencode/`: generated runtime artifacts.
- `doc/`: behavior and boundary guides.
