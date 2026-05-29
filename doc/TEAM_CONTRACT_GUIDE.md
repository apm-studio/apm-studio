# APM Studio Team Contract Guide

## Purpose

This guide keeps only the Team rules that matter at change boundaries.

- Team authoring types are owned by `shared/team-types.ts`
- Studio keeps separate workspace and runtime shapes
- runtime thread state is never package source
- do not add alternate Team storage paths
- thread snapshot persistence belongs in `server/services/team-runtime/thread-snapshot-persistence.ts`
- thread runtime state helpers and summary shaping belong in `server/services/team-runtime/thread-runtime-state.ts`
- participant session retirement and participant status mutation helpers belong in `server/services/team-runtime/thread-participant-sessions.ts`
- participant runtime queue/circuit/session-status orchestration belongs in `server/services/team-runtime/team-runtime-participants.ts`

## Source Of Truth

- shared Team types: `shared/team-types.ts`
- Studio workspace: `src/store/*`, workspace snapshots
- Team runtime: `server/services/team-runtime/*`
- Team xstate orchestration: `server/services/team-runtime/team-runtime-actors.ts`

## Four Layers

1. Package/import Team payload
   - used when imported source material contains Team participants and relations
   - validated at the feature boundary before becoming workspace state
2. Studio workspace Team
   - used for canvas and authoring
   - may include `agentRef`, relation `id`, layout, hidden state, and authoring metadata
3. Studio runtime `TeamDefinition`
   - used for thread creation and runtime sync
   - may include participant `description`, safety, and other runtime-only enrichment
4. Team thread runtime state
   - mailbox, shared board, wake conditions, participant sessions and statuses, event log
   - must never be serialized as package source

## Import Payload

These are the important imported Team fields.

```ts
type TeamParticipantSubscriptionsV1 = {
  messagesFrom?: string[]
  messageTags?: string[]
  callboardKeys?: string[]
  eventTypes?: Array<'runtime.idle'>
}

type TeamParticipantV1 = {
  key: string
  agent: string
  subscriptions?: TeamParticipantSubscriptionsV1
}

type TeamRelationV1 = {
  between: [string, string]
  direction: 'both' | 'one-way'
  name: string
  description: string
}

type TeamImportPayload = {
  teamRules?: string[]
  participants: TeamParticipantV1[]
  relations: TeamRelationV1[]
}
```

Key rules:

- use participant `key`, never participant `id`
- `agent` is a source reference that Studio resolves into a workspace participant binding
- `callboardKeys` is the canonical field name
- `eventTypes` currently supports only `runtime.idle`
- participant keys must be unique
- relation endpoints must reference existing participant keys
- if there are multiple participants, there must be at least one relation

## Removed Fields

Do not introduce these into imported Team payloads.

- participant `id`
- participant `activeSkills`
- relation `id`
- relation `permissions`
- relation `maxCalls`
- relation `timeout`
- relation `sessionPolicy`

## Workspace Rules

The workspace Team may be richer than imported package payloads.

- participants may be stored as a record keyed by participant key
- participant bindings may use `agentRef`
- relations may carry editor/runtime `id`
- canvas and authoring metadata may be stored here

Still, these rules hold:

- do not save the workspace shape directly as package source
- normalize through the package/runtime boundary when package materialization support is added

## Runtime Rules

Runtime uses `TeamDefinition`.

