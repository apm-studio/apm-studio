import type {
    AssistantAction,
    AssistantStudioNodeType,
} from '../../../shared/assistant-actions'
import type { StudioState } from '../../store/types'
import { store, type AssistantRefState } from './assistant-action-state'

function normalizeName(value: string | null | undefined) {
    return value?.trim().toLowerCase() || null
}

export function resolveAgentId(
    refs: AssistantRefState,
    options: { agentId?: string; agentRef?: string; agentName?: string },
): string | null {
    const s = store()
    if (options.agentId && s.agents.some((p) => p.id === options.agentId)) {
        return options.agentId
    }
    if (options.agentRef) {
        return refs.agents.get(options.agentRef) || null
    }
    if (options.agentName) {
        const target = normalizeName(options.agentName)
        return s.agents.find((p) => normalizeName(p.name) === target)?.id || null
    }
    return null
}

export function resolveTeamId(
    refs: AssistantRefState,
    options: { teamId?: string; teamRef?: string; teamName?: string },
): string | null {
    const s = store()
    if (options.teamId && s.teams.some((a) => a.id === options.teamId)) {
        return options.teamId
    }
    if (options.teamRef) {
        return refs.teams.get(options.teamRef) || null
    }
    if (options.teamName) {
        const target = normalizeName(options.teamName)
        return s.teams.find((a) => normalizeName(a.name) === target)?.id || null
    }
    return null
}

export function resolveDraftId(
    refs: AssistantRefState,
    kind: 'instruction' | 'skill',
    options: { draftId?: string; draftRef?: string; draftName?: string },
    flags?: { savedOnly?: boolean },
): string | null {
    const requireSaved = flags?.savedOnly === true
    const stateDrafts = store().drafts
    const isAllowed = (draftId: string | undefined | null) => {
        if (!draftId) return false
        const draft = stateDrafts[draftId]
        if (!draft || draft.kind !== kind) return false
        if (requireSaved && draft.saveState !== 'saved') return false
        return true
    }

    if (options.draftId) {
        return isAllowed(options.draftId) ? options.draftId : null
    }
    if (options.draftRef) {
        const resolved = refs.drafts.get(options.draftRef)
        return (resolved?.kind === kind && isAllowed(resolved.id) ? resolved.id : null) || null
    }
    if (options.draftName) {
        const s = store()
        const target = normalizeName(options.draftName)
        const found = Object.values(s.drafts).find(
            (d) => d.kind === kind && (!requireSaved || d.saveState === 'saved') && normalizeName(d.name) === target,
        )
        return found?.id || null
    }
    return null
}

export function resolveSavedDraftId(
    refs: AssistantRefState,
    kind: 'instruction' | 'skill',
    options: { draftId?: string; draftRef?: string; draftName?: string },
) {
    return resolveDraftId(refs, kind, options, { savedOnly: true })
}

export function resolveAnyDraftId(
    refs: AssistantRefState,
    options: { draftId?: string; draftRef?: string; draftName?: string; kind?: 'instruction' | 'skill' },
): string | null {
    if (options.kind) {
        return resolveDraftId(refs, options.kind, options)
    }

    const stateDrafts = store().drafts
    if (options.draftId) {
        const draft = stateDrafts[options.draftId]
        return draft?.kind === 'instruction' || draft?.kind === 'skill' ? options.draftId : null
    }
    if (options.draftRef) {
        const resolved = refs.drafts.get(options.draftRef)
        return resolved?.id || null
    }
    if (options.draftName) {
        const target = normalizeName(options.draftName)
        const found = Object.values(stateDrafts).find(
            (draft) => (draft.kind === 'instruction' || draft.kind === 'skill') && normalizeName(draft.name) === target,
        )
        return found?.id || null
    }

    return null
}

export function resolveStudioNodeId(
    refs: AssistantRefState,
    nodeType: AssistantStudioNodeType,
    options: {
        agentId?: string
        agentRef?: string
        agentName?: string
        teamId?: string
        teamRef?: string
        teamName?: string
    },
) {
    return nodeType === 'agent'
        ? resolveAgentId(refs, options)
        : resolveTeamId(refs, options)
}

export function getTeamById(teamId: string) {
    return store().teams.find((team) => team.id === teamId) || null
}

export function hasRelation(teamId: string, relationId: string) {
    return !!getTeamById(teamId)?.relations.some((relation) => relation.id === relationId)
}

function bindingMatchesAgent(agentId: string, binding: StudioState['teams'][number]['participants'][string]) {
    const agent = store().agents.find((entry) => entry.id === agentId)
    if (!agent) return false

    return (
        (binding.agentRef.kind === 'draft' && (
            agent.meta?.derivedFrom === binding.agentRef.draftId
            || agentId === binding.agentRef.draftId
        ))
        || (binding.agentRef.kind === 'registry' && agent.meta?.derivedFrom === binding.agentRef.urn)
    )
}

export function resolveBoundParticipantKey(
    refs: AssistantRefState,
    teamId: string,
    options: {
        participantKey?: string
        agentId?: string
        agentRef?: string
        agentName?: string
    },
): string | null {
    const team = getTeamById(teamId)
    if (!team) return null
    if (options.participantKey && team.participants[options.participantKey]) {
        return options.participantKey
    }

    const agentId = resolveAgentId(refs, options)
    if (!agentId) return null

    const matchedKey = Object.keys(team.participants).find((key) =>
        bindingMatchesAgent(agentId, team.participants[key]),
    )
    if (matchedKey) {
        return matchedKey
    }

    const agentName = store().agents.find((agent) => agent.id === agentId)?.name
    if (agentName && team.participants[agentName]) {
        return agentName
    }

    return null
}

export function resolveParticipantKey(
    refs: AssistantRefState,
    teamId: string,
    options: {
        participantKey?: string
        agentId?: string
        agentRef?: string
        agentName?: string
    },
    attachIfMissing = true,
): string | null {
    const s = store()
    const team = s.teams.find((a) => a.id === teamId)
    if (!team) return null
    const existing = resolveBoundParticipantKey(refs, teamId, options)
    if (existing) return existing
    if (!attachIfMissing) return null
    const agentId = resolveAgentId(refs, options)
    if (!agentId) return null
    return s.attachAgentToTeam(teamId, agentId)
}

export function resolveTeamParticipantAgentIds(
    refs: AssistantRefState,
    action: Extract<AssistantAction, { type: 'createTeam' }>,
) {
    const agentIds: string[] = []
    for (const agentId of action.participantAgentIds || []) {
        if (store().agents.some((agent) => agent.id === agentId)) {
            agentIds.push(agentId)
        }
    }
    for (const agentRef of action.participantAgentRefs || []) {
        const agentId = refs.agents.get(agentRef)
        if (agentId) {
            agentIds.push(agentId)
        }
    }
    for (const agentName of action.participantAgentNames || []) {
        const agentId = resolveAgentId(refs, { agentName })
        if (agentId) {
            agentIds.push(agentId)
        }
    }

    return Array.from(new Set(agentIds))
}
