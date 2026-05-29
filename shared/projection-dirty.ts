export interface ProjectionDirtyPatch {
    agentIds?: string[]
    teamIds?: string[]
    draftIds?: string[]
    workspaceWide?: boolean
}

function unique(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => !!value && value.trim().length > 0)))
}

export function normalizeProjectionDirtyPatch(
    patch?: ProjectionDirtyPatch | null,
): ProjectionDirtyPatch {
    if (!patch) {
        return {}
    }

    const agentIds = unique(patch.agentIds || [])
    const teamIds = unique(patch.teamIds || [])
    const draftIds = unique(patch.draftIds || [])

    return {
        ...(agentIds.length > 0 ? { agentIds } : {}),
        ...(teamIds.length > 0 ? { teamIds } : {}),
        ...(draftIds.length > 0 ? { draftIds } : {}),
        ...(patch.workspaceWide === true ? { workspaceWide: true } : {}),
    }
}

export function mergeProjectionDirtyPatches(
    ...patches: Array<ProjectionDirtyPatch | null | undefined>
): ProjectionDirtyPatch {
    return normalizeProjectionDirtyPatch({
        agentIds: patches.flatMap((patch) => patch?.agentIds || []),
        teamIds: patches.flatMap((patch) => patch?.teamIds || []),
        draftIds: patches.flatMap((patch) => patch?.draftIds || []),
        workspaceWide: patches.some((patch) => patch?.workspaceWide === true),
    })
}

export function projectionDirtyPatchHasAny(
    patch?: ProjectionDirtyPatch | null,
) {
    const normalized = normalizeProjectionDirtyPatch(patch)
    return normalized.workspaceWide === true
        || (normalized.agentIds?.length || 0) > 0
        || (normalized.teamIds?.length || 0) > 0
        || (normalized.draftIds?.length || 0) > 0
}
