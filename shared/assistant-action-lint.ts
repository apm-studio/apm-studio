import type { AssistantActionEnvelope } from './assistant-actions.js'
import {
    hasMeaningfulDraftBlueprint,
    isNonEmptyString,
    isRecord,
    normalizeDraftBlueprintCandidate,
    type ActionRecord,
} from './assistant-action-record.js'

type DraftRefKind = 'instruction' | 'skill'

export interface AssistantActionLintIssue {
    level: 'error' | 'warning'
    actionIndex: number
    message: string
}

type RefState = {
    agents: Set<string>
    teams: Set<string>
    drafts: Map<string, DraftRefKind>
}

function makeRefState(): RefState {
    return {
        agents: new Set(),
        teams: new Set(),
        drafts: new Map(),
    }
}

function pushIssue(
    issues: AssistantActionLintIssue[],
    level: 'error' | 'warning',
    actionIndex: number,
    message: string,
) {
    issues.push({ level, actionIndex, message })
}

function registerNamedRef(
    issues: AssistantActionLintIssue[],
    actionIndex: number,
    refs: Set<string>,
    namespace: string,
    value: unknown,
) {
    if (!isNonEmptyString(value)) return
    if (refs.has(value)) {
        pushIssue(issues, 'error', actionIndex, `${namespace} ref "${value}" is declared more than once in the same tool call.`)
        return
    }
    refs.add(value)
}

function registerDraftRef(
    issues: AssistantActionLintIssue[],
    actionIndex: number,
    refs: Map<string, DraftRefKind>,
    kind: DraftRefKind,
    value: unknown,
) {
    if (!isNonEmptyString(value)) return
    const existingKind = refs.get(value)
    if (existingKind) {
        pushIssue(
            issues,
            'error',
            actionIndex,
            `draft ref "${value}" is already declared for a ${existingKind} draft earlier in the same tool call.`,
        )
        return
    }
    refs.set(value, kind)
}

function requireNamedRef(
    issues: AssistantActionLintIssue[],
    actionIndex: number,
    refs: Set<string>,
    namespace: string,
    value: unknown,
) {
    if (!isNonEmptyString(value)) return
    if (!refs.has(value)) {
        pushIssue(issues, 'error', actionIndex, `${namespace} ref "${value}" is used before it is created in the same tool call.`)
    }
}

function requireDraftRef(
    issues: AssistantActionLintIssue[],
    actionIndex: number,
    refs: Map<string, DraftRefKind>,
    kind: DraftRefKind,
    value: unknown,
) {
    if (!isNonEmptyString(value)) return
    const existingKind = refs.get(value)
    if (!existingKind) {
        pushIssue(issues, 'error', actionIndex, `${kind} draft ref "${value}" is used before it is created in the same tool call.`)
        return
    }
    if (existingKind !== kind) {
        pushIssue(issues, 'error', actionIndex, `${kind} draft ref "${value}" resolves to a ${existingKind} draft in the same tool call.`)
    }
}

function requireAnyDraftRef(
    issues: AssistantActionLintIssue[],
    actionIndex: number,
    refs: Map<string, DraftRefKind>,
    value: unknown,
) {
    if (!isNonEmptyString(value)) return
    if (!refs.has(value)) {
        pushIssue(issues, 'error', actionIndex, `draft ref "${value}" is used before it is created in the same tool call.`)
    }
}

function lintAgentFields(
    actionIndex: number,
    fields: ActionRecord,
    refState: RefState,
    issues: AssistantActionLintIssue[],
) {
    const instructionSelectorCount = [
        isNonEmptyString(fields.instructionUrn) || fields.instructionUrn === null,
        isNonEmptyString(fields.instructionDraftId),
        isNonEmptyString(fields.instructionDraftRef),
        hasMeaningfulDraftBlueprint(fields.instructionDraft),
    ].filter(Boolean).length
    if (instructionSelectorCount > 1) {
        pushIssue(issues, 'error', actionIndex, 'Agent actions must choose only one Instruction source among instructionUrn, instructionDraftId, instructionDraftRef, or instructionDraft.')
    }

    requireDraftRef(issues, actionIndex, refState.drafts, 'instruction', fields.instructionDraftRef)

    if (Array.isArray(fields.addSkillDraftRefs)) {
        for (const draftRef of fields.addSkillDraftRefs) {
            requireDraftRef(issues, actionIndex, refState.drafts, 'skill', draftRef)
        }
    }
}

function lintRelationRefs(
    actionIndex: number,
    relation: ActionRecord,
    refState: RefState,
    issues: AssistantActionLintIssue[],
) {
    requireNamedRef(issues, actionIndex, refState.agents, 'agent', relation.sourceAgentRef)
    requireNamedRef(issues, actionIndex, refState.agents, 'agent', relation.targetAgentRef)
}

