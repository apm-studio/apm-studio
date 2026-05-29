import type { ParticipantSubscriptions, TeamDefinition, TeamRelation } from './team-types.js'

export type TeamDefinitionValidationFocus =
    | { mode: 'team' }
    | { mode: 'participant'; participantKey: string }
    | { mode: 'relation'; relationId?: string }

export interface TeamDefinitionValidationIssue {
    code: string
    severity: 'error'
    message: string
    focus?: TeamDefinitionValidationFocus
}

const SUPPORTED_SUBSCRIPTION_EVENT_TYPES = ['runtime.idle'] as const

function issue(
    code: string,
    message: string,
    focus?: TeamDefinitionValidationFocus,
): TeamDefinitionValidationIssue {
    return {
        code,
        severity: 'error',
        message,
        ...(focus ? { focus } : {}),
    }
}

function isNonBlankString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateStringArray(params: {
    value: unknown
    fieldName: keyof ParticipantSubscriptions
    participantKey: string
    blankCode: string
    invalidCode: string
    unknownValues?: Set<string>
    unknownCode?: string
}): TeamDefinitionValidationIssue[] {
    const {
        value,
        fieldName,
        participantKey,
        blankCode,
        invalidCode,
        unknownValues,
        unknownCode,
    } = params
    if (value === undefined) return []
    if (!Array.isArray(value)) {
        return [issue(
            invalidCode,
            `Participant "${participantKey}": subscriptions.${fieldName} must be an array`,
            { mode: 'participant', participantKey },
        )]
    }

    const issues: TeamDefinitionValidationIssue[] = []
    for (const entry of value) {
        if (!isNonBlankString(entry)) {
            issues.push(issue(
                blankCode,
                `Participant "${participantKey}": subscriptions.${fieldName} contains a blank or non-string entry`,
                { mode: 'participant', participantKey },
            ))
            continue
        }
        if (unknownValues && !unknownValues.has(entry)) {
            issues.push(issue(
                unknownCode || invalidCode,
                `Participant "${participantKey}": subscriptions.${fieldName} references unknown participant "${entry}"`,
                { mode: 'participant', participantKey },
            ))
        }
    }
    return issues
}

function validateSubscriptionEventTypes(
    participantKey: string,
    eventTypes: unknown,
): TeamDefinitionValidationIssue[] {
    if (eventTypes === undefined) return []
    if (!Array.isArray(eventTypes)) {
        return [issue(
            'invalid-subscription-event-types',
            `Participant "${participantKey}": subscriptions.eventTypes must be an array`,
            { mode: 'participant', participantKey },
        )]
    }

    const issues: TeamDefinitionValidationIssue[] = []
    for (const eventType of eventTypes) {
        if (!isNonBlankString(eventType)) {
            issues.push(issue(
                'blank-subscription-event-type',
                `Participant "${participantKey}": subscriptions.eventTypes contains a blank or non-string entry`,
                { mode: 'participant', participantKey },
            ))
            continue
        }
        if (!SUPPORTED_SUBSCRIPTION_EVENT_TYPES.includes(eventType as typeof SUPPORTED_SUBSCRIPTION_EVENT_TYPES[number])) {
            issues.push(issue(
                'unsupported-subscription-event-type',
                `Participant "${participantKey}": unknown event type "${eventType}" in subscriptions.eventTypes`,
                { mode: 'participant', participantKey },
            ))
        }
    }
    return issues
}

function validateRelation(
    relation: TeamRelation,
    participantKeys: Set<string>,
): TeamDefinitionValidationIssue[] {
    const focus = { mode: 'relation', relationId: relation.id } as const
    const issues: TeamDefinitionValidationIssue[] = []
    for (const endpoint of relation.between) {
        if (!participantKeys.has(endpoint)) {
            issues.push(issue(
                'unknown-relation-endpoint',
                `Relation "${relation.name}" references unknown participant "${endpoint}"`,
                focus,
            ))
        }
    }
    if (relation.direction !== 'both' && relation.direction !== 'one-way') {
        issues.push(issue(
            'invalid-relation-direction',
            `Relation "${relation.name || '?'}": direction must be 'both' or 'one-way'`,
            focus,
        ))
    }
    if (!isNonBlankString(relation.name)) {
        issues.push(issue('empty-relation-name', 'Relation name is required and must be a non-empty string', focus))
    }
    if (!isNonBlankString(relation.description)) {
        issues.push(issue(
            'empty-relation-description',
            `Relation "${relation.name}": description is required and must be a non-empty string`,
            focus,
        ))
    }
    return issues
}

export function validateTeamDefinition(def: TeamDefinition | undefined): TeamDefinitionValidationIssue[] {
    if (!def) return []

    const participantKeys = Object.keys(def.participants || {})
    const participantKeySet = new Set(participantKeys)
    const issues: TeamDefinitionValidationIssue[] = []
    if (participantKeys.length === 0) {
        issues.push(issue('no-participants', 'Team must have at least one agent', { mode: 'team' }))
    }

    for (const [key, binding] of Object.entries(def.participants || {})) {
        const focus = { mode: 'participant', participantKey: key } as const
        const ref = binding?.agentRef as unknown
        if (!isRecord(ref) || !isNonBlankString(ref.kind)) {
            issues.push(issue('missing-agent-ref', `Participant "${key}": agentRef is required with a valid kind`, focus))
            continue
        }
        const refKind = ref.kind
        if (refKind !== 'draft' && refKind !== 'registry') {
            issues.push(issue(
                'invalid-agent-ref-kind',
                `Participant "${key}": agentRef.kind must be 'draft' or 'registry', got "${refKind}"`,
                focus,
            ))
        }
        if (refKind === 'draft' && !isNonBlankString(ref.draftId)) {
            issues.push(issue('missing-draft-agent-ref', `Participant "${key}": draft agentRef must include draftId`, focus))
        }
        if (refKind === 'registry' && !isNonBlankString(ref.urn)) {
            issues.push(issue('missing-registry-agent-ref', `Participant "${key}": registry agentRef must include urn`, focus))
        }

        const subs = binding?.subscriptions
        if (!subs) continue
        issues.push(...validateStringArray({
            value: subs.messagesFrom,
            fieldName: 'messagesFrom',
            participantKey: key,
            blankCode: 'blank-subscription-message-source',
            invalidCode: 'invalid-subscription-message-sources',
            unknownCode: 'invalid-subscription-source',
            unknownValues: participantKeySet,
        }))
        issues.push(...validateStringArray({
            value: subs.messageTags,
            fieldName: 'messageTags',
            participantKey: key,
            blankCode: 'blank-subscription-message-tag',
            invalidCode: 'invalid-subscription-message-tags',
        }))
        issues.push(...validateStringArray({
            value: subs.callboardKeys,
            fieldName: 'callboardKeys',
            participantKey: key,
            blankCode: 'blank-subscription-callboard-key',
            invalidCode: 'invalid-subscription-callboard-keys',
        }))
        issues.push(...validateSubscriptionEventTypes(key, subs.eventTypes))
    }

    const relations = def.relations || []
    if (participantKeys.length > 1 && relations.length === 0) {
        issues.push(issue('no-relations', 'Multiple participants require at least one relation', { mode: 'team' }))
    }
    for (const relation of relations) {
        issues.push(...validateRelation(relation, participantKeySet))
    }

    return issues
}

export function firstTeamDefinitionValidationError(def: TeamDefinition | undefined): string | null {
    return validateTeamDefinition(def)[0]?.message || null
}
