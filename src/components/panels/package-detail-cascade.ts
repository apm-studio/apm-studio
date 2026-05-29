import type { PackageSource } from '../../../shared/package-source-contracts'
import type { AgentDraftContent, TeamDraftContent } from '../../../shared/draft-contracts'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts'
import type { ParticipantSubscriptions } from '../../../shared/team-types'
import type { PackagePanelItem, PackagePrimitive } from './package-panel-types'
import { displayUrn } from './package-library-utils'

type PackageCascadeKind = 'instruction' | 'skill' | 'agent' | 'team'

export type CascadeReference = {
    kind: PackageCascadeKind
    label: string
    stub: PackagePrimitive | null
}

export type CascadeParticipant = {
    key: string
    agent: CascadeReference
    subscriptions: string[]
}

export type CascadeRelation = {
    name: string
    direction: 'both' | 'one-way'
    between: [string, string]
    description: string
}

function isPackageCascadeKind(value: unknown): value is PackageCascadeKind {
    return value === 'instruction' || value === 'skill' || value === 'agent' || value === 'team'
}

function nestedPackageSource(source?: PackageSource): PackageSource | undefined {
    if (source === 'workspace' || source === 'user' || source === 'registry') return source
    return undefined
}

export function buildCascadeStubFromUrn(urn: string, source?: PackageSource): PackagePrimitive | null {
    const [kind, author, segment3, segment4] = urn.split('/')
    if (!isPackageCascadeKind(kind) || !author) return null
    const name = segment4 || segment3
    if (!name) return null
    const resolvedSource = nestedPackageSource(source)
    if (!resolvedSource) return null
    return {
        kind,
        urn,
        name,
        slug: name,
        author,
        source: resolvedSource,
    } as PackagePrimitive
}

export function extractInlinePrimitiveContent(item: PackagePanelItem | PackagePrimitive | null) {
    if (!item) return null
    if (typeof item.body === 'string' && item.body.trim()) return item.body
    if (typeof item.instructions === 'string' && item.instructions.trim()) return item.instructions
    if (typeof item.content === 'string' && item.content.trim()) return item.content
    return null
}

export function summarizeMarkdown(input: string | null | undefined, limit = 180) {
    if (!input) return null
    const normalized = input
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[>*_~|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    if (!normalized) return null
    return normalized.length > limit
        ? `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
        : normalized
}

function agentDraftContent(item: PackagePanelItem | PackagePrimitive): AgentDraftContent | null {
    if (item.kind !== 'agent' || !item.draftContent) return null
    return item.draftContent as AgentDraftContent
}

function teamDraftContent(item: PackagePanelItem | PackagePrimitive): TeamDraftContent | null {
    if (item.kind !== 'team' || !item.draftContent) return null
    return item.draftContent as TeamDraftContent
}

function refLabel(kind: PackageCascadeKind, ref: SharedPrimitiveRef | null | undefined) {
    if (!ref) return kind
    if (ref.kind === 'registry' && ref.urn.trim()) return displayUrn(ref.urn)
    if (ref.kind === 'draft' && ref.draftId.trim()) return `${kind} draft`
    return kind
}

export function getAgentCascadeReferences(item: PackagePanelItem | PackagePrimitive): CascadeReference[] {
    if (item.kind !== 'agent') return []

    const references: CascadeReference[] = []
    const instructionUrn = item.instructionUrn
    const skillUrns = item.skillUrns

    if (typeof instructionUrn === 'string' && instructionUrn.trim()) {
        references.push({
            kind: 'instruction',
            label: displayUrn(instructionUrn),
            stub: buildCascadeStubFromUrn(instructionUrn, item.source),
        })
    }

    if (Array.isArray(skillUrns)) {
        skillUrns
            .filter((urn): urn is string => typeof urn === 'string' && urn.trim().length > 0)
            .forEach((skillUrn) => {
                references.push({
                    kind: 'skill',
                    label: displayUrn(skillUrn),
                    stub: buildCascadeStubFromUrn(skillUrn, item.source),
                })
            })
    }

    if (references.length > 0) return references

    const draft = agentDraftContent(item)
    if (!draft) return references

    if (draft.instructionRef) {
        references.push({
            kind: 'instruction',
            label: refLabel('instruction', draft.instructionRef),
            stub: null,
        })
    }

    if (Array.isArray(draft.skillRefs)) {
        draft.skillRefs.forEach((skillRef) => {
            references.push({
                kind: 'skill',
                label: refLabel('skill', skillRef),
                stub: null,
            })
        })
    }

    return references
}

export function getAgentSummary(item: PackagePanelItem | PackagePrimitive) {
    if (item.kind !== 'agent') return null
    const parts: string[] = []
    const skillUrns = item.skillUrns
    if (item.instructionUrn) parts.push('Instruction linked')
    if (Array.isArray(skillUrns) && skillUrns.length > 0) {
        parts.push(`${skillUrns.length} Skill${skillUrns.length > 1 ? 's' : ''}`)
    }
    if (item.model?.provider && item.model?.modelId) {
        parts.push(`${item.model.provider}/${item.model.modelId}`)
    }
    return parts.length > 0 ? parts.join(' · ') : null
}

function formatSubscriptionLine(label: string, values: string[] | undefined) {
    return values && values.length > 0 ? `${label}: ${values.join(', ')}` : null
}

function subscriptionLines(subscriptions: ParticipantSubscriptions | undefined) {
    if (!subscriptions) return []
    return [
        formatSubscriptionLine('from', subscriptions.messagesFrom),
        formatSubscriptionLine('tags', subscriptions.messageTags),
        formatSubscriptionLine('board', subscriptions.callboardKeys),
        formatSubscriptionLine('events', subscriptions.eventTypes),
    ].filter((entry): entry is string => !!entry)
}

export function getTeamCascadeParticipants(item: PackagePanelItem | PackagePrimitive): CascadeParticipant[] {
    if (item.kind !== 'team') return []

    if (Array.isArray(item.participants)) {
        return item.participants
            .map((participant, index) => {
                const agentUrn = participant.agent
                const key = participant.key || `participant-${index + 1}`
                return {
                    key,
                    agent: {
                        kind: 'agent' as const,
                        label: agentUrn ? displayUrn(agentUrn) : 'agent',
                        stub: agentUrn ? buildCascadeStubFromUrn(agentUrn, item.source) : null,
                    },
                    subscriptions: subscriptionLines(participant.subscriptions),
                }
            })
    }

    const draft = teamDraftContent(item)
    if (!draft) return []

    return Object.entries(draft.participants).map(([key, participant]) => {
        return {
            key,
            agent: {
                kind: 'agent' as const,
                label: refLabel('agent', participant.agentRef),
                stub: null,
            },
            subscriptions: subscriptionLines(participant.subscriptions),
        }
    })
}

export function getTeamCascadeRelations(item: PackagePanelItem | PackagePrimitive): CascadeRelation[] {
    if (item.kind !== 'team') return []

    const relations = item.relations || teamDraftContent(item)?.relations || []

    return relations.map((relation) => ({
        name: relation.name,
        direction: relation.direction,
        between: relation.between,
        description: relation.description,
    }))
}

export function getTeamRules(item: PackagePanelItem | PackagePrimitive) {
    if (Array.isArray(item.teamRules)) {
        return item.teamRules.filter((rule): rule is string => typeof rule === 'string' && rule.trim().length > 0)
    }
    const draft = teamDraftContent(item)
    if (Array.isArray(draft?.teamRules)) {
        return draft.teamRules.filter((rule): rule is string => typeof rule === 'string' && rule.trim().length > 0)
    }
    return []
}
