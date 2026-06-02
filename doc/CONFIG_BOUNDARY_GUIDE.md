# Studio Config Boundary Guide

## Purpose

This guide keeps path and config ownership separate.

- do not treat every directory-like value as the same thing
- separate startup fallback, active workspace, saved workspace, request working dir, and OpenCode config scope

## 1. Server Fallback Project Dir

- code: `server/lib/config.ts`
- value: `DEFAULT_PROJECT_DIR`

Rules:

- it is only a server bootstrap fallback
- it is not a user-selected workspace
- use it only when request `workingDir` and explicit activation are both missing
- do not expose it to the client as the active workspace
- dev fallback is the parent of the Studio source checkout
- production fallback is the current working directory unless CLI startup provides `APM_STUDIO_PROJECT_DIR`

## 2. Explicit Active Project Dir

- code: `server/lib/config.ts`, `server/services/studio/service.ts`, `server/routes/studio/index.ts`
- set by: `POST /api/studio/activate`, CLI startup priming
- HTTP contract: `shared/studio-contracts.ts`

Rules:

- it is the only server-side directory that may be exposed as client `projectDir`
- it is runtime-only process state
- it is not a durable preference
- do not confuse it with `DEFAULT_PROJECT_DIR`

## 3. Studio Config File

- storage: `~/.apm-studio/studio-config.json`

Current durable fields:

- `theme`
- `lastWorkspaceId`

Rules:

- store only UI preference and restore hints
- do not store authoritative execution context here
- do not reconstruct startup directory from bootstrap fallback values
- route and client config types must use `shared/studio-contracts.ts`; do not redefine config, activate, open-path, or picker response shapes locally
- route error payloads must use `shared/api-contracts.ts` through the shared route error helper rather than local `{ error }` contracts
- OpenCode error handling should keep payload reading in `server/lib/opencode-error-readers.ts`, error-family detection in `server/lib/opencode-error-classifiers.ts`, Studio API error mapping in `server/lib/opencode-error-normalization.ts`, and Hono response/unwrap helpers in `server/lib/opencode-errors.ts`
- browser API error parsing must normalize failed responses to `ApiErrorResponse`; do not spread unknown server JSON fields into `StudioApiError`
- browser code that branches on HTTP error status should go through `src/lib/api-errors.ts` helpers instead of casting unknown errors to local `{ status }` shapes
- `src/api-core.ts` owns HTTP transport helpers and request working-directory context only; feature-specific response shaping, such as workspace file-entry normalization, belongs in the matching `src/api-clients/*` module.

## 4. Workspace Identity

- storage: `<workingDir>/.apm-studio/workspace.json`

Rules:

- workspace identity is derived from normalized `workingDir`
- `workspaceId` is the durable restore handle
- saved workspace `workingDir` is the durable workspace path
- startup restore should prefer a matching saved workspace

## 5. Request Working Dir

- code: `server/lib/request-context.ts`, `src/api-core.ts`
- transport: query `workingDir`, header `x-apm-working-dir`

Rules:

- request `workingDir` is the authoritative execution directory for that API call
- workspace-specific provider, model, and tool requests should send the current workspace `workingDir`
- the missing-`workingDir` fallback path is server bootstrap only

## 6. OpenCode Project Config

- storage: `<workingDir>/opencode.json`

Rules:

