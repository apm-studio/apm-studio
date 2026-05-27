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
   - stage change that affects projected agent or tool output
   - edit immediately
   - do not affect a currently running session
   - adopt at the next execution boundary
3. `runtime_reload`
   - OpenCode runtime config or auth change
   - record via `runtimeReloadPending`
   - wait for idle if a busy session exists

## Source Of Truth

- client policy: `src/store/runtime-change-policy.ts`, `src/store/runtime-execution.ts`
- server execution boundary: `server/services/runtime-preparation-service.ts`

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
- Agent Instruction, Skill, model, variant, MCP, binding, and delivery mode changes
- Instruction and Skill draft content changes
- installed GitHub Skill update or GitHub Skill re-import
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
- `projectionDirty.performerIds`
- `projectionDirty.actIds`
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
- do not inject fallback instructions when no TAL is configured
- preview or prewarm may materialize projection files
- preview or prewarm must not clear `projectionDirty`
- files may exist in a `projection pending adoption` state until a later dispose
- workspace saves must not sync generated external-agent files such as Codex, Claude, or Gemini assistant exports
- server startup must not prewarm generated external-agent files such as Codex, Claude, or Gemini assistant exports
- workspace Agent projection materializes only Studio/OpenCode runtime artifacts; external assistant targets such as Codex, Claude, or Gemini are exported manually through APM target sync
- external assistant files are generated from local APM package roots and should be treated as target projection output, not hand-authored source
- external assistant files are managed by `Export`, not by normal Studio save, startup, chat projection, or Team projection
- `GET /api/apm/targets` must be a dry-run target/tooling status calculation and must not write assistant files
- `POST /api/apm/sync` is the manual path that may run `apm install <package-root> --target <target>` for one or more targets selected from Codex, Gemini, Claude, OpenCode, Cursor, Windsurf, and Copilot
- target export writes do not require OpenCode `dispose`
- The Studio UI exposes this manual external-assistant export as the top-level `Export` mode; that mode remains a manual export boundary and does not make external assistant export part of normal workspace save or runtime preparation
- The Export screen lives under `src/features/export`; it should not be reintroduced through workspace/canvas feature barrels because external assistant export is not a workspace editing surface.
- APM target inspection and manual sync HTTP routes live in `server/routes/apm-sync.ts`; package CRUD and import routes should stay in their own APM route modules.

## Team Rules

- Team thread create and runtime sync may prewarm projections
- prewarm must not call `dispose`
- Team participant execution should reuse the standalone Agent projection
- Team-scoped participant projection must not create external assistant target files
- Team collaboration context belongs in turn-scoped system prompt context
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
- dev sidecar/tooling paths should use the repo-local APM Studio contract and registry implementation
- production sidecar/tooling paths must not depend on `dance-of-tal`
- managed config root is `STUDIO_DIR/opencode`
- do not silently migrate MCP or config state from `~/.config/opencode`
- the Settings auto-approve permission toggle only manages the simple global permission modes `{}` and `{ "*": "allow" }`; if custom OpenCode permission rules exist, Studio should not overwrite them from the toggle

## Terminal Runtime Boundary

- Studio terminal PTYs are owned by the Studio Hono server, not OpenCode
- OpenCode `instance.dispose` must not close pinned or canvas terminal sessions
- terminal exit and kill behavior belongs to `server/services/terminal-service.ts`
- terminal WebSocket routing belongs to the Hono route in `server/routes/terminal.ts`
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
