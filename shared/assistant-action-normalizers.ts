import {
    cleanUndefinedFields,
    hasMeaningfulDraftBlueprint,
    isNonEmptyString,
    isRecord,
    normalizeDraftBlueprintCandidate,
    normalizeOptionalString,
    normalizeOptionalStringArray,
    type ActionRecord,
} from './assistant-action-record.js'

function normalizeModelBlueprintCandidate(value: unknown) {
    if (!isRecord(value)) {
        return value === undefined || value === null ? value : value
    }

    const provider = normalizeOptionalString(value.provider)
    const modelId = normalizeOptionalString(value.modelId)
    if (!provider && !modelId) {
        return undefined
    }

    return {
        ...(provider !== undefined ? { provider } : {}),
        ...(modelId !== undefined ? { modelId } : {}),
    }
}

function normalizeRelationBlueprintCandidate(value: unknown) {
    if (!isRecord(value)) {
        return value === undefined ? undefined : value
    }

    return cleanUndefinedFields({
        sourceParticipantKey: normalizeOptionalString(value.sourceParticipantKey),
        sourceAgentId: normalizeOptionalString(value.sourceAgentId),
        sourceAgentRef: normalizeOptionalString(value.sourceAgentRef),
        sourceAgentName: normalizeOptionalString(value.sourceAgentName),
        targetParticipantKey: normalizeOptionalString(value.targetParticipantKey),
        targetAgentId: normalizeOptionalString(value.targetAgentId),
        targetAgentRef: normalizeOptionalString(value.targetAgentRef),
        targetAgentName: normalizeOptionalString(value.targetAgentName),
        direction: value.direction,
        name: normalizeOptionalString(value.name),
        description: normalizeOptionalString(value.description),
    })
}

function normalizeParticipantSubscriptionsCandidate(value: unknown) {
    if (!isRecord(value)) {
        return value === undefined ? undefined : value
    }
    return cleanUndefinedFields({
        messagesFromParticipantKeys: normalizeOptionalStringArray(value.messagesFromParticipantKeys),
        messagesFromAgentIds: normalizeOptionalStringArray(value.messagesFromAgentIds),
        messagesFromAgentRefs: normalizeOptionalStringArray(value.messagesFromAgentRefs),
        messagesFromAgentNames: normalizeOptionalStringArray(value.messagesFromAgentNames),
        messageTags: normalizeOptionalStringArray(value.messageTags),
        callboardKeys: normalizeOptionalStringArray(value.callboardKeys),
        eventTypes: value.eventTypes,
    })
}

function normalizeDraftLocators(action: ActionRecord) {
    return {
        draftId: normalizeOptionalString(action.draftId),
        draftRef: normalizeOptionalString(action.draftRef),
        draftName: normalizeOptionalString(action.draftName),
    }
}

function normalizeTeamLocators(action: ActionRecord) {
    return {
        teamId: normalizeOptionalString(action.teamId),
        teamRef: normalizeOptionalString(action.teamRef),
        teamName: normalizeOptionalString(action.teamName),
    }
}

function normalizeAgentLocators(action: ActionRecord) {
    return {
        agentId: normalizeOptionalString(action.agentId),
        agentRef: normalizeOptionalString(action.agentRef),
        agentName: normalizeOptionalString(action.agentName),
    }
}

function normalizeParticipantLocator(action: ActionRecord) {
    return {
        participantKey: normalizeOptionalString(action.participantKey),
    }
}

function normalizeCreateDraftActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ref: normalizeOptionalString(action.ref),
        name: normalizeOptionalString(action.name),
        content: normalizeOptionalString(action.content),
        slug: normalizeOptionalString(action.slug),
        description: normalizeOptionalString(action.description),
        tags: normalizeOptionalStringArray(action.tags),
        openEditor: action.openEditor,
    })
}

function normalizeUpdateDraftActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeDraftLocators(action),
        name: normalizeOptionalString(action.name),
        content: normalizeOptionalString(action.content),
        description: normalizeOptionalString(action.description),
        tags: normalizeOptionalStringArray(action.tags),
    })
}

function normalizeDeleteDraftActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeDraftLocators(action),
    })
}

function normalizeSkillBundleFileActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeDraftLocators(action),
        path: normalizeOptionalString(action.path),
        content: normalizeOptionalString(action.content),
    })
}

function normalizeDeleteSkillBundleEntryActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeDraftLocators(action),
        path: normalizeOptionalString(action.path),
    })
}

function normalizeAgentFieldsCandidate(action: ActionRecord) {
    const normalizedInstructionDraftId = normalizeOptionalString(action.instructionDraftId)
    const normalizedInstructionDraftRef = normalizeOptionalString(action.instructionDraftRef)
    const normalizedInstructionDraft = normalizeDraftBlueprintCandidate(action.instructionDraft)
    const normalizedInstructionUrn = normalizeOptionalString(action.instructionUrn, { allowNull: true })

    return cleanUndefinedFields({
        model: normalizeModelBlueprintCandidate(action.model),
        modelVariant: normalizeOptionalString(action.modelVariant, { allowNull: true }),
        description: normalizeOptionalString(action.description, { allowNull: true }),
        instructionUrn: normalizedInstructionUrn === null && (
            isNonEmptyString(normalizedInstructionDraftId)
            || isNonEmptyString(normalizedInstructionDraftRef)
            || hasMeaningfulDraftBlueprint(normalizedInstructionDraft)
        )
            ? undefined
            : normalizedInstructionUrn,
        instructionDraftId: normalizedInstructionDraftId,
        instructionDraftRef: normalizedInstructionDraftRef,
        instructionDraft: normalizedInstructionDraft,
        addSkillUrns: normalizeOptionalStringArray(action.addSkillUrns),
        addSkillDraftIds: normalizeOptionalStringArray(action.addSkillDraftIds),
        addSkillDraftRefs: normalizeOptionalStringArray(action.addSkillDraftRefs),
        addSkillDrafts: Array.isArray(action.addSkillDrafts)
            ? action.addSkillDrafts
                .map((draft) => normalizeDraftBlueprintCandidate(draft))
                .filter((draft) => draft !== undefined)
            : action.addSkillDrafts,
        removeSkillUrns: normalizeOptionalStringArray(action.removeSkillUrns),
        removeSkillDraftIds: normalizeOptionalStringArray(action.removeSkillDraftIds),
        addMcpServerNames: normalizeOptionalStringArray(action.addMcpServerNames),
        removeMcpServerNames: normalizeOptionalStringArray(action.removeMcpServerNames),
    })
}

function normalizeAgentActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ref: normalizeOptionalString(action.ref),
        ...normalizeAgentLocators(action),
        name: normalizeOptionalString(action.name),
        ...normalizeAgentFieldsCandidate(action),
    })
}

function normalizeShowAgentActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeAgentLocators(action),
        surface: action.surface,
        reveal: action.reveal,
        editorFocus: normalizeOptionalString(action.editorFocus),
    })
}

function normalizeShowTeamActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeTeamLocators(action),
        surface: action.surface,
        reveal: action.reveal,
        editorMode: action.editorMode,
        participantKey: normalizeOptionalString(action.participantKey),
        relationId: normalizeOptionalString(action.relationId),
    })
}

function normalizeShowDraftActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeDraftLocators(action),
        kind: action.kind,
    })
}

function normalizeStudioNodeActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        nodeType: action.nodeType,
        visible: action.visible,
        position: action.position,
        size: action.size,
        ...(action.nodeType === 'agent' ? normalizeAgentLocators(action) : normalizeTeamLocators(action)),
    })
}

function normalizeCreateTeamActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ref: normalizeOptionalString(action.ref),
        name: normalizeOptionalString(action.name),
        description: normalizeOptionalString(action.description),
        teamRules: normalizeOptionalStringArray(action.teamRules),
        safety: action.safety,
        participantAgentIds: normalizeOptionalStringArray(action.participantAgentIds),
        participantAgentRefs: normalizeOptionalStringArray(action.participantAgentRefs),
        participantAgentNames: normalizeOptionalStringArray(action.participantAgentNames),
        relations: Array.isArray(action.relations)
            ? action.relations
                .map((relation) => normalizeRelationBlueprintCandidate(relation))
                .filter((relation) => relation !== undefined)
            : action.relations,
    })
}

function normalizeUpdateTeamActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeTeamLocators(action),
        name: normalizeOptionalString(action.name),
        description: normalizeOptionalString(action.description),
        teamRules: normalizeOptionalStringArray(action.teamRules),
        safety: action.safety,
    })
}

function normalizeTeamAgentActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeTeamLocators(action),
        ...normalizeAgentLocators(action),
    })
}

function normalizeDetachParticipantActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeTeamLocators(action),
        ...normalizeAgentLocators(action),
        ...normalizeParticipantLocator(action),
    })
}

function normalizeUpdateParticipantSubscriptionsActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeTeamLocators(action),
        ...normalizeAgentLocators(action),
        ...normalizeParticipantLocator(action),
        subscriptions: action.subscriptions === null
            ? null
            : normalizeParticipantSubscriptionsCandidate(action.subscriptions),
    })
}

function normalizeConnectAgentsActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeTeamLocators(action),
        ...normalizeRelationBlueprintCandidate(action),
    })
}

function normalizeUpdateRelationActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeTeamLocators(action),
        relationId: normalizeOptionalString(action.relationId),
        name: normalizeOptionalString(action.name),
        description: normalizeOptionalString(action.description),
        direction: action.direction,
    })
}

function normalizeRemoveRelationActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        ...normalizeTeamLocators(action),
        relationId: normalizeOptionalString(action.relationId),
    })
}

function normalizeSetStudioPanelActionCandidate(action: ActionRecord) {
    return cleanUndefinedFields({
        type: action.type,
        panel: action.panel,
        open: action.open,
    })
}

export function normalizeAssistantActionCandidate(action: unknown): unknown {
    if (!isRecord(action) || !isNonEmptyString(action.type)) {
        return action
    }

    switch (action.type) {
        case 'createInstructionDraft':
        case 'createSkillDraft':
            return normalizeCreateDraftActionCandidate(action)
        case 'updateInstructionDraft':
        case 'updateSkillDraft':
            return normalizeUpdateDraftActionCandidate(action)
        case 'deleteInstructionDraft':
        case 'deleteSkillDraft':
            return normalizeDeleteDraftActionCandidate(action)
        case 'upsertSkillBundleFile':
            return normalizeSkillBundleFileActionCandidate(action)
        case 'deleteSkillBundleEntry':
            return normalizeDeleteSkillBundleEntryActionCandidate(action)
        case 'createAgent':
        case 'updateAgent':
            return normalizeAgentActionCandidate(action)
        case 'createTeam':
            return normalizeCreateTeamActionCandidate(action)
        case 'updateTeam':
            return normalizeUpdateTeamActionCandidate(action)
        case 'deleteAgent':
            return cleanUndefinedFields({
                type: action.type,
                ...normalizeAgentLocators(action),
            })
        case 'deleteTeam':
            return cleanUndefinedFields({
                type: action.type,
                ...normalizeTeamLocators(action),
            })
        case 'attachAgentToTeam':
            return normalizeTeamAgentActionCandidate(action)
        case 'detachParticipantFromTeam':
            return normalizeDetachParticipantActionCandidate(action)
        case 'updateParticipantSubscriptions':
            return normalizeUpdateParticipantSubscriptionsActionCandidate(action)
        case 'connectAgents':
            return normalizeConnectAgentsActionCandidate(action)
        case 'updateRelation':
            return normalizeUpdateRelationActionCandidate(action)
        case 'removeRelation':
            return normalizeRemoveRelationActionCandidate(action)
        case 'showAgent':
            return normalizeShowAgentActionCandidate(action)
        case 'showTeam':
            return normalizeShowTeamActionCandidate(action)
        case 'showDraft':
            return normalizeShowDraftActionCandidate(action)
        case 'setStudioNodeVisibility':
        case 'setStudioNodeFrame':
            return normalizeStudioNodeActionCandidate(action)
        case 'setStudioPanel':
            return normalizeSetStudioPanelActionCandidate(action)
        default:
            return action
    }
}

export function normalizeAssistantActionEnvelopeCandidate(input: unknown): { version?: unknown; actions?: unknown } | null {
    if (typeof input === 'string') {
        const trimmed = input.trim()
        if (!trimmed) {
            return null
        }

        try {
            const parsed = JSON.parse(trimmed)
            return parsed && typeof parsed === 'object'
                ? parsed as { version?: unknown; actions?: unknown }
                : null
        } catch {
            return null
        }
    }

    if (!input || typeof input !== 'object') {
        return null
    }

    return input as { version?: unknown; actions?: unknown }
}