- this config is specific to that project directory
- provider, model, and tool visibility may differ across directories
- do not confuse this with Studio workspace persistence
- Studio runtime list routes such as models, providers, terminal shells, OpenCode agents, MCP servers, file browser entries, file status, and search results should return named shared response objects at the HTTP boundary rather than bare arrays; browser API clients may unwrap them for local use
- model/provider catalog logic should keep raw `provider.list()` normalization in `server/lib/model-catalog-normalization.ts`, title-model selection policy in `server/lib/model-catalog-title.ts`, and OpenCode lookup/cache/public query orchestration in `server/lib/model-catalog.ts`; downstream services should request current Studio summaries, runtime model entries, or title-model candidates instead of parsing raw provider payloads
- OpenCode adapter services should normalize external agent list, file browser, file status, search, and VCS payloads to the fields declared in `shared/opencode-contracts.ts` instead of passing through unknown extra fields
- OpenCode route-facing exports stay in `server/services/opencode/service.ts`; read-only query normalization lives in `queries.ts` and `query-normalizers.ts`, config reads/writes live in `config.ts`, provider auth lives in `provider-auth.ts`, MCP catalog/auth/connect mutations live in `mcp.ts`, and managed sidecar restart lives in `runtime.ts`
- browser clients should also consume the named shared response bodies for those routes; for example file mention search reads `FindFilesResponse` rather than a bare filename array
- browser UI that needs OpenCode response item types should import them directly from `shared/opencode-contracts.ts`; do not add pass-through aliases in `src/types`
- browser code that handles package/draft primitive references should import `SharedPrimitiveRef` from `shared/chat-contracts.ts`; do not add a local `PrimitiveRef` alias in `src/types`
- browser/editor code that handles persisted Studio Agent runtime model selection should import `WorkspaceModelConfig` from `shared/workspace-contracts.ts`; do not add a local `ModelConfig` alias in `src/types`
- browser code that handles saved workspace documents or summaries should import `SavedWorkspaceSnapshot` and `SavedWorkspaceSummary` from `shared/workspace-contracts.ts`; do not pass them through `src/types`
- browser code that handles persisted workspace node and binding shapes such as agents, Teams, Team participant bindings, markdown editors, and canvas terminals should import `WorkspaceAgentNode`, `WorkspaceTeamSnapshot`, `WorkspaceTeamParticipantBinding`, `WorkspaceMarkdownEditor*`, and `WorkspaceCanvasTerminalNode` from `shared/workspace-contracts.ts`; do not pass them through `src/types`
- browser code that handles Team runtime/editor shapes such as `TeamRelation`, `ParticipantSubscriptions`, `TeamDefinition`, `TeamThread`, and participant statuses should import them directly from `shared/team-types.ts`; do not re-export them through `src/types`
- browser session UI state should import `ChatMessage`, `ChatMessagePart`, and `ChatMessageToolInfo` from `src/store/session/chat-message-types.ts`; do not re-export frontend view-model message types through `src/types`
- browser primitive card and draft view-model types should import `PackageLibraryItem`, `DraftPrimitive`, and `PackageLibraryItemKind` from `src/lib/primitive-types.ts`; do not maintain a generic `src/types` compatibility barrel
- Zustand slice contracts and implementations should live beside their slice domain, for example `src/store/workspace/*`, `src/store/team/*`, `src/store/chat/*`, `src/store/assistant/*`, and `src/store/integration/*`; `src/store/types.ts` should only compose the root `StudioState`, and `src/store/index.ts` should only assemble the domain slices
- independent UI-only Zustand stores should also live in their own domain folder, for example `src/store/settings/*`, instead of using root-level `*Slice.ts` files
- browser-only UI preferences may use localStorage when they do not represent workspace/package content. Last selected top-level mode is stored through `src/store/workspace/workspace-mode-storage.ts` so refresh can return to Import, Inject, or Studio Agent without writing `.apm-studio/workspace.json`.
- workspace slice assembly should keep initial state and factory composition in `src/store/workspace/slice.ts`; shell/UI state actions belong in `shell-actions.ts`; projection dirty bookkeeping belongs in `projection-actions.ts`; storage/context commands belong in `storage-actions.ts`; runtime reload commands belong in `runtime-actions.ts`; Agent canvas-node lifecycle belongs in `agent-node-actions.ts` and is exposed through `agent-actions.ts`; Agent package/config fields belong in `agent-config.ts`
- workspace focus action imports should use the small public barrel in `src/store/workspace/focus-actions.ts`; full-focus Zustand orchestration belongs in `src/store/workspace/focus-mode-actions.ts`; split-view imports should use the `src/store/workspace/split-view-actions.ts` barrel; split-view entry/restoration belongs in `split-view-mode-actions.ts`, pane add/move/remove/replace/activation belongs in `split-view-pane-actions.ts`, and resize/column commands belong in `split-view-resize-actions.ts`; focus viewport measurement and React Flow viewport helpers belong in `src/lib/focus-viewport.ts`; focus target and baseline hidden-state helpers belong in `src/lib/focus-targets.ts`; split-view grid/drop geometry belongs in `src/lib/split-view-geometry.ts`; pure full-focus snapshot, enter/exit, and viewport-sync patch builders belong in `src/store/workspace/focus-mode-state.ts`; split-view pane validation, placement, layout projection, and resize math belong in `src/store/workspace/split-view-layout.ts`
- Agent frame focus/split/manage surface calculation belongs in `src/features/agent/agent-frame-state.ts`; `AgentFrame.tsx` should consume that model and remain the store/query orchestration boundary instead of re-deriving frame modes inline
- Assistant panel UI should keep chat/session wiring in `src/features/assistant/AssistantChat.tsx`; model grouping, status labels, and apply summary text belong in `assistant-chat-model.ts`; panel chrome belongs in `AssistantPanelHeader.tsx`; composer/model picker belongs in `AssistantComposer.tsx`
- Team chat UI should keep Team/session command orchestration in `src/features/team/TeamChatPanel.tsx`; participant execution-state mapping and composer readiness state belong in `team-chat-panel-helpers.ts`; board/thread composition belongs in `TeamChatThreadSurface.tsx`
- workspace draft behavior should keep disk persistence in `src/store/workspace/draft-persistence-actions.ts`, canvas import/materialization in `src/store/workspace/draft-import-actions.ts`, markdown editor opening/spawning in `src/store/workspace/markdown-editor-actions.ts`, debounced draft persistence in `draft-persist-scheduler.ts`, id counters in `id-state.ts`, and slice-facing draft/editor wiring in `draft-editor-actions.ts`; markdown editor frame state math belongs in `src/features/packages/markdown-editor-state.ts` while `MarkdownEditorFrame.tsx` stays the store/API bridge; do not reintroduce a broad root draft action facade
- app-level DnD assembly stays in `src/app-dnd-handlers.tsx`; APM package-to-agent resolution belongs in `src/app-dnd-apm-package.ts`, imported Agent normalization/MCP portability warnings belong in `src/app-dnd-agent-resolver.ts`, markdown editor template drops belong in `src/app-dnd-markdown.ts`, and split-view drop geometry/commands belong in `src/app-dnd-split-view.ts`
- workspace list, close, and delete behavior belongs in `src/store/workspace/workspace-lifecycle-actions.ts`; workspace persistence orchestration belongs in `operations.ts`; save snapshot shaping belongs in `workspace-save-snapshot.ts`; load-time node/session hydration belongs in `workspace-hydration.ts`; focus-mode transient view restoration belongs in `workspace-transient-view.ts`; persisted workspace input aliases belong in `persisted-workspace-types.ts`; runtime reload apply/blocking behavior belongs in `src/store/runtime/reload-actions.ts`
- Team participant binding labels, refs, placeholder agents, and local layout helpers belong in `src/store/team/participant-bindings.ts`; Team/editor/thread selection state transitions belong in `src/store/team/selection-state.ts`; Team primitive import/materialization belongs in `src/store/team/team-import.ts`; Team runtime thread reconciliation, server definition sync, and thread creation/list loading belong in `src/store/team/team-thread-sync.ts`; do not reintroduce a broad Team helper facade
- integration realtime slice assembly stays in `src/store/integration/slice.ts`; pure realtime event parsing and runtime patch derivation belong in `src/store/integration/realtime-event-helpers.ts`, session ownership resolve, buffered event replay, and snapshot sync orchestration belong in `src/store/integration/session-sync-controller.ts`, reconnect-time pending permission/question/status/todo rehydration belongs in `src/store/integration/session-runtime-rehydrator.ts`, authoritative Team thread realtime updates belong in `src/store/integration/team-thread-realtime-actions.ts`, and Agent prompt preview compilation belongs in `src/store/integration/compile-prompt-action.ts`
- Studio-owned provider auth and MCP mutation routes should return `{ ok: true }` success contracts instead of passing through raw OpenCode mutation payloads

