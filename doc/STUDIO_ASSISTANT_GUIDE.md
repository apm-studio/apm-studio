# APM Assistant Guide

## Purpose

APM Assistant is a runtime-only chat target that mutates the APM Studio canvas.

- it is not a persisted Agent package
- it is not package-backed APM Studio content
- it does not reuse Agent projection
- mutations happen only through an assistant-only tool

## Scope

The assistant action surface covers:

- Instruction draft CRUD
- Skill draft CRUD
- Skill sibling file management
- Agent canvas CRUD
- Team canvas CRUD
- Studio UI and canvas operations

It does not cover:

- package import or target sync lifecycle work
- direct registry install flows

## Identity And State

- assistant runtime id: `studio-assistant`
- UI entry: toolbar assistant toggle
- state owner: `src/store/assistant/slice.ts`

Assistant local state:

- open or closed state
- selected model
- applied message dedupe
- action apply summaries

## File Map

- projection: `server/services/studio-assistant/assistant-service.ts`
- action prompt assembly: `server/services/studio-assistant/assistant-context-prompt.ts`
- action prompt context optimizer: `server/services/studio-assistant/assistant-context-optimizer.ts`
- action prompt intent inference: `server/services/studio-assistant/assistant-context-intent.ts`
- action prompt row selection: `server/services/studio-assistant/assistant-context-selection.ts`
- action prompt snapshot summaries: `server/services/studio-assistant/assistant-context-summaries.ts`
- package discovery prompt hints: `server/services/studio-assistant/assistant-discovery-prompt.ts`
- Assistant agent prompt: `server/services/studio-assistant/agent/studio-assistant.md`
- Action surface guide: `server/services/studio-assistant/skills/studio-assistant-action-surface-guide/SKILL.md`
- Instruction design guide: `server/services/studio-assistant/skills/studio-assistant-instruction-design-guide/SKILL.md`
- UI operation guide: `server/services/studio-assistant/skills/studio-assistant-ui-operations-guide/SKILL.md`
- builtin skills: `server/services/studio-assistant/skills/*/SKILL.md`
- UI shell/session bridge: `src/features/assistant/AssistantChat.tsx`
- UI header: `src/features/assistant/AssistantPanelHeader.tsx`
- UI composer/model picker: `src/features/assistant/AssistantComposer.tsx`
- UI empty/setup states: `src/features/assistant/AssistantEmptyStates.tsx`
- UI view-model helpers: `src/features/assistant/assistant-chat-model.ts`
- client protocol adapter: `src/features/assistant/assistant-protocol.ts`
- shared action parser: `shared/assistant-action-protocol.ts`
- shared action normalizer: `shared/assistant-action-normalizers.ts`
- shared action validator: `shared/assistant-action-validators.ts`
- shared action shape helpers: `shared/assistant-action-record.ts`
- shared cross-action linter: `shared/assistant-action-lint.ts`
- apply dispatcher: `src/features/assistant/assistant-actions.ts`
- apply state/ref context: `src/features/assistant/assistant-action-state.ts`
- apply entity resolvers: `src/features/assistant/assistant-action-resolvers.ts`
- apply draft helpers: `src/features/assistant/assistant-action-draft-context.ts`
- apply Agent field helpers: `src/features/assistant/assistant-action-agent-fields.ts`
- apply Team relation helpers: `src/features/assistant/assistant-action-team-context.ts`
- apply canvas/view helpers: `src/features/assistant/assistant-action-canvas.ts`
- Agent apply handler: `src/features/assistant/assistant-agent-actions.ts`
- Team apply handler: `src/features/assistant/assistant-team-actions.ts`
- Studio view apply handler: `src/features/assistant/assistant-view-actions.ts`
- draft and skill bundle apply handler: `src/features/assistant/assistant-draft-actions.ts`
- shared action contract: `shared/assistant-actions.ts`
- send-time chat assembly: `server/services/studio-assistant/assistant-chat-service.ts`

## Runtime Flow

1. Open panel
   - open from the toolbar
   - restore any existing assistant session binding through the shared session runtime
2. Resolve runtime target
   - `chat-runtime-target.ts` builds the assistant model and compact workspace snapshot
   - refresh `/api/models` when the cached assistant model is empty or stale
3. Build server prompt
   - ensure assistant agent and builtin skills are projected
   - build system prompt from an intent-optimized workspace snapshot, compact action rules, and optional discovery hints
   - send only the user message as chat input
4. Execute in OpenCode
   - run projected agent `apm-studio/studio-assistant`
5. Tool call
   - mutate only through `apply_studio_actions`
6. Parse client-side
   - require `{ version: 1, actions: [...] }`
   - normalize tool payloads before validation
   - reject semantically invalid envelopes
   - normalize accepted actions to the current `shared/assistant-actions.ts` fields only; unknown top-level or nested payload fields are dropped at this boundary
7. Apply client-side
   - apply completed tool calls in order
   - surface partial failures through inline apply summaries

## Supported Actions

Draft CRUD:

- `createInstructionDraft`
- `updateInstructionDraft`
- `deleteInstructionDraft`
- `createSkillDraft`
- `updateSkillDraft`
- `deleteSkillDraft`
- `upsertSkillBundleFile`
- `deleteSkillBundleEntry`

Workspace CRUD and wiring:

- `createAgent`
- `updateAgent`
- `deleteAgent`
- `createTeam`
- `updateTeam`
- `deleteTeam`
- `attachAgentToTeam`
- `detachParticipantFromTeam`
- `updateParticipantSubscriptions`
- `connectAgents`
- `updateRelation`
- `removeRelation`

