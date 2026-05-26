# 8PM Studio

**Package agents, instructions, and skills once, then apply them to Codex, Claude, Gemini, OpenCode, and local assistant workflows.**

[![npm version](https://img.shields.io/npm/v/8pm-studio?style=flat-square)](https://www.npmjs.com/package/8pm-studio)
![Node.js >=20.19.0](https://img.shields.io/badge/Node.js-%3E%3D20.19.0-3c873a?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-0f172a?style=flat-square)](./LICENSE)

[Quick Start](#quick-start) | [Why 8PM Studio](#why-8pm-studio) | [Concepts](#concepts) | [CLI](#cli) | [Development](#development)

![8PM Studio canvas](.github/screenshot.png)

8PM Studio is a local workspace for discovering, designing, and injecting reusable coding-agent packages. It gives you a visual canvas for composing instructions, skills, model settings, tools, and multi-agent workflows, then projects that package into the assistant runtime you choose.

The core idea is simple: build an APM-style agent package, keep it versionable and inspectable, and sync it into the coding assistants you already use.

## Quick Start

Requirements:

- Node.js `>=20.19.0`
- macOS, Linux, Windows, or WSL
- OpenCode for local runtime execution

```bash
npm install -g 8pm-studio
8pm-studio /path/to/project
```

From source:

```bash
npm install
npm run dev
```

## Why 8PM Studio

AI coding assistants are powerful, but their reusable behavior often ends up scattered across prompts, skill folders, project docs, model settings, and app-specific config. 8PM Studio turns those pieces into APM-backed packages you can inspect, revise, run, and sync.

| Capability | What it gives you |
| --- | --- |
| Agent packages | Compose instructions, skills, model settings, and tools as reusable packages. |
| Visual editing | Arrange agents and team workflows on a local canvas. |
| Agent Sync | Manually apply packages to external coding assistants such as Codex, with room for Claude and Gemini providers. |
| Runtime chat | Test standalone agents and multi-agent workflows through the local runtime. |
| APM-first state | Keep canonical package state in `.8pm-studio/packages/<packageId>/apm.yml` while generated runtime artifacts stay disposable. |
| Explore, Design, Inject | Explore source-reference presets, design packages locally, then inject them into assistant apps through Agent Sync. |
| GitHub-backed registry | Import community listings as APM packages without copying package content into the registry. |

## Concepts

| Concept | Role |
| --- | --- |
| Instruction | The always-on instruction layer for an agent. |
| Skill | A reusable capability bundle, usually backed by `SKILL.md`. |
| Agent Package | A runnable agent built from instruction, skills, model settings, and tools. |
| Team Workflow | A multi-agent workflow with participants, relationships, and collaboration rules. |
| Agent Sync | A management mode for applying packages to external assistant apps. |

```text
Instruction + Skills + model + tools = Agent Package
Agent Packages + rules = Team Workflow
Agent Sync = apply packages to assistant apps
```

The community registry lives in the sibling `8pm-registry` Worker project. It stores GitHub source references, import recipes, target compatibility, trust metadata, and presets; package content remains in source repositories and local APM manifests.

## CLI

```bash
8pm-studio [path] [options]
8pm-studio open [path] [options]
8pm-studio doctor [path] [options]
8pm-studio --help
8pm-studio --version
```

Examples:

```bash
8pm-studio
8pm-studio --openai-oauth
8pm-studio ~/projects/my-app
8pm-studio --openai-oauth --team <team-urn>
8pm-studio ~/projects/my-app --agent <agent-urn>
8pm-studio open . --no-open
8pm-studio open . --port 43111
8pm-studio doctor
```

Behavior:

- `8pm-studio` opens the current directory as a workspace.
- `8pm-studio <path>` opens that directory as a workspace.
- `--openai-oauth` connects OpenAI through browser OAuth before the browser UI opens.
- `--agent <urn>` prepares and focuses an agent package.
- `--team <urn>` prepares and focuses a team workflow.
- `8pm-studio doctor` checks Node.js, workspace path, ports, and OpenCode readiness.

## Managed Runtime

8PM Studio starts and owns its OpenCode sidecar automatically. App-owned config lives under `~/.8pm-studio/opencode`.

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
- `server/`: API routes, Explore import behavior, assistant sync, runtime preparation, and projections.
- `.opencode/`: generated runtime artifacts.
- `doc/`: behavior and boundary guides.

The former external asset contract and registry helpers now live inside this repo. `dance-of-tal` is no longer an npm dependency.