## 7. OpenCode Global And Sidecar-Owned Config

- Studio sidecar config: `~/.apm-studio/opencode/...`
- Studio MCP catalog API: `GET /api/mcp/catalog`
- Studio reads and writes global OpenCode config directly in the Studio-owned sidecar config root

Rules:

- Studio uses only the managed OpenCode sidecar
- Studio must not attach to an external OpenCode daemon as an alternate runtime mode
- Studio global config mutations may mutate only Studio-owned config
- API state, runtime reloads, and later process starts must read the same Studio-owned MCP catalog
- assistant global projection belongs only in the Studio-owned sidecar config
- workspace-local `.opencode/...` remains workspace projection storage
- Agent and Team imports should resolve available MCP server names through the Studio MCP catalog API
- registry Agent primitives carry portable MCP requirements such as `mcp_config`; they do not install private/local MCP server definitions, so exact name matches auto-bind only when the Studio MCP catalog already contains that server

## 8. Startup Restore

- inputs: explicit `projectDir`, `lastWorkspaceId`, saved workspaces, startup query params

Rules:

- do not treat the server fallback source dir as an activated workspace
- `projectDir` means an explicitly activated directory only
- if `projectDir` is absent, restore from `lastWorkspaceId` only when that workspace is still visible in the saved workspace list
- startup package query params are one-shot UI hints, not durable config

