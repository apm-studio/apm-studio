---
name: studio-assistant-action-surface-guide
description: "Lists the exact APM Assistant apply_studio_actions mutation surface, field rules, ref ordering, and payload self-checks. Use before emitting or validating any APM Studio mutation tool call."
compatibility: Designed for the APM Studio built-in assistant projection.
---

# APM Studio Assistant Action Surface

Use this skill when you need to produce, inspect, or verify an `apply_studio_actions` payload.

## Output Shape
- Mutations must go through `apply_studio_actions`.
- Tool arguments must be `{ "version": 1, "actions": [...] }`.
- Do not paste raw JSON or fenced JSON into the assistant reply text.
- Omit unspecified optional fields. Do not send empty strings, null placeholders, or empty draft objects.
- Validate the whole payload before calling the tool; one invalid action can cause the call to fail.

## Ordering And Refs
- Actions are applied sequentially.
- Use snapshot ids for existing objects.
- Use `ref` only for objects created earlier in the same tool call.
- Keep dependent actions in order: create dependencies first, then attach/update/use them.
- Never invent ids such as `agent-1`, `team-1`, `relation-1`, or `draft-1`.

## Action Families
- Instruction draft CRUD: `createInstructionDraft`, `updateInstructionDraft`, `deleteInstructionDraft`
- Skill draft CRUD: `createSkillDraft`, `updateSkillDraft`, `deleteSkillDraft`
- Skill files: `upsertSkillBundleFile`, `deleteSkillBundleEntry`
- Agent CRUD: `createAgent`, `updateAgent`, `deleteAgent`
- Team CRUD: `createTeam`, `updateTeam`, `deleteTeam`
- Participants: `attachAgentToTeam`, `detachParticipantFromTeam`, `updateParticipantSubscriptions`
- Relations: `connectAgents`, `updateRelation`, `removeRelation`
- Studio UI: `showAgent`, `showTeam`, `showDraft`, `setStudioPanel`, `setStudioNodeVisibility`, `setStudioNodeFrame`

## Agent Fields
`createAgent` and `updateAgent` support:
- `description`
- `model`
- `modelVariant`
- one Instruction source: `instructionUrn`, `instructionDraftId`, `instructionDraftRef`, or inline `instructionDraft`
- Skill additions: `addSkillUrns`, `addSkillDraftIds`, `addSkillDraftRefs`, inline `addSkillDrafts`
- Skill removals: `removeSkillUrns`, `removeSkillDraftIds`
- MCP changes: `addMcpServerNames`, `removeMcpServerNames`

Rules:
- Choose at most one Instruction source.
- Use inline `instructionDraft` or `addSkillDrafts` when the dependency is new and known.
- Use only available model and variant ids from the snapshot.
- MCP names must already exist in Studio MCP library context; do not invent them.

## Team And Relation Fields
`createTeam` supports:
- `name`, `description`, `teamRules`, `safety`
- `participantAgentIds`, `participantAgentRefs`, `participantAgentNames`
- inline `relations`

`updateTeam` supports:
- `name`, `description`, `teamRules`, `safety`

Relation payloads use:
- source locators: `sourceParticipantKey`, `sourceAgentId`, `sourceAgentRef`, `sourceAgentName`
- target locators: `targetParticipantKey`, `targetAgentId`, `targetAgentRef`, `targetAgentName`
- `direction`, `name`, `description`

Rules:
- `teamRules` must be an array of strings.
- Every new relation needs non-empty `name` and `description`.
- Use `source...` and `target...` fields for relation endpoints.
- For brand-new Teams with known participants, prefer participants and relations directly on `createTeam`.

## Draft And Bundle Fields
- Instruction/Skill CRUD teams on local drafts only.
- Skill file actions target saved Skill drafts only.
- Bundle paths are relative to the Skill root.
- Bundle paths must not target `SKILL.md` or `draft.json`.
- Use bundle files for `references/*`, `scripts/*`, `assets/*`, and `agents/openai.yaml`.

## Participant Subscriptions
`updateParticipantSubscriptions` targets a participant by:
- `participantKey`
- attached `agentId`
- same-call `agentRef`
- exact `agentName`

`subscriptions` supports:
- `messagesFromParticipantKeys`
- `messagesFromAgentIds`
- `messagesFromAgentRefs`
- `messagesFromAgentNames`
- `messageTags`
- `callboardKeys`
- `eventTypes`

Rules:
- Use `null` to clear subscriptions.
- `eventTypes` currently supports only `runtime.idle`.
- `callboardKeys` is canonical.

## UI Operations
- `showAgent`: select/reveal an Agent, or open its editor with `surface: "editor"`.
- `showTeam`: select/reveal a Team, or open its editor with `surface: "editor"` and optional `editorMode`.
- `showDraft`: open a saved or same-call Instruction/Skill draft editor.
- `setStudioPanel`: open or close `packages`, `workspaceTracking`, or `terminal`.
- `setStudioNodeVisibility`: hide or show an existing Agent or Team.
- `setStudioNodeFrame`: set absolute canvas `position` and/or `size` for an Agent or Team.

UI-only operations are hot Studio state changes. Do not describe them as packaged, saved, installed, or runtime-affecting.

## Examples
Read `references/payload-examples.md` only when you need concrete payload examples.
