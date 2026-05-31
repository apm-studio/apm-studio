# Runtime Change Boundary Guide

## Purpose

This guide classifies runtime-affecting changes and keeps dispose timing consistent.

- OpenCode does not reliably pick up agent, MCP, and config changes immediately
- do not invent separate dispose policies for different mutation paths

## Canonical Policy

Studio has exactly three change classes.

1. `hot`
   - UI-only state
   - no projection write
   - no runtime reload
   - no chat blocking
2. `lazy_projection`
   - Agent, Team, draft, or package primitive change that affects projected agent or tool output
   - edit immediately
   - do not affect a currently running session
   - adopt at the next execution boundary
3. `runtime_reload`
   - OpenCode runtime config or auth change
   - record via `runtimeReloadPending`
   - wait for idle if a busy session exists

## Source Of Truth

- client policy: `src/store/runtime/change-policy.ts`, `src/store/runtime/execution.ts`
- server execution boundary: `server/services/runtime/preparation-service.ts`

Rules:

- client `projectionDirty` is only a hint
- the server execution boundary decides projection adoption blocking

## Entity Matrix

`hot`

- canvas position and size
- focus, selection, modal, and sidebar state
- terminal layout
- Agent visibility
- Team board layout moves
- authoring-only UI state that does not affect runtime projection

`lazy_projection`

- Agent create, update, delete
- Agent Instruction, Skill, model, variant, MCP, binding, and delivery mode changes. Model changes affect Studio Agent runtime projection only; external target sync must omit model selection.
- Instruction and Skill draft content changes
- local GitHub Skill update or GitHub Skill re-import
- runtime-affecting uninstall or draft delete
- Team participant, relation, rule, and safety changes

`runtime_reload`

- OpenCode global config writes
- OpenCode project config writes
- provider auth save, OAuth completion, auth clear
- MCP catalog save
- MCP auth completion or auth clear
- Settings > General > Auto-approve permissions writes Studio-owned OpenCode global `permission` config and is a runtime reload change

## Canonical State

Do not infer runtime change from broad workspace signatures.

Use:

- `runtimeReloadPending`
- `projectionDirty.agentIds`
- `projectionDirty.teamIds`
- `projectionDirty.draftIds`
- `projectionDirty.workspaceWide`

Rules:

- do not merge `runtimeReloadPending` and `projectionDirty`
- reload blocking should follow resolved session activity
- lazy projection blocking comes from the server boundary, not client heuristics

## Execution Flow

Every execution path should follow this order.

1. apply pending runtime reload
2. stop if reload is still blocked by a busy session
3. save workspace if lazy projection dirtiness exists
4. pass the local `projectionDirty` scope to the server as an adoption hint
5. let the server compile projection and decide whether dispose is required
6. continue without dispose if output did not change
7. stop if output changed and the same working directory still has a busy session
8. run `dispose` if output changed and the working directory is idle
9. clear only the dirty scopes actually consumed by execution
10. start with the new runtime snapshot

## Current Run Rule

- a busy session keeps the runtime snapshot it started with
- edits during that run do not affect that run
- the next run gets the new snapshot
- Discord-originated sends follow the same execution boundary as Studio web sends
- Discord permission and question actions are external UI responses over the existing runtime approval APIs, not a separate execution path
- Discord history backfill reads settled session messages and posts bounded text-only copies without changing runtime state

## Projection Rules

