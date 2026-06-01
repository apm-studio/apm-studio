import type { SharedPrimitiveRef } from '../../../shared/chat-contracts'
import { projectionDirtyPatchHasAny } from '../../../shared/projection-dirty'
import type { StudioState } from '../types'

type GetState = () => StudioState

export type PreparedRuntimeResult = {
    appliedReload: boolean
    requiresDispose: boolean
    blocked: boolean
    reason: 'runtime_reload' | null
}

function collectDraftIds(skillRefs: SharedPrimitiveRef[] | null | undefined) {
    const ids = new Set<string>()
    for (const ref of skillRefs || []) {
        if (ref.kind === 'draft') {
            ids.add(ref.draftId)
        }
    }
    return Array.from(ids)
}

export function collectRuntimeDraftIds(
    runtimeConfig: {
        skillRefs: SharedPrimitiveRef[]
    },
) {
    return collectDraftIds(runtimeConfig.skillRefs)
}

function projectionDirtyAffectsTarget(
    state: Pick<StudioState, 'projectionDirty'>,
    options: {
        agentId?: string | null
        teamId?: string | null
        runtimeConfig: {
            skillRefs: SharedPrimitiveRef[]
        }
    },
) {
    if (state.projectionDirty.workspaceWide) {
        return true
    }
    if (options.agentId && state.projectionDirty.agentIds.includes(options.agentId)) {
        return true
    }
    if (options.teamId && state.projectionDirty.teamIds.includes(options.teamId)) {
        return true
    }
    const runtimeDraftIds = collectRuntimeDraftIds(options.runtimeConfig)
    return runtimeDraftIds.some((draftId) => state.projectionDirty.draftIds.includes(draftId))
}

export async function preparePendingRuntimeExecution(
    get: GetState,
    options: {
        agentId?: string | null
        teamId?: string | null
        runtimeConfig: {
            skillRefs: SharedPrimitiveRef[]
        }
    },
): Promise<PreparedRuntimeResult> {
    let appliedReload = false

    if (get().runtimeReloadPending) {
        appliedReload = await get().applyPendingRuntimeReload()
        if (!appliedReload && get().runtimeReloadPending) {
            return {
                appliedReload,
                requiresDispose: false,
                blocked: true,
                reason: 'runtime_reload',
            }
        }
    }

    const state = get()
    const requiresDispose = projectionDirtyAffectsTarget(state, options)
    const hasAnyProjectionDirty = projectionDirtyPatchHasAny(state.projectionDirty)

    if (hasAnyProjectionDirty && state.workspaceDirty) {
        await state.saveWorkspace()
    }

    return {
        appliedReload,
        requiresDispose,
        blocked: false,
        reason: null,
    }
}
