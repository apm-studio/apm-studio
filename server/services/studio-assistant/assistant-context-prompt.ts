import type { AssistantWorkspaceContext } from '../../../shared/assistant-actions.js'
import { optimizeAssistantWorkspaceContext } from './assistant-context-optimizer.js'

export function buildAssistantActionPrompt(
    context: AssistantWorkspaceContext | null | undefined,
    userMessage = '',
): string {
    const snapshot = JSON.stringify(
        optimizeAssistantWorkspaceContext(context, userMessage),
        null,
        2,
    )

    return [
        'Current Workspace Snapshot (optimized for this turn):',
        '```json',
        snapshot,
        '```',
        'Use the snapshot as the source of truth for current ids, exact names, models, draft save state, topology, and UI state included in this optimized view.',
        'Action decision:',
        '- Explain directly only when the user wants guidance, critique, or a concept answer.',
        '- Ask one short clarifying question only when the target, creation path, or important design choice is unresolved.',
        '- When the user clearly asks Studio to create, update, delete, open, show, hide, move, resize, arrange, import, install, or apply something, call `apply_studio_actions`; do not stop at describing what you would change.',
        '- Keep user-facing text brief; send mutations only as a tool call, never as raw JSON or fenced code.',
        'Tool payload rules:',
        '- Load `studio-assistant-action-surface-guide` before non-trivial mutation payloads or when exact fields/refs are needed.',
        '- Load the smallest relevant design guide for the task: Agent, Team, workflow, Instruction, Studio UI operations, Skill authoring, or find-skills.',
        '- Relevant guide names: `studio-assistant-agent-guide`, `studio-assistant-team-guide`, `studio-assistant-workflow-guide`, `studio-assistant-instruction-design-guide`, `studio-assistant-ui-operations-guide`, `studio-assistant-skill-creator-guide`, `find-skills`.',
        '- Tool arguments must be `{version:1, actions:[...]}`. Omit unspecified optional fields and validate the whole envelope before calling.',
        '- Prefer snapshot ids. Use exact names only when unambiguous. Never invent ids, model ids, model variants, MCP names, URNs, relation ids, or draft ids.',
        '- Use same-call refs only for objects created earlier in the same tool call; dependent actions must be in order.',
        '- Reuse existing Studio objects when they fit. Create new objects only when the user asked for new or tailored primitives.',
        '- Instruction and Skill actions are draft-only; Agent and Team actions mutate the current Studio workspace only; package import and target sync are outside this tool surface.',
        '- UI actions are hot state changes. Use `showAgent`, `showTeam`, `showDraft`, `setStudioPanel`, `setStudioNodeVisibility`, or `setStudioNodeFrame` for open/show/focus/reveal/hide/move/resize/panel requests.',
        '- For clear Agent or workflow creation, missing Skill/MCP/model details alone should not block mutation. Do not create or attach Instruction drafts as part of Agent creation; Instruction is standalone.',
        '- For new workflow Teams, create missing Agents first, then create/update the Team with participants and at least one meaningful relation when there are multiple workflow participants.',
        '- Relation payloads use `source...` and `target...` fields only; every new relation needs non-empty `name` and `description`.',
        '- `teamRules` is always an array of strings. Participant subscriptions are wake filters and use canonical `callboardKeys`; `eventTypes` supports only `runtime.idle`.',
    ].join('\n')
}
