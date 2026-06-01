import type { SharedPrimitiveRef } from '../../../shared/chat-contracts'

export type RuntimeChangeClass = 'hot' | 'lazy_projection' | 'runtime_reload'

export interface ProjectionDirtyState {
    agentIds: string[]
    teamIds: string[]
    draftIds: string[]
    workspaceWide: boolean
}

export type StudioChangeDescriptor =
    | {
        kind: 'ui'
    }
    | {
        kind: 'agent'
        agentIds?: string[]
        draftIds?: string[]
        workspaceWide?: boolean
    }
    | {
        kind: 'team'
        teamIds?: string[]
        agentIds?: string[]
        draftIds?: string[]
        workspaceWide?: boolean
    }
    | {
        kind: 'draft'
        draftIds?: string[]
        agentIds?: string[]
        teamIds?: string[]
        workspaceWide?: boolean
    }
    | {
        kind: 'runtime_config'
    }

function unique(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => !!value && value.trim().length > 0)))
}

export function createEmptyProjectionDirtyState(): ProjectionDirtyState {
    return {
        agentIds: [],
        teamIds: [],
        draftIds: [],
        workspaceWide: false,
    }
}

export function classifyStudioChange(change: StudioChangeDescriptor): RuntimeChangeClass {
    switch (change.kind) {
        case 'ui':
            return 'hot'
        case 'runtime_config':
            return 'runtime_reload'
        case 'agent':
        case 'team':
        case 'draft':
            return 'lazy_projection'
    }
}

export function isRuntimeAffectingChange(change: StudioChangeDescriptor) {
    return classifyStudioChange(change) !== 'hot'
}

export function mergeProjectionDirtyState(
    current: ProjectionDirtyState,
    change: Extract<StudioChangeDescriptor, { kind: 'agent' | 'team' | 'draft' }>,
): ProjectionDirtyState {
    const teamIds = 'teamIds' in change ? change.teamIds : undefined
    const agentIds = 'agentIds' in change ? change.agentIds : undefined
    const draftIds = 'draftIds' in change ? change.draftIds : undefined
    return {
        agentIds: unique([...current.agentIds, ...(agentIds || [])]),
        teamIds: unique([...current.teamIds, ...(teamIds || [])]),
        draftIds: unique([...current.draftIds, ...(draftIds || [])]),
        workspaceWide: current.workspaceWide || change.workspaceWide === true,
    }
}

export function clearProjectionDirtyState(
    current: ProjectionDirtyState,
    patch?: Partial<ProjectionDirtyState> | null,
): ProjectionDirtyState {
    if (!patch) {
        return createEmptyProjectionDirtyState()
    }

    const agentIds = new Set(patch.agentIds || [])
    const teamIds = new Set(patch.teamIds || [])
    const draftIds = new Set(patch.draftIds || [])

    return {
        agentIds: current.agentIds.filter((id) => !agentIds.has(id)),
        teamIds: current.teamIds.filter((id) => !teamIds.has(id)),
        draftIds: current.draftIds.filter((id) => !draftIds.has(id)),
        workspaceWide: patch.workspaceWide ? false : current.workspaceWide,
    }
}

export function projectionDirtyHasAny(state: ProjectionDirtyState) {
    return state.workspaceWide
        || state.agentIds.length > 0
        || state.teamIds.length > 0
        || state.draftIds.length > 0
}

export function draftIdsFromPrimitiveRefs(refs: SharedPrimitiveRef[] | null | undefined) {
    return unique((refs || []).map((ref) => ref.kind === 'draft' ? ref.draftId : null))
}

export function draftIdsFromRuntimeRefs(skillRefs: SharedPrimitiveRef[] | null | undefined) {
    return draftIdsFromPrimitiveRefs(skillRefs)
}
