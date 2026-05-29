import type {
    AssistantAction,
    AssistantAgentFields,
    AssistantParticipantSubscriptionsInput,
} from './assistant-actions.js'
import { normalizeAssistantBundlePath } from './assistant-bundle-path.js'
import {
    isFiniteNumber,
    isNonEmptyString,
    isOptionalBoolean,
    isOptionalEventTypeArray,
    isOptionalFiniteNumber,
    isOptionalNullableString,
    isOptionalStringArray,
    isPositiveFiniteNumber,
    isRecord,
    type ActionRecord,
} from './assistant-action-record.js'

function isStudioSurface(value: unknown) {
    return value === undefined || value === 'canvas' || value === 'editor'
}

function isTeamEditorMode(value: unknown) {
    return value === undefined || value === 'team' || value === 'participant' || value === 'relation'
}

function isStudioPanel(value: unknown) {
    return value === 'packages' || value === 'workspaceTracking' || value === 'terminal'
}

function isStudioNodeType(value: unknown) {
    return value === 'agent' || value === 'team'
}

function isDraftBlueprint(value: unknown) {
    if (!isRecord(value)) return false
    return (
        isNonEmptyString(value.name)
        && isNonEmptyString(value.content)
        && (value.ref === undefined || isNonEmptyString(value.ref))
        && (value.slug === undefined || isNonEmptyString(value.slug))
        && (value.description === undefined || isNonEmptyString(value.description))
        && isOptionalStringArray(value.tags)
        && (value.openEditor === undefined || typeof value.openEditor === 'boolean')
    )
}

function isModelBlueprint(value: unknown) {
    return isRecord(value) && isNonEmptyString(value.provider) && isNonEmptyString(value.modelId)
}

function isParticipantSubscriptionsInput(value: unknown): value is AssistantParticipantSubscriptionsInput {
    if (!isRecord(value)) return false
    return (
        isOptionalStringArray(value.messagesFromParticipantKeys)
        && isOptionalStringArray(value.messagesFromAgentIds)
        && isOptionalStringArray(value.messagesFromAgentRefs)
        && isOptionalStringArray(value.messagesFromAgentNames)
        && isOptionalStringArray(value.messageTags)
        && isOptionalStringArray(value.callboardKeys)
        && isOptionalEventTypeArray(value.eventTypes)
    )
}

function hasTeamLocator(action: ActionRecord) {
    return isNonEmptyString(action.teamId) || isNonEmptyString(action.teamRef) || isNonEmptyString(action.teamName)
}

function hasAgentLocator(action: ActionRecord) {
    return isNonEmptyString(action.agentId) || isNonEmptyString(action.agentRef) || isNonEmptyString(action.agentName)
}

function hasParticipantLocator(prefix: 'source' | 'target', action: ActionRecord) {
    return (
        isNonEmptyString(action[`${prefix}ParticipantKey`])
        || isNonEmptyString(action[`${prefix}AgentId`])
        || isNonEmptyString(action[`${prefix}AgentRef`])
        || isNonEmptyString(action[`${prefix}AgentName`])
    )
}

function isTeamSafetyInput(value: unknown) {
    if (!isRecord(value)) return false
    return (
        isOptionalFiniteNumber(value.maxEvents)
        && isOptionalFiniteNumber(value.maxMessagesPerPair)
        && isOptionalFiniteNumber(value.maxBoardUpdatesPerKey)
        && isOptionalFiniteNumber(value.quietWindowMs)
        && isOptionalFiniteNumber(value.threadTimeoutMs)
        && isOptionalFiniteNumber(value.loopDetectionThreshold)
    )
}

function isAgentFields(value: unknown): value is AssistantAgentFields {
    if (!isRecord(value)) return false
    return (
        (value.model === undefined || value.model === null || isModelBlueprint(value.model))
        && (value.modelVariant === undefined || value.modelVariant === null || isNonEmptyString(value.modelVariant))
        && isOptionalNullableString(value.description)
        && (value.instructionUrn === undefined || value.instructionUrn === null || isNonEmptyString(value.instructionUrn))
        && (value.instructionDraftId === undefined || isNonEmptyString(value.instructionDraftId))
        && (value.instructionDraftRef === undefined || isNonEmptyString(value.instructionDraftRef))
        && (value.instructionDraft === undefined || isDraftBlueprint(value.instructionDraft))
        && isOptionalStringArray(value.addSkillUrns)
        && isOptionalStringArray(value.addSkillDraftIds)
        && isOptionalStringArray(value.addSkillDraftRefs)
        && (value.addSkillDrafts === undefined || (Array.isArray(value.addSkillDrafts) && value.addSkillDrafts.every((draft) => isDraftBlueprint(draft))))
        && isOptionalStringArray(value.removeSkillUrns)
        && isOptionalStringArray(value.removeSkillDraftIds)
        && isOptionalStringArray(value.addMcpServerNames)
        && isOptionalStringArray(value.removeMcpServerNames)
    )
}

function isTeamRelationBlueprint(value: unknown) {
    if (!isRecord(value)) return false
    return (
        hasParticipantLocator('source', value)
        && hasParticipantLocator('target', value)
        && (value.direction === undefined || value.direction === 'both' || value.direction === 'one-way')
        && isNonEmptyString(value.name)
        && isNonEmptyString(value.description)
    )
}

function resolveDraftLocator(action: ActionRecord) {
    return isNonEmptyString(action.draftId) || isNonEmptyString(action.draftRef) || isNonEmptyString(action.draftName)
}