- participant `description` is runtime-only enrichment
- linked Agent descriptions may flow into runtime prompt context
- runtime prompt context should stay compact: role, goal, exact collaboration tool contracts, messageable teammates, direct relations, teammate wake hints, and team rules
- relation, rule, subscription, and safety changes apply through runtime sync
- completed or interrupted threads stay historical
- `board.json` is the durable source of truth for board entries
- deleting a Team or thread must delete its runtime participant sessions and session ownership records through the Team runtime service
- Team message-send command safety rules live in `server/services/team-runtime/message-command-rules.ts`; message command execution, mailbox writes, event logging, and wake cascade dispatch live in `server/services/team-runtime/team-runtime-message-commands.ts`
- Team board-write command rules live in `server/services/team-runtime/board-command-rules.ts`; board command execution, board reads, event logging, and wake cascade dispatch live in `server/services/team-runtime/team-runtime-board-commands.ts`
- wake cascade dispatch and `runtime.idle` follow-up policy live in `server/services/team-runtime/wake-cascade-dispatcher.ts`
- `wait_until` trigger target construction lives in `server/services/team-runtime/wake-condition-events.ts`
- `wait_until` condition lifecycle, replacement, immediate triggering, and alarm execution live in `server/services/team-runtime/team-runtime-wake-conditions.ts`; `TeamRuntimeService` should only expose the public API boundary
- Team wake participant queue, circuit, and blocked-retry active state live in `server/services/team-runtime/wake-participant-state.ts`
- Team wake cascade result shape and merge helpers live in `server/services/team-runtime/wake-cascade-result.ts`
- Team wake target prompt/session injection lives in `server/services/team-runtime/wake-target-injection.ts`; `wake-cascade.ts` should stay focused on routing and queue orchestration
- blocked projection wake retry polling lives in `server/services/team-runtime/wake-blocked-retry.ts`
- Team wake participant session creation and ownership resolution live in `server/services/team-runtime/wake-session-resolver.ts`
- Team wake runtime projection and fallback tool-map preparation live in `server/services/team-runtime/wake-runtime-projection.ts`
- Team wake session settlement observation and post-settlement drain/circuit handling live in `server/services/team-runtime/wake-session-settlement.ts`
- Team runtime participant session registration, busy/idle status transitions, queue drain delegation, and auto-wake circuit bridge live in `server/services/team-runtime/team-runtime-participants.ts`
- wake routing predicates live in `server/services/team-runtime/wake-routing-rules.ts`; do not duplicate relation, subscription, or direct-message matching inside callers
- wake recovery target selection lives in `server/services/team-runtime/wake-recovery.ts`
- wake condition timer ownership and alarm calculations live in `server/services/team-runtime/wake-condition-alarms.ts`; the runtime service should only orchestrate scheduling and execution
- shared board size, append, read-limit, and summary rules live in `server/services/team-runtime/board-limits.ts`
- Team participant projection prewarm lives in `server/services/team-runtime/participant-projection-prewarm.ts`; the runtime service should not know projection import details
- loaded participant status reconciliation lives in `server/services/team-runtime/participant-status-reconciliation.ts`; the runtime service should not parse raw OpenCode session status payloads
- loaded thread recovery orchestration lives in `server/services/team-runtime/team-runtime-recovery.ts`; the runtime service should lazy-load persisted threads and delegate recovery of actors, wake alarms, and blocked wake retries
- Team runtime thread creation, rename/list/get/event paging, and runtime definition sync execution live in `server/services/team-runtime/team-runtime-thread-commands.ts`; `TeamRuntimeService` should load threads and delegate public thread commands through this boundary
- `ThreadManager` remains the canonical Team thread persistence facade, while reusable thread runtime creation, active-status checks, summary listing, and delete-session collection live in `server/services/team-runtime/thread-runtime-lifecycle.ts`
- Team/thread runtime deletion orchestration lives in `server/services/team-runtime/team-runtime-deletion.ts`; it owns the order of wake alarm cleanup, persisted thread deletion, actor shutdown, and linked session cleanup
- linked OpenCode session deletion and Team session ownership cleanup live in `server/services/team-runtime/linked-session-cleanup.ts`

Ownership rules:

- OpenCode owns raw session execution state
- Studio runtime owns Team-visible participant state
- xstate actors own thread and participant orchestration state only; they do not replace persisted thread data
- the client should follow server thread snapshots instead of inferring participant state from raw transport events
- client-side Team deletion must use session lifecycle cleanup for local bindings and the Team runtime delete API for persisted runtime cleanup

## Client Surface Boundary