## 9. Local Port Defaults

- code: `shared/default-ports.ts`

Defaults:

- published CLI app/API: `43100`
- published CLI managed OpenCode sidecar: `43102`
- Vite dev client: `43200`
- dev Studio API: `43201`
- dev managed OpenCode sidecar: `43202`

Rules:

- these are Studio-owned defaults chosen to avoid common local port collisions
- the dev port set must stay separate from the published CLI port set so Studio can be used to work on Studio
- shared port constants must name the runtime mode explicitly, such as `STUDIO_DEV_API_PORT` or `STUDIO_RELEASE_APP_PORT`; do not add mode-ambiguous aliases
- `npm run dev`/`kill-ports` must clean only the dev port set
- when changing them, update shared constants, scripts, and docs together
- CLI flags and env overrides still win
- CLI port validation accepts only integer TCP ports from `1` to `65535`
- the published CLI must reserve the active managed sidecar port, including `OPENCODE_PORT` overrides, when checking or scanning Studio app ports
- server config must use the same strict port validation for `PORT` and `OPENCODE_PORT`

## 10. Dev Versus Production Mode

- code: `server/lib/config.ts`, `server/start.ts`, `server/app.ts`, `cli.ts`

Rules:

- production mode is explicit only: `APM_STUDIO_PRODUCTION=1`
- the published CLI sets production mode, `APM_STUDIO_PROJECT_DIR`, and the resolved app port before importing the server
- APM Studio does not read old product-prefixed environment variables; new configuration must use `APM_STUDIO_*`
- production mode serves the built `client/` bundle from the Hono server and does not apply dev CORS
- dev mode applies local Vite CORS/proxy behavior and does not serve the built client from Hono
- `npm run dev`/`dev:all` must force dev mode, the dev API port, and the dev sidecar port, so inherited production env cannot change the server mode or make readiness checks wait on the wrong port
- `npm run dev:client` is Vite-only and assumes a separate API server
- dev mode uses the repo-local APM Studio contract and registry implementation; there is no sibling registry checkout alias
- production mode must not register any repo-local registry alias or depend on a development workspace name

## Checklist

- is this value a fallback, an activation, a saved workspace id, or a request-scoped `workingDir`
- is it durable state or runtime-only state
- could this make the source tree look like the active workspace again
- could this write Studio-owned OpenCode artifacts into the wrong config scope
