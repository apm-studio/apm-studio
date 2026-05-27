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
- Never invent ids such as `performer-1`, `act-1`, `relation-1`, or `draft-1`.

## Action Families
- Install/import: `installRegistryAsset`, `addDanceFromGitHub`, `importInstalledPerformer`, `importInstalledAct`
- Instruction draft CRUD: `createTalDraft`, `updateTalDraft`, `deleteTalDraft`
- Skill draft CRUD: `createDanceDraft`, `updateDanceDraft`, `deleteDanceDraft`
- Skill files: `upsertDanceBundleFile`, `deleteDanceBundleEntry`
- Agent CRUD: `createPerformer`, `updatePerformer`, `deletePerformer`
- Team CRUD: `createAct`, `updateAct`, `deleteAct`
- Participants: `attachPerformerToAct`, `detachParticipantFromAct`, `updateParticipantSubscriptions`
- Relations: `connectPerformers`, `updateRelation`, `removeRelation`
- Studio UI: `showPerformer`, `showAct`, `showDraft`, `setStudioPanel`, `setStudioNodeVisibility`, `setStudioNodeFrame`

## Agent Fields
`createPerformer` and `updatePerformer` support:
- `description`
- `model`
- `modelVariant`
- one Instruction source: `talUrn`, `talDraftId`, `talDraftRef`, or inline `talDraft`
- Skill additions: `addDanceUrns`, `addDanceDraftIds`, `addDanceDraftRefs`, inline `addDanceDrafts`
- Skill removals: `removeDanceUrns`, `removeDanceDraftIds`
- MCP changes: `addMcpServerNames`, `removeMcpServerNames`

Rules:
- Choose at most one Instruction source.
- Use inline `talDraft` or `addDanceDrafts` when the dependency is new and known.
- Use only available model and variant ids from the snapshot.
- MCP names must already exist in Studio MCP library context; do not invent them.

## Team And Relation Fields
`createAct` supports:
- `name`, `description`, `actRules`, `safety`
- `participantPerformerIds`, `participantPerformerRefs`, `participantPerformerNames`
- inline `relations`

`updateAct` supports:
- `name`, `description`, `actRules`, `safety`

Relation payloads use:
- source locators: `sourceParticipantKey`, `sourcePerformerId`, `sourcePerformerRef`, `sourcePerformerName`
- target locators: `targetParticipantKey`, `targetPerformerId`, `targetPerformerRef`, `targetPerformerName`
- `direction`, `name`, `description`

Rules:
- `actRules` must be an array of strings.
- Every new relation needs non-empty `name` and `description`.
- Use `source...` and `target...` fields, never legacy `from...` or `to...`.
- For brand-new Teams with known participants, prefer participants and relations directly on `createAct`.

## Draft And Bundle Fields
- Instruction/Skill CRUD acts on local drafts only.
- Skill file actions target saved Skill drafts only.
- Bundle paths are relative to the Skill root.
- Bundle paths must not target `SKILL.md` or `draft.json`.
- Use bundle files for `references/*`, `scripts/*`, `assets/*`, and `agents/openai.yaml`.

## Participant Subscriptions
`updateParticipantSubscriptions` targets a participant by:
- `participantKey`
- attached `performerId`
- same-call `performerRef`
- exact `performerName`

`subscriptions` supports:
- `messagesFromParticipantKeys`
- `messagesFromPerformerIds`
- `messagesFromPerformerRefs`
- `messagesFromPerformerNames`
- `messageTags`
- `callboardKeys`
- `eventTypes`

Rules:
- Use `null` to clear subscriptions.
- `eventTypes` currently supports only `runtime.idle`.
- `callboardKeys` is canonical.

## UI Operations
- `showPerformer`: select/reveal an Agent, or open its editor with `surface: "editor"`.
- `showAct`: select/reveal a Team, or open its editor with `surface: "editor"` and optional `editorMode`.
- `showDraft`: open a saved or same-call Instruction/Skill draft editor.
- `setStudioPanel`: open or close `assetLibrary`, `workspaceTracking`, or `terminal`.
- `setStudioNodeVisibility`: hide or show an existing Agent or Team.
- `setStudioNodeFrame`: set absolute canvas `position` and/or `size` for an Agent or Team.

UI-only operations are hot Studio state changes. Do not describe them as saved, published, installed, or runtime-affecting.

## Examples
Read `references/payload-examples.md` only when you need concrete payload examples.
