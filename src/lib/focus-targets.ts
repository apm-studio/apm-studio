import type {
    FocusSnapshot,
    FullscreenNodeType,
    SplitViewState,
    WorkspaceViewMode,
} from '../store/workspace/types'

export function resolveFocusTarget(focusSnapshot: FocusSnapshot | null) {
    if (!focusSnapshot) {
        return null
    }

    return {
        id: focusSnapshot.nodeId,
        type: focusSnapshot.type,
    }
}

export function isSplitViewTarget(
    viewMode: WorkspaceViewMode,
    splitView: SplitViewState,
    nodeId: string,
    nodeType: FullscreenNodeType,
) {
    return viewMode === 'split'
        && splitView.panes.some((pane) => pane.nodeId === nodeId && pane.type === nodeType)
}

function toggleHiddenId(ids: string[], id: string, hidden: boolean) {
    if (hidden) {
        return ids.includes(id) ? ids : [...ids, id]
    }

    return ids.filter((entryId) => entryId !== id)
}

export function resolveNodeBaselineHidden(
    focusSnapshot: FocusSnapshot | null,
    nodeId: string,
    nodeType: FullscreenNodeType,
    fallbackHidden: boolean,
) {
    if (!focusSnapshot) {
        return fallbackHidden
    }

    const hiddenIds = nodeType === 'agent'
        ? focusSnapshot.hiddenAgentIds
        : focusSnapshot.hiddenTeamIds

    return hiddenIds.includes(nodeId)
}

export function setFocusSnapshotNodeHidden(
    focusSnapshot: FocusSnapshot | null,
    nodeId: string,
    nodeType: FullscreenNodeType,
    hidden: boolean,
) {
    if (!focusSnapshot) {
        return null
    }

    if (nodeType === 'agent') {
        return {
            ...focusSnapshot,
            hiddenAgentIds: toggleHiddenId(focusSnapshot.hiddenAgentIds, nodeId, hidden),
        }
    }

    return {
        ...focusSnapshot,
        hiddenTeamIds: toggleHiddenId(focusSnapshot.hiddenTeamIds, nodeId, hidden),
    }
}

export function resolveFocusNodeId(
    focusSnapshot: FocusSnapshot | null,
) {
    return resolveFocusTarget(focusSnapshot)?.id || null
}

export function isFocusTarget(
    focusSnapshot: FocusSnapshot | null,
    nodeId: string,
    nodeType: FullscreenNodeType,
) {
    const target = resolveFocusTarget(focusSnapshot)
    return target?.id === nodeId && target.type === nodeType
}
