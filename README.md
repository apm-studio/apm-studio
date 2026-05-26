# Agent Roaster

**Package your coding agents once, then apply them to Codex, Claude, Gemini, OpenCode, and local assistant workflows.**

[![npm version](https://img.shields.io/npm/v/agent-roaster?style=flat-square)](https://www.npmjs.com/package/agent-roaster)
![Node.js >=20.19.0](https://img.shields.io/badge/Node.js-%3E%3D20.19.0-3c873a?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-0f172a?style=flat-square)](./LICENSE)

[Quick Start](#quick-start) | [Why Agent Roaster](#why-agent-roaster) | [Concepts](#concepts) | [CLI](#cli) | [Development](#development)

![Agent Roaster canvas](.github/screenshot.png)

Agent Roaster is a local workspace for designing reusable coding-agent packages. It gives you a visual canvas for composing instructions, skills, model settings, tools, and multi-agent workflows, then projects that package into the assistant runtime you choose.

The core idea is simple: build a useful agent package, keep it versionable and inspectable, and sync it into the coding assistants you already use.

## Quick Start

Requirements:

- Node.js `>=20.19.0`
- macOS, Linux, Windows, or WSL
- OpenCode for local runtime execution

```bash
npm install -g agent-roaster
agent-roaster /path/to/project
```

From source:

```bash
npm install
npm run dev
```

## Why Agent Roaster

AI coding assistants are powerful, but their reusable behavior often ends up scattered across prompts, skill folders, project docs, model settings, and app-specific config. Agent Roaster turns those pieces into packages you can inspect, revise, run, and sync.

| Capability | What it gives you |
| --- | --- |
| Agent packages | Compose identity, skills, model settings, and tools as reusable packages. |
| Visual editing | Arrange performers and workflows on a local canvas. |
| Assistant sync | Manually apply packages to external coding assistants such as Codex, with room for Claude and Gemini providers. |
| Runtime chat | Test standalone agents and multi-agent workflows through the local runtime. |
| Local-first state | Keep package state in your workspace while generated runtime artifacts stay disposable. |
| Registry and GitHub import | Install skills and packages from local, registry, or GitHub sources. |

## Concepts

| Concept | Role |
| --- | --- |
| `Tal` | The identity and instruction layer for an agent. |
| `Dance` | A reusable skill or capability bundle. |
| `Performer` | A runnable agent package built from Tal, Dances, model settings, and tools. |
| `Act` | A multi-agent workflow with participants, relationships, and collaboration rules. |
| `Agent Sync` | A management mode for applying packages to external assistant apps. |

```text
Tal + Dance + model + tools = Performer package
Performer packages + rules = Act workflow
Agent Sync = apply packages to assistant apps
```

## CLI

```bash
agent-roaster [path] [options]
agent-roaster open [path] [options]
agent-roaster doctor [path] [options]
agent-roaster --help
agent-roaster --version
```

Examples:

```bash
agent-roaster
agent-roaster --openai-oauth
agent-roaster ~/projects/my-app
agent-roaster --openai-oauth --act act/@acme/workflows/review-flow
agent-roaster ~/projects/my-app --performer performer/@acme/workflows/reviewer
agent-roaster open . --no-open
agent-roaster open . --port 43111
agent-roaster doctor
```

Behavior:

- `agent-roaster` opens the current directory as a workspace.
- `agent-roaster <path>` opens that directory as a workspace.
- `--openai-oauth` connects OpenAI through browser OAuth before the browser UI opens.
- `--performer <urn>` prepares and focuses a performer package.
- `--act <urn>` prepares and focuses a workflow.
- `agent-roaster doctor` checks Node.js, workspace path, ports, and OpenCode readiness.

## Managed Runtime

Agent Roaster starts and owns its OpenCode sidecar automatically. The sidecar uses app-owned config under `~/.agent-roaster/opencode`.

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
- `server/`: API routes, registry behavior, assistant sync, runtime preparation, and projections.
- `.opencode/`: generated runtime artifacts.
- `doc/`: behavior and boundary guides.

The former external asset contract and registry helpers now live inside this repo. `dance-of-tal` is no longer an npm dependency.
