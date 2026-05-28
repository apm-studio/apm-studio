# APM Studio

**Package agents, instructions, MCP, skills, and Studio-run models once, then inject them into Codex, Claude, OpenCode, and local assistant workflows.**

[![npm version](https://img.shields.io/npm/v/apm-studio?style=flat-square)](https://www.npmjs.com/package/apm-studio)
![Node.js >=20.19.0](https://img.shields.io/badge/Node.js-%3E%3D20.19.0-3c873a?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-0f172a?style=flat-square)](./LICENSE)

[Quick Start](#quick-start) | [Why APM Studio](#why-apm-studio) | [Concepts](#concepts) | [CLI](#cli) | [Development](#development)

![APM Studio canvas](.github/screenshot.png)

APM Studio is a local workspace for importing, managing, running, and injecting reusable coding-agent packages. It gives you a visual canvas for composing instructions, skills, MCP requirements, Studio Run model settings, and multi-agent workflows, then projects agent packages into the assistant runtime you choose.

The core idea is simple: build an APM-style agent package, keep it versionable and inspectable, and export it into the coding assistants you already use.

## Quick Start

Requirements:

- Node.js `>=20.19.0`
- macOS, Linux, Windows, or WSL
- OpenCode for local runtime execution

```bash
npm install -g apm-studio
apm-studio /path/to/project
```

From source:

```bash
npm install
npm run dev
```

## Why APM Studio

AI coding assistants are powerful, but their reusable behavior often ends up scattered across prompts, skill folders, project docs, model settings, and app-specific config. APM Studio turns those pieces into APM-backed packages you can import, manage, run, and export.

| Capability | What it gives you |
| --- | --- |
| Agent packages | Compose instructions, skills, MCP requirements, and Studio-run model settings as reusable packages. |
| Visual editing | Arrange agents and team workflows on a local canvas. |
| Inject | Export Studio agent packages and APM primitives to external coding assistants through a CLI-first target pipeline with Studio fallback where supported. |
| Runtime chat | Test standalone agents and multi-agent workflows through the local runtime. |
| APM-first state | Keep canonical package state in `.apm-studio/packages/<packageId>/apm.yml` plus the package `.apm/` source tree while generated runtime artifacts stay disposable. |
| Import, Manage, Run, Inject | Import source-reference presets, manage packages locally, run agents/teams in Studio, then export selected package units to assistant apps. |
| GitHub-backed registry | Preview and import community repos as APM packages without copying package content into the registry. |

## Concepts

| Concept | Role |
| --- | --- |
| Instruction | The always-on instruction layer for an agent. |
| Skill | A reusable capability bundle, usually backed by `SKILL.md`. |
| Agent Package | A runnable agent built from instruction, MCP, skills, and a Studio-only model setting. |
| Team Workflow | A multi-agent workflow with participants, relationships, and collaboration rules. |
| Inject | A management mode for exporting agent packages, agents, instructions, skills, and MCP configuration to external assistant apps. |

```text
Instruction + MCP + Skills + Studio Run model = Agent Package
Agent Packages + rules = Team Workflow
GitHub repo -> APM Studio -> APM CLI-first target projection -> assistant app
```

The community registry lives in the sibling `apm-registry` Worker project. It stores GitHub source references, import recipes, target compatibility, trust metadata, and presets; package content remains in source repositories and local APM manifests.

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

Behavior:

- `apm-studio` opens the current directory as a workspace.
- `apm-studio <path>` opens that directory as a workspace.
- `apm-studio doctor` checks Node.js, workspace path, ports, and OpenCode readiness.

## Managed Runtime

APM Studio starts and owns its OpenCode sidecar automatically. App-owned config lives under `~/.apm-studio/opencode`.

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

Important directories:

- `src/`: browser UI and workspace state.
- `shared/`: client/server contracts, including local asset contracts.
- `server/`: API routes, Import behavior, assistant export, runtime preparation, and projections.
- `.opencode/`: generated runtime artifacts.
- `doc/`: behavior and boundary guides.

The former external asset contract and registry helpers now live inside this repo. `dance-of-tal` is no longer an npm dependency.