- `src/store/team/slice.ts` owns initial Team state and slice assembly only
- Team store mutations live in named action modules: definition lifecycle in `team-definition-actions.ts`, participant bindings in `team-participant-actions.ts`, editor selection in `team-editor-actions.ts`, relations in `team-relation-actions.ts`, canvas geometry in `team-canvas-actions.ts`, import/authoring metadata in `team-authoring-actions.ts`, and thread commands in `team-thread-actions.ts`
- `src/features/team/TeamChatPanel.tsx` should stay a container that binds Team state, active thread/session state, and command handlers
- Team thread/board surface composition lives in `TeamChatThreadSurface.tsx`
- participant tab rendering and drag ordering live in `TeamParticipantTabs.tsx`
- composer, permission, question, and todo chrome live in `TeamChatComposer.tsx`
- message, empty, and loading renderers live in `TeamChatThreadRenderers.tsx`
- shared-board data fetching/paging lives in `useTeamBoardData.ts`; raw board/activity normalization lives in `team-board-data.ts`; board header/cards/activity rendering lives in `TeamBoardHeader.tsx`, `TeamBoardCards.tsx`, and `TeamBoardActivityList.tsx`; `TeamBoardView.tsx` should stay a composition container
- Team authoring tab composition lives in `TeamMetaView.tsx`; tab chrome, overview/readiness, participants, relations, and rules/safety rendering belong in `TeamMetaTabs.tsx`, `TeamMetaOverviewSection.tsx`, `TeamMetaParticipantsSection.tsx`, `TeamMetaRelationsSection.tsx`, and `TeamMetaRulesSection.tsx`
- pure tab/thread helper logic, participant execution-state mapping, and composer readiness view-model logic live in `team-chat-panel-helpers.ts` and should be covered by helper tests

## Collaboration Tools

Team participants receive only these runtime tools.

- `message_teammate`
- `update_shared_board`
- `list_shared_board`
- `get_shared_board_entry`
- `wait_until`

Key rules:

- tool identity is session-bound; do not pass team or thread ids as tool args
- `message_teammate.recipient` should use a messageable teammate display name from the runtime context
- reuse the same board key for the same workstream
- if the key is unknown, use `list_shared_board` first
- prefer `replace` with a fresh summary over `append`
- shared board entries should be compact Markdown summaries, not full deliverable storage
- after saving `wait_until`, end that turn instead of calling more collaboration tools
- `wait_until.conditionJson` must be JSON using `message_received`, `board_key_exists`, `wake_at`, `all_of`, or `any_of`
- `message_received` uses `{ type, from, tag? }`, `board_key_exists` uses `{ type, key }`, and `wake_at` uses `{ type, at }` with epoch milliseconds
- `wake_at` is the scheduled self-wake condition name
- `runtime.idle` is a system trigger, not a participant-facing coordination signal

## Boundary Flows

Import:

source Team payload -> feature-boundary validation -> workspace Team

Save draft:

workspace Team -> Studio-local draft shape

Package materialization:

workspace Team -> package/runtime boundary normalization -> validate -> emit

Create thread:

workspace Team -> runtime `TeamDefinition` -> `/api/team/:teamId/threads`

Sync runtime definition:

workspace Team -> runtime `TeamDefinition` -> `/api/team/:teamId/runtime-definition`

## Ownership

- APM Studio owns the workspace and runtime schema
- target sync owns target validation
- Studio owns workspace shape and runtime thread state
- safety remains runtime-only unless the canonical contract adopts it

## Checklist

- did you strip `agentRef`, relation `id`, and canvas metadata at package/runtime boundaries
- do parser failures stay real contract failures
- are Team thread names sourced from runtime thread metadata instead of participant session titles
- are subscriptions treated as wake filters instead of relation permissions
- do thread or participant orchestration changes keep `ThreadManager` as the canonical persistence facade
- is runtime persistence still treated as a rewrite boundary
- do Team/thread deletions clean up participant sessions, ownership registry entries, and local chat bindings through the shared lifecycle path
