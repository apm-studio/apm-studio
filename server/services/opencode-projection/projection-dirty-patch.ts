import type { SharedPrimitiveRef } from '../../../shared/chat-contracts.js'
import { normalizeProjectionDirtyPatch, type ProjectionDirtyPatch } from '../../../shared/projection-dirty.js'

function unique(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => !!value && value.trim().length > 0)))
}

function draftIdsFromRuntimeRefs(skillRefs: SharedPrimitiveRef[] | null | undefined) {
    return unique([
        ...((skillRefs || []).map((ref) => ref.kind === 'draft' ? ref.draftId : null)),
    ])
}

export function buildProjectionDirtyPatch(input: {
    agentId?: string | null
    teamId?: string | null
    skillRefs: SharedPrimitiveRef[] | null | undefined
}): ProjectionDirtyPatch {
    return normalizeProjectionDirtyPatch({
        agentIds: unique([input.agentId]),
        teamIds: unique([input.teamId]),
        draftIds: draftIdsFromRuntimeRefs(input.skillRefs),
    })
}
