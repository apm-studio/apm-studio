# Chat Session Runtime Guide

## Purpose

Performer chat, Act participant chat, and Studio Assistant chat all use the same session runtime.

- do not reintroduce legacy dual-write behavior
- do not build new logic on old flat chat or session fields
- keep one current snapshot shape instead of versioned branches

## Source Of Truth

- client session runtime: `src/store/session/*`
- xstate orchestration: `src/store/session/session-runtime.ts`, `session-runtime-manager.ts`
- chat key helpers: `shared/chat-targets.ts`
- server ownership wrapper: `server/services/session-ownership-service.ts`

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

- performer: performer id
- Act participant: `act:{actId}:thread:{threadId}:participant:{participantKey}`
- assistant: `buildAssistantChatKey(...)`

Important:

- do not duplicate chat key parsing or regex logic in UI or store files
- use only `shared/chat-targets.ts`

## Naming Rules

- standalone performer session titles keep Studio metadata in the OpenCode title
- sidebar labels are managed as provisional, generated, or manual Studio metadata
- the source of truth for Act thread names is runtime thread metadata
- participant session titles are not the source of truth for Act thread names
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

- use `src/store/session/session-lifecycle.ts` when deleting performers, Acts, or Act threads
- deletion cleanup must first collect affected chat keys, then detach local session state through session commands/runtime release helpers
- remote OpenCode session deletion and local binding removal must not be implemented ad hoc in feature slices
- missing OpenCode sessions are stale bindings; they should detach cleanly instead of surfacing as runtime failures

Key rules:

- binding updates, snapshot reconciliation, and `api.chat.messages` access belong here
- the session runtime actor may project loading and mutation state, but it must not bypass session commands for canonical data changes
- explicit new-session UX must create a new backend session
- do not fake a new thread by clearing local messages while keeping the old session bound

## Query Boundary

Read through:

- `src/store/session/session-selectors.ts`
- `src/store/session/use-chat-session.ts`

UI should not:

- call `api.chat.messages(...)` directly
- mutate raw session maps with `setState`
- keep parallel permission, question, or todo state

## Realtime Boundary

- transport lifecycle: `src/store/integrationSlice.ts`
- event ingest and reduce: `src/store/session/event-ingest.ts`, `event-reducer.ts`
- session supervision actor: `src/store/chat/session-recovery.ts`

Key rules:

- integration manages connection lifecycle and transport intake only
- per-session xstate actors own optimistic, syncing, mutation, and supervision orchestration
- session event files own session state reduction
- Studio should consume OpenCode's global event stream and filter by working directory; do not rely on per-directory `/event` streams for permission/question delivery
- the server chat event stream owns OpenCode SSE subscription cancellation; do not pass the request `AbortSignal` directly into SDK event subscriptions
- OpenCode event reconnect cadence should remain bounded by Studio's refresh loop so failed SSE streams cannot recursively accumulate abort listeners
- client reconnect should rehydrate pending permissions, questions, status, and todos from OpenCode so missed interactive or status events cannot leave Studio stuck
- permission responses must use `permission.reply`; do not add new calls to the deprecated session-scoped `permission.respond`
- optimistic mirrors and stream reconciliation belong in the session layer, not ad hoc UI patches
- owner-derived realtime binding must not steal a chat key that the user already rebound to a different session
- unknown session ownership resolution is a quiet realtime miss and should return `{ found: false }` without an HTTP error status
- coalesced streaming must not drop `message.part.delta` content
- if OpenCode stops reporting a status but the assistant snapshot is settled, Studio should treat the session as settled
- a direct OpenCode `busy` or `retry` status remains authoritative and abortable even if the latest assistant step has a `step-finish`; intermediate step finishes must not flicker the composer back to send mode
- a parked `wait_until` turn should return to live-running when a later event arrives
- OpenCode `session.next.*` failure and retry events should feed the same normalized session status and tool state tables as legacy `session.error` and `message.part.updated`

## Runtime Guards

Before execution:

- projection blocking applies only when projection refresh or dispose is actually needed
- when dispose is needed, check all busy sessions in the same working directory
- do not scope dispose safety to only one performer or one participant
- if recovery from `Agent not found` would require dispose, do not force it while the working directory is busy
- Act collaboration context is turn-scoped system prompt context
- performer variant ownership belongs to projection and runtime config
- prompt execution validates known provider/auth-incompatible model selections before calling OpenCode; Act auto-wakes should surface a model-selection error and open the participant circuit instead of streaming a doomed run
- synced message metadata is display-only and must not become the execution source of truth

## Review And Wake Rules

- prefer `/api/chat/sessions/:id/diff` for review UI
- unified-diff-only payloads must still render
- Act wake queues are participant-scoped, not thread-scoped
- a wake blocked by projection adoption should defer and retry, not disappear
- a `wait_until` resume instruction takes priority over ordinary subscription wakes
- stale `busy` or `retry` should be corrected to idle when the latest turn is settled or parked on `wait_until`

## Server Boundary

Access session ownership metadata through `session-ownership-service.ts`.

Do not spread file access logic across routes and services.

## External Clients

Discord is an external chat client over the same session runtime.

- standalone performer Discord messages must create or reuse normal performer-owned sessions
- Act Discord messages must use `buildActParticipantChatKey(...)` and act-owned session ownership
- Discord must call `createStudioChatSession` and `sendStudioChatMessage` instead of invoking OpenCode directly
- Discord channel/session mappings are adapter metadata, not canonical session state
- Discord-originated sends must be authorized before they reach the session runtime
- Discord permission and question prompts must reuse the same `respondSessionPermission`, `respondQuestion`, and `rejectQuestion` services as Studio web
- Discord history backfill is a bounded text-only projection of existing session messages, not canonical session history

## Logging Defaults

- successful fast requests should stay quiet
- `4xx`, `5xx`, and slow requests should still log
- Act runtime success-path diagnostics should stay behind `STUDIO_VERBOSE_SERVER_LOGS=1`
- degraded runtime warnings and errors should still print by default

## Dead Fields

Treat new logic depending on these as a regression.

- `sessionMap`
- `chats`
- `loadingPerformerId`
- `pendingPermissions`
- `pendingQuestions`
- `todos`
- `historyCursors`

## Checklist

- does the change use canonical `chatKey` identity
- does any new orchestration flow go through the session runtime actor instead of ad hoc loading or mutation flags
- does mutation go through session commands
- is UI reading only from selectors or `useChatSession`
- did any legacy field dependency sneak back in
- does server ownership access still go through `session-ownership-service.ts`