function registerInlineDraftRefs(
    actionIndex: number,
    fields: ActionRecord,
    refState: RefState,
    issues: AssistantActionLintIssue[],
) {
    const instructionDraft = normalizeDraftBlueprintCandidate(fields.instructionDraft)
    if (isRecord(instructionDraft)) {
        registerDraftRef(issues, actionIndex, refState.drafts, 'instruction', instructionDraft.ref)
    }
    if (Array.isArray(fields.addSkillDrafts)) {
        for (const draft of fields.addSkillDrafts) {
            if (isRecord(draft)) {
                registerDraftRef(issues, actionIndex, refState.drafts, 'skill', draft.ref)
            }
        }
    }
}

export function lintAssistantActionEnvelope(envelope: AssistantActionEnvelope): AssistantActionLintIssue[] {
    const refState = makeRefState()
    const issues: AssistantActionLintIssue[] = []

    envelope.actions.forEach((action, actionIndex) => {
        const record = action as ActionRecord

        switch (action.type) {
            case 'createInstructionDraft':
                registerDraftRef(issues, actionIndex, refState.drafts, 'instruction', action.ref)
                break
            case 'updateInstructionDraft':
            case 'deleteInstructionDraft':
                requireDraftRef(issues, actionIndex, refState.drafts, 'instruction', action.draftRef)
                break
            case 'createSkillDraft':
                registerDraftRef(issues, actionIndex, refState.drafts, 'skill', action.ref)
                break
            case 'updateSkillDraft':
            case 'deleteSkillDraft':
            case 'upsertSkillBundleFile':
            case 'deleteSkillBundleEntry':
                requireDraftRef(issues, actionIndex, refState.drafts, 'skill', action.draftRef)
                break
            case 'createAgent':
                lintAgentFields(actionIndex, record, refState, issues)
                registerNamedRef(issues, actionIndex, refState.agents, 'agent', action.ref)
                registerInlineDraftRefs(actionIndex, record, refState, issues)
                break
            case 'updateAgent':
                requireNamedRef(issues, actionIndex, refState.agents, 'agent', action.agentRef)
                lintAgentFields(actionIndex, record, refState, issues)
                registerInlineDraftRefs(actionIndex, record, refState, issues)
                break
            case 'deleteAgent':
                requireNamedRef(issues, actionIndex, refState.agents, 'agent', action.agentRef)
                break
            case 'createTeam': {
                const participantRefCount = action.participantAgentRefs?.length || 0
                if ((action.relations?.length || 0) === 0 && participantRefCount + (action.participantAgentIds?.length || 0) + (action.participantAgentNames?.length || 0) >= 2) {
                    pushIssue(issues, 'warning', actionIndex, 'createTeam has multiple participants but no relations. This often produces a disconnected workflow.')
                }
                for (const agentRef of action.participantAgentRefs || []) {
                    requireNamedRef(issues, actionIndex, refState.agents, 'agent', agentRef)
                }
                for (const relation of action.relations || []) {
                    lintRelationRefs(actionIndex, relation as unknown as ActionRecord, refState, issues)
                }
                registerNamedRef(issues, actionIndex, refState.teams, 'team', action.ref)
                break
            }
            case 'updateTeam':
            case 'deleteTeam':
                requireNamedRef(issues, actionIndex, refState.teams, 'team', action.teamRef)
                break
            case 'attachAgentToTeam':
            case 'detachParticipantFromTeam':
            case 'updateParticipantSubscriptions':
                requireNamedRef(issues, actionIndex, refState.teams, 'team', action.teamRef)
                requireNamedRef(issues, actionIndex, refState.agents, 'agent', action.agentRef)
                if (action.type === 'updateParticipantSubscriptions' && action.subscriptions && isRecord(action.subscriptions)) {
                    const agentRefs = Array.isArray(action.subscriptions.messagesFromAgentRefs)
                        ? action.subscriptions.messagesFromAgentRefs
                        : []
                    for (const agentRef of agentRefs) {
                        requireNamedRef(issues, actionIndex, refState.agents, 'agent', agentRef)
                    }
                }
                break
            case 'connectAgents':
                requireNamedRef(issues, actionIndex, refState.teams, 'team', action.teamRef)
                lintRelationRefs(actionIndex, action as unknown as ActionRecord, refState, issues)
                break
            case 'updateRelation':
            case 'removeRelation':
                requireNamedRef(issues, actionIndex, refState.teams, 'team', action.teamRef)
                break
            case 'showAgent':
                requireNamedRef(issues, actionIndex, refState.agents, 'agent', action.agentRef)
                break
            case 'showTeam':
                requireNamedRef(issues, actionIndex, refState.teams, 'team', action.teamRef)
                break
            case 'showDraft':
                if (action.kind === 'instruction' || action.kind === 'skill') {
                    requireDraftRef(issues, actionIndex, refState.drafts, action.kind, action.draftRef)
                } else {
                    requireAnyDraftRef(issues, actionIndex, refState.drafts, action.draftRef)
                }
                break
            case 'setStudioNodeVisibility':
            case 'setStudioNodeFrame':
                if (action.nodeType === 'agent') {
                    requireNamedRef(issues, actionIndex, refState.agents, 'agent', (action as ActionRecord).agentRef)
                } else {
                    requireNamedRef(issues, actionIndex, refState.teams, 'team', (action as ActionRecord).teamRef)
                }
                break
            default:
                break
        }
    })

    return issues
}