function isFramePosition(value: unknown) {
    return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

function isFrameSize(value: unknown) {
    return isRecord(value) && isPositiveFiniteNumber(value.width) && isPositiveFiniteNumber(value.height)
}

function isStudioNodeFramePatch(action: ActionRecord) {
    const hasPosition = action.position !== undefined
    const hasSize = action.size !== undefined
    return (
        (hasPosition || hasSize)
        && (action.position === undefined || isFramePosition(action.position))
        && (action.size === undefined || isFrameSize(action.size))
    )
}

function hasValidBundlePath(action: ActionRecord) {
    return normalizeAssistantBundlePath(typeof action.path === 'string' ? action.path : null) !== null
}

export function isValidAssistantAction(action: unknown): action is AssistantAction {
    if (!isRecord(action) || !isNonEmptyString(action.type)) {
        return false
    }

    switch (action.type) {
        case 'createInstructionDraft':
        case 'createSkillDraft':
            return (
                isNonEmptyString(action.name)
                && isNonEmptyString(action.content)
                && (action.slug === undefined || isNonEmptyString(action.slug))
                && (action.description === undefined || isNonEmptyString(action.description))
                && isOptionalStringArray(action.tags)
                && (action.openEditor === undefined || typeof action.openEditor === 'boolean')
            )
        case 'updateInstructionDraft':
        case 'deleteInstructionDraft':
            return !!resolveDraftLocator(action)
        case 'updateSkillDraft':
        case 'deleteSkillDraft':
            return !!resolveDraftLocator(action)
        case 'upsertSkillBundleFile':
            return !!resolveDraftLocator(action) && hasValidBundlePath(action) && isNonEmptyString(action.content)
        case 'deleteSkillBundleEntry':
            return !!resolveDraftLocator(action) && hasValidBundlePath(action)
        case 'createAgent':
            return isNonEmptyString(action.name) && isAgentFields(action)
        case 'updateAgent':
            return (
                hasAgentLocator(action)
                && (action.name === undefined || isNonEmptyString(action.name))
                && isAgentFields(action)
            )
        case 'deleteAgent':
            return hasAgentLocator(action)
        case 'createTeam':
            return (
                isNonEmptyString(action.name)
                && (action.description === undefined || isNonEmptyString(action.description))
                && isOptionalStringArray(action.teamRules)
                && (action.safety === undefined || isTeamSafetyInput(action.safety))
                && isOptionalStringArray(action.participantAgentIds)
                && isOptionalStringArray(action.participantAgentRefs)
                && isOptionalStringArray(action.participantAgentNames)
                && (action.relations === undefined || (Array.isArray(action.relations) && action.relations.every((relation) => isTeamRelationBlueprint(relation))))
            )
        case 'updateTeam':
            return (
                hasTeamLocator(action)
                && (action.name === undefined || isNonEmptyString(action.name))
                && (action.description === undefined || isNonEmptyString(action.description))
                && isOptionalStringArray(action.teamRules)
                && (action.safety === undefined || action.safety === null || isTeamSafetyInput(action.safety))
            )
        case 'deleteTeam':
            return hasTeamLocator(action)
        case 'attachAgentToTeam':
            return hasTeamLocator(action) && hasAgentLocator(action)
        case 'detachParticipantFromTeam':
            return hasTeamLocator(action) && (isNonEmptyString(action.participantKey) || hasAgentLocator(action))
        case 'updateParticipantSubscriptions':
            return (
                hasTeamLocator(action)
                && (isNonEmptyString(action.participantKey) || hasAgentLocator(action))
                && (action.subscriptions === null || isParticipantSubscriptionsInput(action.subscriptions))
            )
        case 'connectAgents':
            return (
                hasTeamLocator(action)
                && hasParticipantLocator('source', action)
                && hasParticipantLocator('target', action)
                && (action.direction === undefined || action.direction === 'both' || action.direction === 'one-way')
                && isNonEmptyString(action.name)
                && isNonEmptyString(action.description)
            )
        case 'updateRelation':
        case 'removeRelation':
            return hasTeamLocator(action) && isNonEmptyString(action.relationId)
        case 'showAgent':
            return (
                hasAgentLocator(action)
                && isStudioSurface(action.surface)
                && isOptionalBoolean(action.reveal)
                && (action.editorFocus === undefined || isNonEmptyString(action.editorFocus))
            )
        case 'showTeam':
            return (
                hasTeamLocator(action)
                && isStudioSurface(action.surface)
                && isOptionalBoolean(action.reveal)
                && isTeamEditorMode(action.editorMode)
                && (action.participantKey === undefined || isNonEmptyString(action.participantKey))
                && (action.relationId === undefined || isNonEmptyString(action.relationId))
                && (action.editorMode !== 'participant' || isNonEmptyString(action.participantKey))
                && (action.editorMode !== 'relation' || isNonEmptyString(action.relationId))
            )
        case 'showDraft':
            return (
                resolveDraftLocator(action)
                && (action.kind === undefined || action.kind === 'instruction' || action.kind === 'skill')
            )
        case 'setStudioNodeVisibility':
            return (
                isStudioNodeType(action.nodeType)
                && typeof action.visible === 'boolean'
                && (action.nodeType === 'agent' ? hasAgentLocator(action) : hasTeamLocator(action))
            )
        case 'setStudioNodeFrame':
            return (
                isStudioNodeType(action.nodeType)
                && (action.nodeType === 'agent' ? hasAgentLocator(action) : hasTeamLocator(action))
                && isStudioNodeFramePatch(action)
            )
        case 'setStudioPanel':
            return isStudioPanel(action.panel) && typeof action.open === 'boolean'
        default:
            return false
    }
}

export function hasAssistantActionAgentLocator(action: ActionRecord) {
    return hasAgentLocator(action)
}

export function hasAssistantActionTeamLocator(action: ActionRecord) {
    return hasTeamLocator(action)
}
