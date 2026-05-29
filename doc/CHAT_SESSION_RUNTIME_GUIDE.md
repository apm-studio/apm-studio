# Chat Session Runtime Guide

## Purpose

Agent chat, Team participant chat, and APM Assistant chat all use the same session runtime.

- do not reintroduce dual-write behavior
- do not build new logic on old flat chat or session fields
- keep one current snapshot shape instead of versioned branches

## Source Of Truth

- client session runtime: `src/store/session/*`
- xstate orchestration: `src/store/session/session-runtime.ts`, `session-runtime-manager.ts`
- chat key helpers: `shared/chat-targets.ts`
- HTTP request/response contracts: `shared/chat-contracts.ts`
- server ownership wrapper: `server/services/chat/session-ownership-service.ts`
- server chat boundary: `server/services/chat/message-service.ts`, `session-service.ts`, and `event-stream-service.ts`
- `session-service.ts` is only the public session service export boundary; concrete session work lives in `session-queries.ts`, `session-mutations.ts`, `session-interactions.ts`, `session-normalizers.ts`, and `session-directory.ts`

## Canonical State Model

The normalized session slice owns session state.

Primary tables:

- `chatKeyToSession`
- `sessionToChatKey`
- `seEntities`
- `seMessages`
- `seStatuses`
- `sePermissions`
- `seQuestions`
- `seTodos`
- `sessionLoading`
- `sessionReverts`
- `chatDrafts`
- `chatPrefixes`

Key rules:

- chat/session binding is one-to-one
- rebinding must update forward and reverse indexes in the same mutation
- local draft messages live in `chatDrafts`
- system notices and reset prefixes live in `chatPrefixes`
- permission, question, todo, loading, and revert state belong to session state

## Chat Key Rules

- Agent: agent id
- Team participant: `team:{teamId}:thread:{threadId}:participant:{participantKey}`
- assistant: `buildAssistantChatKey(...)`

Important:

- do not duplicate chat key parsing or regex logic in UI or store files
- use only `shared/chat-targets.ts`

## Naming Rules

- standalone Agent session titles keep Studio metadata in the OpenCode title
- sidebar labels are managed as provisional, generated, or manual Studio metadata
- the source of truth for Team thread names is runtime thread metadata
- participant session titles are not the source of truth for Team thread names
- assistant sessions do not take part in automatic thread naming

## Mutation Boundary

Session mutation goes through `src/store/session/session-commands.ts`.

Important commands:

- `registerSessionBinding`
- `bindExistingSession`
- `createFreshSessionBinding`
- `ensureSession`
- `syncSessionSnapshot`
- `detachChatSession`
- `clearChatSessionView`
- `appendLocalMessage`
- `appendSystemNotice`
- `moveDraftMessageToSession`

Deletion lifecycle:

- use `src/store/session/session-lifecycle.ts` when deleting Agents, Teams, or Team threads
- deletion cleanup must first collect affected chat keys, then detach local session state through session commands/runtime release helpers
- remote OpenCode session deletion and local binding removal must not be implemented ad hoc in feature slices
- missing OpenCode sessions are stale bindings; they should detach cleanly instead of surfacing as runtime failures

Key rules:

- binding updates, snapshot reconciliation, and `chatApi.messages` access belong here
- `/api/chat/sessions/:id/messages` returns the shared `ChatSessionMessagesResponse` body shape from `shared/chat-contracts.ts`; do not reintroduce cursor headers or browser-local response types
- session messages returned by Studio are normalized to `ChatSessionMessage` / `ChatSessionMessagePart`; browser mapping from that shared shape to UI `ChatMessage` lives in `src/lib/chat-message-normalization.ts`, and raw OpenCode-only message or part fields should be dropped before browser state sees them
- session snapshot merging belongs in `src/lib/chat-message-snapshot-merge.ts`; streaming upsert helpers belong in `src/lib/chat-message-streaming.ts`; `src/lib/chat-messages.ts` should remain the public barrel for existing imports
- OpenCode session status maps are normalized to `ChatSessionStatus` before runtime reload, Team recovery, or browser-facing status logic uses them
- chat route list/status/todo/permission/question/summarize/diff/revert responses should use named shared response contracts from `shared/chat-contracts.ts`; avoid returning bare arrays, booleans, or raw OpenCode mutation payloads from Studio-owned HTTP routes
- Studio-owned HTTP contracts use camelCase field names such as `providerId`, `modelId`, `messageId`, `partId`, `callId`, and `createdAt`; OpenCode raw keys should be translated before data leaves server/shared normalization boundaries
- permission, question, and todo data should use Studio-owned `ChatPermissionRequest`, `ChatQuestionRequest`, `ChatQuestionAnswer`, and `ChatTodo` contracts in shared/client/session state; OpenCode SDK interaction types belong only at OpenCode-facing service boundaries
- `/api/chat/sessions/:id/diff` normalizes OpenCode session diff payloads to `ChatSessionDiffEntry` before returning them; browser review UI should not parse raw `pre_name`, `post_name`, `patch`, or other provider-specific diff aliases
- the session runtime actor may project loading and mutation state, but it must not bypass session commands for canonical data changes
- explicit new-session UX must create a new backend session
- do not fake a new thread by clearing local messages while keeping the old session bound

