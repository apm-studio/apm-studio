import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
// Cascade cleanup utilities for primitive deletion (draft, package primitive, and canvas agent).
// Pure functions that compute state patches for orphan-reference cleanup.

import type { SharedPrimitiveRef } from '../../../shared/chat-contracts'

/** Deletion target: either a draft by id or a package primitive by URN. */
export type DeleteTarget =
    | { kind: 'draft'; draftId: string }
    | { kind: 'registry'; urn: string }

/** Check if a SharedPrimitiveRef points to the deletion target. */
function matchesDeleteTarget(ref: SharedPrimitiveRef, target: DeleteTarget): boolean {
    if (target.kind === 'draft') {
        return ref.kind === 'draft' && ref.draftId === target.draftId
    }
    return ref.kind === 'registry' && ref.urn === target.urn
}

/** Remove participant keys matching a predicate from a Team, along with related relations. */
function removeTeamParticipants(
    team: WorkspaceTeamSnapshot,
    shouldRemove: (key: string, binding: WorkspaceTeamSnapshot['participants'][string]) => boolean,
): WorkspaceTeamSnapshot {
    const removedKeys: string[] = []
    for (const [key, binding] of Object.entries(team.participants)) {
        if (shouldRemove(key, binding)) removedKeys.push(key)
    }
    if (removedKeys.length === 0) return team

    const participants = { ...team.participants }
    for (const key of removedKeys) delete participants[key]
    const removedSet = new Set(removedKeys)
    const relations = team.relations.filter(
        (r) => !r.between.some((k) => removedSet.has(k)),
    )
    return { ...team, participants, relations }
}

/**
 * Build a state patch that cleans up orphan references after a primitive is deleted.
 * Unified handler for both draft and package primitives.
 */
export function buildPrimitiveDeleteCascade(
    primitiveKind: string,
    target: DeleteTarget,
    agents: WorkspaceAgentNode[],
    teams: WorkspaceTeamSnapshot[],
): { agents?: WorkspaceAgentNode[]; teams?: WorkspaceTeamSnapshot[]; workspaceDirty?: boolean } {
    if (primitiveKind === 'instruction') {
        const updated = agents.map((p) =>
            p.instructionRef && matchesDeleteTarget(p.instructionRef, target)
                ? { ...p, instructionRef: null }
                : p,
        )
        if (updated.some((p, i) => p !== agents[i])) {
            return { agents: updated, workspaceDirty: true }
        }
        return {}
    }

    if (primitiveKind === 'skill') {
        const updated = agents.map((p) => {
            const filtered = p.skillRefs.filter(
                (ref) => !matchesDeleteTarget(ref, target),
            )
            return filtered.length !== p.skillRefs.length
                ? { ...p, skillRefs: filtered }
                : p
        })
        if (updated.some((p, i) => p !== agents[i])) {
            return { agents: updated, workspaceDirty: true }
        }
        return {}
    }

    if (primitiveKind === 'agent') {
        const updated = teams.map((team) =>
            removeTeamParticipants(team, (_key, binding) =>
                matchesDeleteTarget(binding.agentRef, target),
            ),
        )
        if (updated.some((a, i) => a !== teams[i])) {
            return { teams: updated, workspaceDirty: true }
        }
        return {}
    }

    // kind === 'team' -> no cascade needed (team primitives are independent copies)
    return {}
}

/**
 * Convenience wrapper for draft deletion.
 * Delegates to buildPrimitiveDeleteCascade with a draft target.
 */
export function buildDraftDeleteCascade(
    kind: string,
    draftId: string,
    agents: WorkspaceAgentNode[],
    teams: WorkspaceTeamSnapshot[],
) {
    return buildPrimitiveDeleteCascade(kind, { kind: 'draft', draftId }, agents, teams)
}

/**
 * Convenience wrapper for package primitive removal.
 * Delegates to buildPrimitiveDeleteCascade with a registry target.
 */
export function buildPackagePrimitiveDeleteCascade(
    primitiveKind: string,
    urn: string,
    agents: WorkspaceAgentNode[],
    teams: WorkspaceTeamSnapshot[],
) {
    return buildPrimitiveDeleteCascade(primitiveKind, { kind: 'registry', urn }, agents, teams)
}

/**
 * Build a state patch that cleans up Team references after a canvas agent is deleted.
 * Team participant refs can point to either the live agent id or a linked draft id.
 */
export function buildAgentDeleteCascade(
    agent: Pick<WorkspaceAgentNode, 'id' | 'meta'>,
    teams: WorkspaceTeamSnapshot[],
): { teams?: WorkspaceTeamSnapshot[]; workspaceDirty?: boolean } {
    const draftIds = new Set<string>([agent.id])
    const derivedFrom = agent.meta?.derivedFrom?.trim()
    if (derivedFrom?.startsWith('draft:')) {
        draftIds.add(derivedFrom.slice('draft:'.length))
    }

    const updated = teams.map((team) =>
        removeTeamParticipants(team, (_key, binding) =>
            binding.agentRef.kind === 'draft' && draftIds.has(binding.agentRef.draftId),
        ),
    )
    if (updated.some((a, i) => a !== teams[i])) {
        return { teams: updated, workspaceDirty: true }
    }
    return {}
}