- Agent Instruction content is inserted raw at the top of the projected agent body
- do not add a synthetic `Core Instructions` heading
- do not inject fallback instructions when no Instruction is configured
- preview or prewarm may materialize projection files
- preview or prewarm must not clear `projectionDirty`
- files may exist in a `projection pending adoption` state until a later dispose
- workspace saves must not sync generated external-agent files such as Codex, Claude, or Gemini target files
- server startup must not prewarm generated external-agent files such as Codex, Claude, or Gemini target files
- workspace Agent projection materializes only Studio/OpenCode runtime artifacts; external assistant targets such as Codex, Claude, or Gemini are synced manually through APM target sync
- workspace Agent projection inputs use `SharedPrimitiveRef` from `shared/chat-contracts.ts`; projection modules must not define a local primitive-ref alias or parallel primitive reference shape
- `server/services/opencode-projection/workspace-agent-projection-service.ts` owns projection orchestration: skill compile, agent compile, file-write delegation, and returning the runtime snapshot. Workspace hash and projected Agent identity belong in `agent-projection-identity.ts`; tool/model capability resolution belongs in `agent-projection-runtime.ts`; request-target relation prompts belong in `agent-projection-relations.ts`; projection file writes, stale file cleanup, group manifest updates, git exclude updates, and projection-pending marks belong in `agent-projection-writer.ts`.
- external assistant files are generated from local APM package roots and should be treated as target sync output, not hand-authored source
- external assistant files are managed by the Manage target-sync page, not by normal Studio save, startup, chat projection, or Team projection
- `GET /api/apm/targets` must be a dry-run target/tooling status calculation and must not write assistant files. Target summaries include supported sync units, sync strategy, output hints, Studio-managed current items, and read-only target definition files so the Manage UI can compare APM Studio with the selected target.
- `POST /api/apm/sync` is the manual path that syncs the selected unit (`studio-agent`, `agents`, `instructions`, `skills`, `prompts`, `commands`, `hooks`, or `mcp`) to one or more targets. `studio-agent` is an agent-scoped composed artifact and is limited to Claude and Codex (Codex as subagent); APM primitive units follow the target capability registry for Codex, Claude, OpenCode, Cursor, Windsurf, Copilot, Gemini, and Agent Skills. Prompt and command sync both assemble `.apm/prompts/*.prompt.md`; the target capability decides whether the APM CLI writes prompts or commands. MCP sync assembles `apm.yml` `dependencies.mcp` entries, including self-defined command/args/env/url details imported from MCP config files. The route rejects unknown sync units, receives only Studio packages staged in the Manage Push queue, and prefers the external Microsoft APM CLI through a configured command, local `apm`, or `uvx --from git+https://github.com/microsoft/apm.git apm`; Studio-native TypeScript projection is a fallback only for supported Studio Agent, agent, and skill units.
- target sync writes do not require OpenCode `dispose`
- The Studio UI exposes this manual external-assistant sync as the top-level `Manage` mode; that mode remains a manual target-sync boundary and does not make external assistant files part of normal workspace save or runtime preparation. The screen should keep the flow simple: workspace context, Studio source cards, then one selected target panel where drag/drop or `Add to target` only stages a Push queue until the header `Sync` action commits file writes.
- Manage may list unmanaged target definition files, but it must only pair a Studio package with a target definition when `.apm-studio/projections/apm-sync.json` records the managed `packageId`; do not guess package-to-target matches from names, slugs, or file paths.
- The target-sync screen currently lives under `src/features/target-manage`; it should not be reintroduced through workspace/canvas feature barrels because external assistant target sync is not a workspace editing surface.
- APM target inspection and manual sync HTTP routes live in `server/routes/apm/sync.ts`; package CRUD and import routes should stay in their own APM route modules.
- Target-specific Studio fallback sync lives in `server/services/apm-package/studio-fallback-sync.ts`, but target availability must come from the single registry in `server/services/apm-package/sync-targets.ts`. Codex Studio Agent export projects as custom subagents; model selection remains Studio Agent runtime-only.
- CLI-first sync orchestration lives in `server/services/apm-package/target-sync.ts`; temporary APM package assembly belongs in `sync-temp-package.ts`, and copying CLI-produced target artifacts back into the workspace belongs in `sync-cli-artifacts.ts`.
- CLI sync and Studio fallback sync both record managed output in `.apm-studio/projections/apm-sync.json`; no separate fallback ownership file should be introduced.

## Team Rules