## Query Boundary

Read through:

- `src/store/session/session-selectors.ts`
- `src/store/session/use-chat-session.ts`

UI should not:

- call `chatApi.messages(...)` directly
- mutate raw session maps with `setState`
- keep parallel permission, question, or todo state

## Rendering Boundary

- chat message grouping lives in `src/features/chat/ChatMessageContent.tsx`
- tool row orchestration and context batching live in `src/features/chat/ToolGroup.tsx`
- tool renderer dispatch exports live in `src/features/chat/ToolSpecificRows.tsx`
- focused tool renderer implementations live in `src/features/chat/ToolShellRow.tsx`, `ToolFileRows.tsx`, `ToolTodoRow.tsx`, `ToolContextRows.tsx`, and `ToolSimpleRows.tsx`
- reusable tool row chrome lives in `src/features/chat/ToolGroupPrimitives.tsx`
- tool payload extraction, duration formatting, diff parsing, and tool-name classification live in `src/features/chat/tool-group-utils.ts`
- syntax/diff display exports stay in `src/components/chat/SyntaxBlock.tsx`; highlight registration lives in `syntax-highlight.ts`, code block rendering in `SyntaxCodeBlock.tsx`, and diff row parsing/rendering in `diff-block-rows.ts` plus `DiffBlock.tsx`

Key rules:

- UI renderers should consume normalized `ChatMessageToolInfo`; OpenCode raw payload aliases belong in small extraction helpers, not spread through JSX branches
- shared row chrome should stay in `ToolGroupPrimitives.tsx` so shell, edit, patch, search, task, and skill renderers keep the same interaction language
- new tool renderers should add classification to `tool-group-utils.ts`, dispatch through `ToolGroup.tsx`, and keep per-tool display logic in the focused `Tool*Row.tsx` module for that tool family

## Realtime Boundary

- transport lifecycle: `src/store/integration/slice.ts`
- event ingest and reduce: `src/store/session/event-ingest.ts`, `event-reducer.ts`
- `event-ingest.ts` owns buffering, frame budgeting, and heartbeat timers; `event-coalescing.ts` owns status/delta coalescing; `event-dispatch.ts` owns normalized event payload dispatch into reducers; `event-ingest-types.ts` owns the shared ingest shell contracts
- pure message-state transforms for reducer use live in `src/store/session/event-message-state.ts`; `event-reducer.ts` should stay focused on session existence checks and Zustand state patches
- session supervision actor: `src/store/chat/session-recovery.ts`

Key rules:

- integration manages connection lifecycle and transport intake only
- per-session xstate actors own optimistic, syncing, mutation, and supervision orchestration
- session event files own session event payload normalization and state reduction
- Studio should consume OpenCode's global event stream and filter by working directory; do not rely on per-directory `/event` streams for permission/question delivery
- the server chat event stream owns OpenCode SSE subscription cancellation; do not pass the request `AbortSignal` directly into SDK event subscriptions
- OpenCode event reconnect cadence should remain bounded by Studio's refresh loop so failed SSE streams cannot recursively accumulate abort listeners
- client reconnect should rehydrate pending permissions, questions, status, and todos from OpenCode so missed interactive or status events cannot leave Studio stuck
- permission responses must use `permission.reply`; session-scoped `permission.respond` is not part of the supported Studio protocol
- optimistic mirrors and stream reconciliation belong in the session layer, not ad hoc UI patches
- owner-derived realtime binding must not steal a chat key that the user already rebound to a different session
- unknown session ownership resolution is a quiet realtime miss and should return `{ found: false }` without an HTTP error status
- coalesced streaming must not drop `message.part.delta` content
- realtime SSE payload reads should stay inside `event-payloads.ts`; `event-ingest.ts` should dispatch normalized payloads instead of casting raw event properties
- raw OpenCode event keys are the supported boundary shape (`sessionID`, `messageID`, `partID`, `callID`); transport ownership resolution and payload normalizers should not add camelCase alias loaders for removed or hypothetical event shapes
- realtime `message.part.updated` payloads should be normalized through the session event part boundary before they enter the Studio chat message store; malformed `input`, `metadata`, `tokens`, or `time` fields should be dropped instead of cast through
- tool parts require a real `callID`/`callId`; do not fall back to part ids for tool-call identity because tool status events reconcile by call id
- raw OpenCode message `info.*` is promoted only by `shared/chat-session-message.ts`: `id`, `role`, `time.created`, `time.completed`, `error`, `agent`, and `variant` become top-level Studio fields (`id`, `role`, `createdAt`, `completedAt`, `error`, `agent`, `model.variant`)
- browser/server Studio logic should never read `message.info.*`; after normalization, only the top-level `ChatSessionMessage` contract exists
- if OpenCode stops reporting a status but the assistant snapshot is settled, Studio should treat the session as settled
- a direct OpenCode `busy` or `retry` status remains authoritative and abortable even if the latest assistant step has a `step-finish`; intermediate step finishes must not flicker the composer back to send mode
- a parked `wait_until` turn should return to live-running when a later event arrives
- OpenCode `session.next.*`, `session.error`, and `message.part.updated` events should feed the same normalized session status and tool state tables