Studio UI and canvas operations:

- `showAgent`
- `showTeam`
- `showDraft`
- `setStudioPanel`
- `setStudioNodeVisibility`
- `setStudioNodeFrame`

Key rules:

- load `studio-assistant-action-surface-guide` before producing non-trivial mutation payloads
- Instruction and Skill actions are draft-only
- Agent and Team actions are current-workspace-only
- same-call refs are the main dependency mechanism
- prefer exact ids; use name matching only as fallback
- if Instruction is missing on a clear create request, the assistant should not block the workflow only because Instruction was not named; it should use a role-appropriate inline Instruction draft when intent is clear and ask only when Instruction scope, tone, or policy choices are important and unclear
- this applies both to standalone Agent creation and to Agents created as part of a Team/workflow request
- for Instruction authoring, Instruction design, or missing-Instruction proposal turns, the assistant should load `studio-assistant-instruction-design-guide`
- `createSkillDraft` and `updateSkillDraft` touch `SKILL.md` only
- bundle file actions target saved Skill drafts and relative bundle paths only
- bundle file actions must not target `SKILL.md` or `draft.json`

## Workspace Context

The assistant sees a compact workspace snapshot optimized for the current user turn.

- working directory
- agents: id, name, description, model, current modelVariant, MCP, Instruction and Skill refs
- teams: id, name, description, rules, safety, participant summaries, relation summaries
- drafts: id, kind, name, description, tags, save state
- available models, including model-specific variant ids when present
- current view state, open panels, selected ids, node positions, sizes, and visibility flags

Rules:

- send-time prompt assembly prunes and expands fields by user intent, current selection, and matching names
- geometry fields are expanded for UI/canvas operations such as open, show, hide, move, resize, arrange, and panel changes
- model variants are expanded only when model/variant choice is relevant
- omitted counts in the snapshot mean the assistant should rely on exact user-provided names only when unambiguous; otherwise it should ask one short clarifying question
- this context is for planning mutations, not for runtime execution authority
- unsaved markdown drafts should not become server-backed mutation targets
- UI-only actions are hot Studio state changes and must not be described as package, install, save, or runtime projection changes
- canvas frame actions should use snapshot geometry and should ask first when the requested layout is subjective and geometry is unavailable

## Projection Rules

Projection roots:

- sidecar global projection: `~/.apm-studio/opencode/...`

Rules:

- builtin assistant skills are authored from `server/services/studio-assistant/skills/*/SKILL.md`
- sibling files may also be projected
- assistant-only tool projection is wired by `server/services/studio-assistant/assistant-tools.ts`; generated `apply_studio_actions` source is assembled from `assistant-mutation-tool-content.ts` and the `assistant-mutation-tool-source-*` chunks for normalization, lint, schema, and execute behavior
- Studio keeps assistant projection in Studio-owned sidecar global config
- `apply_studio_actions` must remain assistant-only
- the assistant agent denies wildcard tool permission and re-allows only `apply_studio_actions` plus explicitly allowed builtin skills
- normal Agent projection should deny assistant-only tool names
- projection refresh should prune stale assistant artifacts
- if assistant projection changes, dispose the OpenCode instance for that execution directory

## Alignment Rules

Skill organization:

- builtin assistant skills should stay short and trigger-focused
- exact payload fields live in `studio-assistant-action-surface-guide`
- Agent design, Team contract, workflow topology, Studio navigation, and UI operations are separate skills
- long examples or UI label references should move into `references/*` files and be read only when needed
- avoid duplicating the full mutation protocol in every skill; route to the action-surface guide instead

Team alignment:

- the assistant may see Agent and participant descriptions, `teamRules`, `subscriptions`, `safety`, and current MCP names
- Team construction should infer concrete participant roles, deliverables, handoffs, review/approval loops, and relation direction from the user's intent
- relation names should describe the artifact or coordination moment being passed, not generic graph labels
- Agent descriptions should carry participant runtime focus; `teamRules` should carry durable whole-team behavior
- participant subscriptions should be added only for intentional wake behavior and should align `messageTags` or `callboardKeys` with concrete handoffs
- the canonical subscription field name remains `callboardKeys`
- `subscriptions.eventTypes` currently supports only `runtime.idle`
- `safety.threadTimeoutMs` is a runtime limit, not a `wait_until` wake

Skill alignment:

- sibling file actions may target `references/*`, `scripts/*`, `assets/*`, and `agents/openai.yaml`
- keep `SKILL.md` short and trigger-focused
- move long examples and schemas into `references/*`
- avoid clutter files such as `README.md` or `CHANGELOG.md` unless the user explicitly asks
- external skill recommendations should include a short security warning

## Failure Modes

- partial apply: early actions may succeed while later ones fail
- ambiguous reference: if create, import, and attach are all plausible, ask first
- unknown identifier: do not invent model ids, MCP names, package ids, or URNs when workspace data already exists
- over-eager mutation: do not silently choose one path when multiple valid paths exist

## Constraints

- the assistant is not an APM Studio package
- it does not use a special file-editing mutation API
- mutation goes only through `apply_studio_actions`
- search hints are prompt hints, not direct tool results
- there is no server-side transaction or replay layer

## Checklist

- was the new action added to `shared/assistant-actions.ts` first
- were prompt guidance, shared parsing, shared linting, and apply logic updated together
- does assistant behavior still match current store APIs
- did the assistant stay inside its runtime-only boundary