- Team thread create and runtime sync may prewarm projections
- prewarm must not call `dispose`
- Team participant execution should reuse the standalone Agent projection
- Team-scoped participant projection must not create external assistant target files
- Team collaboration context belongs in turn-scoped system prompt context
- Team runtime HTTP request/response contracts live in `shared/team-types.ts`; browser API clients, route handlers, Team runtime services, and Team tool endpoints should import the current thread, event, message, board, wake-condition, and error-response shapes instead of redefining local objects.
- Team runtime definition validation lives in `shared/team-definition-validation.ts`; route handlers and UI readiness checks should share that validator so runnable-state hints and server rejection rules do not drift.
- merely targeting a Team participant must not widen adoption scope by itself
- if projection adoption is blocked by a busy working directory, defer and retry the wake instead of dropping it
- stale `busy` and `retry` states should be corrected when the latest turn is already settled or parked on `wait_until`

## Managed Runtime Rules

- managed sidecar mode is the only supported Studio runtime mode
- `OPENCODE_URL` is not an external runtime attachment switch; Studio derives the sidecar URL from its managed port
- `dev:all` should preserve the same managed semantics
- `dev:all` should check readiness through the Studio API managed health path
- `dev:all` should force dev server mode plus the dev API and sidecar ports instead of inheriting production CLI env
- dev ports should stay separate from published CLI ports so a released Studio can drive source changes safely
- managed sidecar spawn must work without a Unix shell; package bin wrappers should be launched through Node when needed
- managed process shutdown must account for Windows process trees as well as Unix signals
- managed sidecar readiness should use OpenCode `/global/health`
- if a managed sidecar child is already alive, readiness retries must wait on that child rather than spawning a duplicate process
- if the managed sidecar port already has a reachable OpenCode process from a previous Studio run, Studio may reuse it for readiness instead of blocking startup; restart remains unavailable unless Studio owns the child process
- OpenCode adapter HTTP response contracts live in `shared/opencode-contracts.ts`; browser clients and route handlers should share those health, restart, runtime-apply, runtime tool resolution, MCP server/auth, config, file/find, provider-auth, usage, agent, and VCS shapes instead of local ad hoc response types.
- dev sidecar/tooling paths should use the repo-local APM Studio contract and registry implementation
- production sidecar/tooling paths must not depend on a development workspace name
- managed config root is `APM_STUDIO_HOME/opencode`, falling back to `~/.apm-studio/opencode`
- do not silently migrate MCP or config state from `~/.config/opencode`
- the Settings auto-approve permission toggle only manages the simple global permission modes `{}` and `{ "*": "allow" }`; if custom OpenCode permission rules exist, Studio should not overwrite them from the toggle

## Terminal Runtime Boundary

- Studio terminal PTYs are owned by the Studio Hono server, not OpenCode
- OpenCode `instance.dispose` must not close pinned or canvas terminal sessions
- terminal session orchestration, exit, and kill behavior belongs to `server/services/terminal/service.ts`; socket connection glue belongs in `server/services/terminal/terminal-connection.ts`; shell resolution/listing belongs in `server/services/terminal/terminal-shells.ts`; shared terminal service contracts belong in `server/services/terminal/terminal-types.ts`
- terminal WebSocket routing belongs to the Hono route in `server/routes/terminal/index.ts`
- terminal shell selection follows this order:
  - `APM_STUDIO_TERMINAL_SHELL`
  - Studio-owned OpenCode global config `shell`
  - platform default (`SHELL`/`zsh` on Unix, `ComSpec`/`cmd.exe` on Windows)
- Studio terminal WebSocket disconnects should reconnect to the existing Studio-owned PTY when the PTY itself is still alive

## Do Not Reintroduce

- mutation-path-specific ad hoc dispose
- send-path-specific projection policy forks
- save-time automatic dispose for lazy projection
- logic that lets a busy session adopt a new runtime snapshot mid-run
- a runtime policy centered on `buildRuntimeReloadSignature(...)`

## Checklist

- is the change clearly `hot`, `lazy_projection`, or `runtime_reload`
- is dispose ownership still at the server execution boundary
- is busy-session blocking checked at same-working-directory scope
- does preview or prewarm avoid clearing dirty state
