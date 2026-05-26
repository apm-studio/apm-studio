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
- performer visibility
- Act board layout moves
- authoring-only UI state that does not affect runtime projection

`lazy_projection`

- performer create, update, delete
- performer Tal, Dance, model, variant, MCP, binding, and delivery mode changes
- Tal and Dance draft content changes
- installed GitHub Dance update or GitHub Dance re-import
- runtime-affecting uninstall or draft delete
- Act participant, relation, rule, and safety changes

`runtime_reload`

- OpenCode global config writes
- OpenCode project config writes
- provider auth save, OAuth completion, auth clear
- MCP catalog save
- MCP auth completion or auth clear

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

- performer TAL content is inserted raw at the top of the projected agent body
- do not add a synthetic `Core Instructions` heading
- do not inject fallback instructions when no TAL is configured
- preview or prewarm may materialize projection files
- preview or prewarm must not clear `projectionDirty`
- files may exist in a `projection pending adoption` state until a later dispose
- workspace saves must not sync generated external-agent files such as Codex project subagents
- server startup must not prewarm generated external-agent files such as Codex project subagents
- workspace performer projection materializes only Studio/OpenCode runtime artifacts; Codex project subagents are exported manually from Agent Sync
- Codex-supported projection models are kept conservative and follow the local Codex model catalog, including Codex Spark when available
- generated Codex subagents should project Studio model variant reasoning effort to Codex-native `model_reasoning_effort` when the selected variant exposes `reasoning.effort`
- when Studio stores the model variant as `null`/Default, generated Codex subagents should still write the Codex model's default `model_reasoning_effort` so the performer does not accidentally inherit the parent Codex session's effort
- generated Codex subagent names are derived from the performer name with a short performer-id hash suffix so sanitized names cannot collide
- generated Codex subagent files use the `dot_studio_*.toml` filename namespace for local cleanup, but the Codex-visible `name` should not include that namespace
- generated Codex subagent `developer_instructions` must contain only the raw performer TAL content
- generated Codex subagent Dance access must use Codex-native `[[skills.config]]` entries that point at Codex-discoverable `.agents/skills/dot-studio-*` skill links backed by Studio's projected `.opencode/skills/...` files
- generated Codex subagents must project the performer's selected MCP servers directly from Studio's MCP catalog, using Codex `[mcp_servers.<name>]` TOML tables; do not require OpenCode runtime tool resolution for Codex-only MCP projection
- generated Codex subagent MCP projection should use Codex-native `bearer_token_env_var` and `env_http_headers` when Studio remote header values are environment references such as `$TOKEN` or `${TOKEN}`
- generated Codex subagent MCP projection should use Codex-native `env_vars` when a local MCP environment value forwards the same variable name, such as `TOKEN=$TOKEN`
- Codex project subagent files are generated from Studio performer state and should be treated as local projection output, not hand-authored source
- Codex project subagent files are managed by `Agent Sync`, not by normal Studio save, startup, chat projection, or Act projection
- `GET /api/agent-sync` must be dry-run status calculation and must not write Codex TOML, skill links, skill files, or manifests
- `POST /api/agent-sync/codex/sync` is the manual path that may write Codex TOML, Dance skill files, `.agents/skills/dot-studio-*` symlinks, and manifest entries
- `POST /api/agent-sync/codex/prune` may remove only Codex/provider-owned stale immediate artifacts such as `.codex/agents/dot_studio_*.toml` and `.agents/skills/dot-studio-*`
- Codex-only projection writes do not require OpenCode `dispose`
- Codex-only manual sync may write Codex TOML, Dance skill files, and `.agents/skills/dot-studio-*` symlinks needed by `[[skills.config]]`, but must not rewrite projected OpenCode agent markdown files or mark `projectionPending`

## Act Rules

- Act thread create and runtime sync may prewarm projections
- prewarm must not call `dispose`
- Act participant execution should reuse the standalone performer projection
- Act-scoped participant projection must not create transient Codex project subagents
- Act collaboration context belongs in turn-scoped system prompt context
- merely targeting an Act participant must not widen adoption scope by itself
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
- dev sidecar/tooling paths should use the local `../dot` checkout for DOT imports and the runtime `dot` loader command
- production sidecar/tooling paths should use the packaged `dance-of-tal` dependency
- managed config root is `STUDIO_DIR/opencode`
- do not silently migrate MCP or config state from `~/.config/opencode`

## Terminal Runtime Boundary

- Studio terminal PTYs are owned by the Studio Hono server, not OpenCode
- OpenCode `instance.dispose` must not close pinned or canvas terminal sessions
- terminal exit and kill behavior belongs to `server/services/terminal-service.ts`
- terminal WebSocket routing belongs to the Hono route in `server/routes/terminal.ts`
- terminal shell selection follows this order:
  - `DOT_STUDIO_TERMINAL_SHELL`
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