## Runtime Guards

Before execution:

- projection blocking applies only when projection refresh or dispose is actually needed
- when dispose is needed, check all busy sessions in the same working directory
- do not scope dispose safety to only one Agent or one participant
- if recovery from `Agent not found` would require dispose, do not force it while the working directory is busy
- Team collaboration context is turn-scoped system prompt context
- Agent variant ownership belongs to projection and runtime config
- prompt execution validates known provider/auth-incompatible model selections before calling OpenCode; Team auto-wakes should surface a model-selection error and open the participant circuit instead of streaming a doomed run
- synced message metadata is display-only and must not become the execution source of truth

## Review And Wake Rules

- prefer `/api/chat/sessions/:id/diff` for review UI
- unified-diff-only OpenCode payloads are normalized server-side and must still render as `rawDiff`
- browser review UI consumes only `ChatSessionDiffEntry`; raw OpenCode diff aliases and tool-payload inference stay out of the client boundary
- Team wake queues are participant-scoped, not thread-scoped
- a wake blocked by projection adoption should defer and retry, not disappear
- a `wait_until` resume instruction takes priority over ordinary subscription wakes
- stale `busy` or `retry` should be corrected to idle when the latest turn is settled or parked on `wait_until`

## Server Boundary

Access session ownership metadata through `server/services/chat/session-ownership-service.ts`.

Do not spread file access logic across routes and services.

Route handlers and browser API clients should import current chat and compile HTTP shapes from `shared/chat-contracts.ts` rather than redefining local `{ ok }`, session status, title update, permission reply, prompt preview, diff, revert, or ownership-resolution objects.

`server/services/chat/message-service.ts` should stay the public create/send orchestration boundary. Team collaboration projection belongs in `team-turn-projection.ts`, prompt runtime preparation belongs in `chat-prompt-runtime.ts`, prompt part assembly and attachment checks belong in `chat-prompt-parts.ts`, initial and generated thread naming belongs in `thread-title-execution.ts`, and Team participant busy/settlement/circuit handling belongs in `team-turn-lifecycle.ts`.

Prompt runtime preparation owns model promptability validation, APM Assistant request preparation, Agent projection execution planning, projection adoption, prompt tool maps, and selected MCP availability checks. Message send orchestration should consume the prepared runtime result instead of importing projection, assistant, model catalog, or MCP resolution services directly.

## External Clients

Discord is an external chat client over the same session runtime.

- standalone Agent Discord messages must create or reuse normal Agent-owned sessions
- Team Discord messages must use `buildTeamParticipantChatKey(...)` and team-owned session ownership
- Discord must call `createStudioChatSession` and `sendStudioChatMessage` instead of invoking OpenCode directly
- Discord channel/session mappings are adapter metadata, not canonical session state
- Discord-originated sends must be authorized before they reach the session runtime
- Discord permission and question prompts must reuse the same `respondSessionPermission`, `respondQuestion`, and `rejectQuestion` services as Studio web
- Discord history backfill is a bounded text-only projection of existing session messages, not canonical session history

## Logging Defaults

- successful fast requests should stay quiet
- `4xx`, `5xx`, and slow requests should still log
- Team runtime success-path diagnostics should stay behind `APM_STUDIO_VERBOSE_SERVER_LOGS=1`
- degraded runtime warnings and errors should still print by default

## Dead Fields

Treat new logic depending on these as a regression.

- `sessionMap`
- `chats`
- `loadingAgentId`
- `pendingPermissions`
- `pendingQuestions`
- `todos`
- `historyCursors`
- `message.info`

## Checklist

- does the change use canonical `chatKey` identity
- does any new orchestration flow go through the session runtime actor instead of ad hoc loading or mutation flags
- does mutation go through session commands
- is UI reading only from selectors or `useChatSession`
- did any removed field dependency sneak back in
- does server ownership access still go through `server/services/chat/session-ownership-service.ts`
