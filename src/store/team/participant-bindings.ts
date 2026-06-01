import { nanoid } from 'nanoid'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts'
import type { ParticipantSubscriptions } from '../../../shared/team-types'
import type { WorkspaceAgentNode, WorkspaceTeamParticipantBinding, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import {
    AGENT_DEFAULT_HEIGHT,
    AGENT_DEFAULT_WIDTH,
} from '../../lib/agents'
import { primitiveUrnDisplayName } from '../../lib/primitive-urn'
import { resolveAgentFromTeamBinding } from '../../lib/team-participants'

export function createTeamParticipantKey() {
    return `participant-${nanoid(8)}`
}

export function resolveBindingDisplayName(binding: WorkspaceTeamParticipantBinding | null | undefined, fallbackKey: string) {
    return binding?.displayName?.trim() || fallbackKey
}

export function mapParticipantDisplayNames(team: WorkspaceTeamSnapshot) {
    return Object.fromEntries(
        Object.entries(team.participants).map(([key, binding]) => [key, resolveBindingDisplayName(binding, key)]),
    )
}

export function normalizeSubscriptions(subscriptions: ParticipantSubscriptions | null | undefined): ParticipantSubscriptions | undefined {
    if (!subscriptions) return undefined
    const callboardKeys = Array.isArray(subscriptions.callboardKeys) ? subscriptions.callboardKeys : undefined
    return {
        ...subscriptions,
        ...(callboardKeys ? { callboardKeys } : {}),
    }
}

export function fallbackParticipantLabel(agentRef: WorkspaceTeamParticipantBinding['agentRef']) {
    if (agentRef.kind === 'draft') {
        return agentRef.draftId
    }
    return primitiveUrnDisplayName(agentRef.urn)
}

export function sameTeamParticipantRef(left: SharedPrimitiveRef, right: SharedPrimitiveRef) {
    return (left.kind === 'draft' && right.kind === 'draft' && left.draftId === right.draftId)
        || (left.kind === 'registry' && right.kind === 'registry' && left.urn === right.urn)
}

export function agentNodeToTeamRef(agent: WorkspaceAgentNode): SharedPrimitiveRef {
    const derivedFrom = agent.meta?.derivedFrom?.trim()
    if (!derivedFrom) {
        return { kind: 'draft', draftId: agent.id }
    }
    if (derivedFrom.startsWith('draft:')) {
        return { kind: 'draft', draftId: derivedFrom.slice('draft:'.length) }
    }
    return { kind: 'registry', urn: derivedFrom }
}

export function resolveTeamParticipantName(
    agents: WorkspaceAgentNode[],
    binding: WorkspaceTeamParticipantBinding | null | undefined,
    fallbackKey: string,
) {
    const agent = resolveAgentFromTeamBinding(agents, binding)
    return agent?.name || resolveBindingDisplayName(binding, fallbackKey)
}

export function findExistingParticipantKey(
    team: WorkspaceTeamSnapshot,
    agentRef: SharedPrimitiveRef,
) {
    const existing = Object.entries(team.participants).find(([, binding]) => sameTeamParticipantRef(binding.agentRef, agentRef))
    return existing?.[0] || null
}

export function createTeamParticipantBinding(params: {
    team: WorkspaceTeamSnapshot
    agents: WorkspaceAgentNode[]
    agentRef: SharedPrimitiveRef
}) {
    const { team, agents, agentRef } = params
    const participantCount = Object.keys(team.participants).length
    const displayName = agentRef.kind === 'registry'
        ? agents.find((agent) => agent.meta?.derivedFrom === agentRef.urn)?.name
            || primitiveUrnDisplayName(agentRef.urn)
            || `Participant ${participantCount + 1}`
        : agents.find((agent) => agent.id === agentRef.draftId)?.name
            || `Participant ${participantCount + 1}`

    return {
        key: createTeamParticipantKey(),
        binding: {
            agentRef,
            displayName,
            position: { x: participantCount * 300, y: 100 },
        } satisfies WorkspaceTeamParticipantBinding,
    }
}

export function autoLayoutBindings(bindings: Record<string, WorkspaceTeamParticipantBinding>) {
    const entries = Object.entries(bindings)
    if (entries.length === 0) return bindings

    const columns = entries.length <= 3 ? entries.length : Math.min(3, Math.ceil(Math.sqrt(entries.length)))
    const gapX = 260
    const gapY = 180

    return Object.fromEntries(entries.map(([key, binding], index) => {
        const col = index % columns
        const row = Math.floor(index / columns)
        return [key, {
            ...binding,
            position: {
                x: 40 + col * gapX,
                y: 120 + row * gapY,
            },
        }]
    }))
}

export function buildHiddenRegistryAgentPlaceholder(input: {
    id: string
    name: string
    urn: string
    position: { x: number; y: number }
    description: string
}) {
    return {
        id: input.id,
        name: input.name,
        position: input.position,
        width: AGENT_DEFAULT_WIDTH,
        height: AGENT_DEFAULT_HEIGHT,
        scope: 'shared' as const,
        model: null,
        skillRefs: [],
        mcpServerNames: [],
        mcpBindingMap: {},
        declaredMcpConfig: null,
        hidden: true,
        meta: {
            derivedFrom: input.urn,
            authoring: {
                description: input.description,
            },
        },
    }
}
