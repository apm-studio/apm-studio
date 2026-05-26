import { api, setApiWorkingDirContext } from '../api'
import { resolveActExpandedHeight } from '../lib/act-layout'
import {
    clampSplitViewColumns,
    createEmptySplitViewState,
    createSplitViewPane,
    DEFAULT_SPLIT_VIEW_COLUMNS,
    getCanvasViewportSize,
    normalizeSplitViewSizing,
    normalizeSplitWeights,
    resolveFocusTarget,
    resolveSplitPaneRects,
    resolveSplitViewRows,
    SPLIT_VIEW_GAP,
    SPLIT_VIEW_MAX_PANES,
    SPLIT_VIEW_MIN_PANE_HEIGHT,
    SPLIT_VIEW_MIN_PANE_WIDTH,
} from '../lib/focus-utils'
import { normalizePath, mapCanvasTerminals, resolveCanvasSpawnPosition } from './workspace-helpers'
import type {
    FocusSnapshot,
    FullscreenNodeRect,
    FullscreenNodeType,
    SplitViewPane,
    SplitViewPlacement,
    SplitViewState,
    StudioState,
} from './types'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState
type FocusNodeType = FullscreenNodeType
type FocusTarget = { id: string; type: FocusNodeType }
type ViewportSize = { width: number; height: number }
type SplitViewStateInput = Pick<SplitViewState, 'panes' | 'activePaneId'> & Partial<Omit<SplitViewState, 'panes' | 'activePaneId'>>
const FOCUS_WINDOW_ORIGIN = { x: 0, y: 0 } as const

export function buildCanvasViewResetState(
    splitView: SplitViewState = createEmptySplitViewState(),
): Pick<StudioState, 'viewMode' | 'splitView' | 'focusSnapshot'> {
    return {
        viewMode: 'canvas',
        splitView,
        focusSnapshot: null,
    }
}

function resolveCanvasResetSplitView(state: StudioState): SplitViewState {
    return state.splitView?.panes.length
        ? state.splitView
        : createEmptySplitViewState()
}

function resolveFocusNodeSize(state: StudioState, target: FocusTarget) {
    if (target.type === 'performer') {
        const performer = state.performers.find((entry) => entry.id === target.id)
        return performer
            ? { width: performer.width ?? 400, height: performer.height ?? 500 }
            : null
    }

    const act = state.acts.find((entry) => entry.id === target.id)
    return act
        ? { width: act.width ?? 400, height: resolveActExpandedHeight(act.height) }
        : null
}

function resolveFocusNodePosition(state: StudioState, target: FocusTarget) {
    if (target.type === 'performer') {
        return state.performers.find((entry) => entry.id === target.id)?.position || null
    }

    return state.acts.find((entry) => entry.id === target.id)?.position || null
}

function buildSnapshotNodeRects(state: StudioState): FullscreenNodeRect[] {
    return [
        ...state.performers.map((performer) => ({
            nodeId: performer.id,
            type: 'performer' as const,
            nodePosition: performer.position,
            nodeSize: {
                width: performer.width ?? 400,
                height: performer.height ?? 500,
            },
        })),
        ...state.acts.map((act) => ({
            nodeId: act.id,
            type: 'act' as const,
            nodePosition: act.position,
            nodeSize: {
                width: act.width ?? 400,
                height: resolveActExpandedHeight(act.height),
            },
        })),
    ]
}

function buildFocusSnapshot(state: StudioState, target: FocusTarget): FocusSnapshot | null {
    const nodeSize = resolveFocusNodeSize(state, target)
    const nodePosition = resolveFocusNodePosition(state, target)
    if (!nodeSize || !nodePosition) {
        return null
    }

    return {
        nodeId: target.id,
        type: target.type,
        ...(target.type === 'act' ? { actId: target.id } : {}),
        nodePosition,
        nodeSize,
        hiddenPerformerIds: state.performers.filter((performer) => performer.hidden).map((performer) => performer.id),
        hiddenActIds: state.acts.filter((act) => act.hidden).map((act) => act.id),
        hiddenEditorIds: state.markdownEditors.filter((editor) => editor.hidden).map((editor) => editor.id),
        hiddenTerminalIds: [] as string[],
        assetLibraryOpen: state.isAssetLibraryOpen,
        assistantOpen: state.isAssistantOpen,
        trackingOpen: state.isTrackingOpen,
        terminalOpen: state.isTerminalOpen,
        nodeRects: buildSnapshotNodeRects(state),
    }
}

function focusSnapshotRectMap(snapshot: FocusSnapshot) {
    const rects = new Map<string, FullscreenNodeRect>()
    for (const rect of snapshot.nodeRects || []) {
        rects.set(`${rect.type}:${rect.nodeId}`, rect)
    }

    const targetKey = `${snapshot.type}:${snapshot.nodeId}`
    if (!rects.has(targetKey) && snapshot.nodePosition) {
        rects.set(targetKey, {
            nodeId: snapshot.nodeId,
            type: snapshot.type,
            nodePosition: snapshot.nodePosition,
            nodeSize: snapshot.nodeSize,
        })
    }

    return rects
}

function buildEnterFocusModeState(
    state: StudioState,
    target: FocusTarget,
    viewportSize: ViewportSize,
): Partial<StudioState> | null {
    const snapshot = buildFocusSnapshot(state, target)
    if (!snapshot) {
        return null
    }

    const focusWidth = viewportSize.width
    const focusHeight = viewportSize.height

    return {
        viewMode: 'full',
        splitView: resolveCanvasResetSplitView(state),
        focusSnapshot: snapshot,
        selectedPerformerId: target.type === 'performer' ? target.id : null,
        selectedActId: target.type === 'act' ? target.id : null,
        activeChatPerformerId: target.type === 'performer' ? target.id : state.activeChatPerformerId,
        performers: state.performers.map((performer) => (
            target.type === 'performer' && performer.id === target.id
                ? { ...performer, hidden: false, position: FOCUS_WINDOW_ORIGIN, width: focusWidth, height: focusHeight }
                : { ...performer, hidden: true }
        )),
        acts: state.acts.map((act) => (
            target.type === 'act' && act.id === target.id
                ? { ...act, hidden: false, position: FOCUS_WINDOW_ORIGIN, width: focusWidth, height: focusHeight }
                : { ...act, hidden: true }
        )),
        markdownEditors: state.markdownEditors.map((editor) => ({ ...editor, hidden: true })),
        isAssetLibraryOpen: false,
        isAssistantOpen: false,
        isTrackingOpen: false,
        isTerminalOpen: false,
        editingTarget: null,
        inspectorFocus: null,
    }
}

function resolveCurrentFocusViewportSize(state: StudioState, target: FocusTarget): ViewportSize {
    if (target.type === 'performer') {
        const performer = state.performers.find((entry) => entry.id === target.id)
        return getCanvasViewportSize(
            typeof document !== 'undefined' ? document : undefined,
            {
                width: performer?.width || 800,
                height: performer?.height || 600,
            },
        )
    }

    const act = state.acts.find((entry) => entry.id === target.id)
    return getCanvasViewportSize(
        typeof document !== 'undefined' ? document : undefined,
        {
            width: act?.width || 800,
            height: act?.height || 600,
        },
    )
}

export function buildExitFocusModeState(state: StudioState): Partial<StudioState> | null {
    const snapshot = state.focusSnapshot
    const target = resolveFocusTarget(snapshot)
    if (!snapshot || !target) {
        return state.viewMode === 'canvas'
            ? null
            : buildCanvasViewResetState(resolveCanvasResetSplitView(state))
    }
    const rects = focusSnapshotRectMap(snapshot)

    const performerBaseline = (id: string) => rects.get(`performer:${id}`)
    const actBaseline = (id: string) => rects.get(`act:${id}`)

    return {
        ...buildCanvasViewResetState(resolveCanvasResetSplitView(state)),
        performers: state.performers.map((performer) => {
            const baseline = performerBaseline(performer.id)
            return {
                ...performer,
                ...(baseline ? {
                    position: baseline.nodePosition,
                    width: baseline.nodeSize.width,
                    height: baseline.nodeSize.height,
                } : {}),
                hidden: snapshot.hiddenPerformerIds.includes(performer.id),
            }
        }),
        acts: state.acts.map((act) => {
            const baseline = actBaseline(act.id)
            return {
                ...act,
                ...(baseline ? {
                    position: baseline.nodePosition,
                    width: baseline.nodeSize.width,
                    height: baseline.nodeSize.height,
                } : {}),
                hidden: snapshot.hiddenActIds.includes(act.id),
            }
        }),
        markdownEditors: state.markdownEditors.map((editor) => ({ ...editor, hidden: snapshot.hiddenEditorIds.includes(editor.id) })),
        isAssetLibraryOpen: snapshot.assetLibraryOpen,
        isAssistantOpen: snapshot.assistantOpen,
        isTrackingOpen: snapshot.trackingOpen,
        isTerminalOpen: snapshot.terminalOpen,
    }
}

function targetExists(state: StudioState, target: FocusTarget) {
    return target.type === 'performer'
        ? state.performers.some((entry) => entry.id === target.id)
        : state.acts.some((entry) => entry.id === target.id)
}

function resolveSplitViewTarget(state: StudioState): FocusTarget | null {
    const activePane = state.splitView.panes.find((pane) => (
        pane.paneId === state.splitView.activePaneId
        && targetExists(state, { id: pane.nodeId, type: pane.type })
    ))
    const fallbackPane = activePane || state.splitView.panes.find((pane) => (
        targetExists(state, { id: pane.nodeId, type: pane.type })
    ))

    return fallbackPane
        ? { id: fallbackPane.nodeId, type: fallbackPane.type }
        : null
}

function resolveSelectedFullscreenTarget(state: StudioState): FocusTarget | null {
    if (state.selectedPerformerId) {
        return { id: state.selectedPerformerId, type: 'performer' }
    }

    if (state.selectedActId) {
        return { id: state.selectedActId, type: 'act' }
    }

    const firstVisibleAct = state.acts.find((act) => !act.hidden)
    if (firstVisibleAct) {
        return { id: firstVisibleAct.id, type: 'act' }
    }

    const firstVisiblePerformer = state.performers.find((performer) => !performer.hidden)
    return firstVisiblePerformer
        ? { id: firstVisiblePerformer.id, type: 'performer' }
        : null
}

function sanitizeSplitViewPanes(state: StudioState, panes: SplitViewPane[]) {
    const seen = new Set<string>()
    const next: SplitViewPane[] = []

    for (const pane of panes) {
        const key = `${pane.type}:${pane.nodeId}`
        if (seen.has(key) || !targetExists(state, { id: pane.nodeId, type: pane.type })) {
            continue
        }
        seen.add(key)
        next.push(pane)
        if (next.length >= SPLIT_VIEW_MAX_PANES) {
            break
        }
    }

    return next
}

function normalizeSplitViewState(state: StudioState, splitView: SplitViewStateInput): SplitViewState {
    const panes = sanitizeSplitViewPanes(state, splitView.panes)
    const rows = resolveSplitViewRows(panes, splitView.rows || splitView.columns)
    const sizing = normalizeSplitViewSizing(rows, {
        rowWeights: splitView.rowWeights,
        columnWeights: splitView.columnWeights,
    })
    const paneById = new Map(panes.map((pane) => [pane.paneId, pane]))
    const orderedPanes = rows
        .flat()
        .map((paneId) => paneById.get(paneId))
        .filter((pane): pane is SplitViewPane => Boolean(pane))
    const activePaneId = panes.some((pane) => pane.paneId === splitView.activePaneId)
        ? splitView.activePaneId
        : orderedPanes[0]?.paneId || null

    return {
        panes: orderedPanes,
        activePaneId,
        rows,
        rowWeights: sizing.rowWeights,
        columnWeights: sizing.columnWeights,
        columns: clampSplitViewColumns(Math.max(1, ...rows.map((row) => row.length), splitView.columns ?? DEFAULT_SPLIT_VIEW_COLUMNS)),
    }
}

export function buildSplitViewLayoutState(
    state: StudioState,
    requestedSplitView: SplitViewState,
    viewportSize: ViewportSize,
): Partial<StudioState> {
    const splitView = normalizeSplitViewState(state, requestedSplitView)
    const paneRects = resolveSplitPaneRects(splitView.panes, viewportSize, splitView.rows, splitView)
    const paneRectByKey = new Map(paneRects.map((rect) => [`${rect.type}:${rect.nodeId}`, rect]))
    const activePane = splitView.panes.find((pane) => pane.paneId === splitView.activePaneId) || splitView.panes[0] || null

    return {
        viewMode: 'split',
        splitView,
        selectedPerformerId: activePane?.type === 'performer' ? activePane.nodeId : null,
        selectedActId: activePane?.type === 'act' ? activePane.nodeId : null,
        activeChatPerformerId: activePane?.type === 'performer' ? activePane.nodeId : state.activeChatPerformerId,
        performers: state.performers.map((performer) => {
            const rect = paneRectByKey.get(`performer:${performer.id}`)
            return rect
                ? { ...performer, hidden: false, position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height }
                : { ...performer, hidden: true }
        }),
        acts: state.acts.map((act) => {
            const rect = paneRectByKey.get(`act:${act.id}`)
            return rect
                ? { ...act, hidden: false, position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height }
                : { ...act, hidden: true }
        }),
        markdownEditors: state.markdownEditors.map((editor) => ({ ...editor, hidden: true })),
        isAssetLibraryOpen: false,
        isAssistantOpen: false,
        isTrackingOpen: false,
        isTerminalOpen: false,
        editingTarget: null,
        inspectorFocus: null,
    }
}

export function buildSyncFullscreenViewportState(
    state: StudioState,
    viewportSize: ViewportSize,
): Partial<StudioState> | null {
    if (state.viewMode === 'split') {
        return buildSplitViewLayoutState(state, state.splitView, viewportSize)
    }

    const target = resolveFocusTarget(state.focusSnapshot)
    if (!target) {
        return null
    }

    if (target.type === 'performer') {
        const performer = state.performers.find((entry) => entry.id === target.id)
        if (!performer) {
            return null
        }

        const isLayoutStable = performer.position.x === 0
            && performer.position.y === 0
            && performer.width === viewportSize.width
            && performer.height === viewportSize.height
            && performer.hidden === false

        if (isLayoutStable) {
            return null
        }

        return {
            performers: state.performers.map((entry) => (
                entry.id === target.id
                    ? {
                        ...entry,
                        hidden: false,
                        position: FOCUS_WINDOW_ORIGIN,
                        width: viewportSize.width,
                        height: viewportSize.height,
                    }
                    : entry
            )),
        }
    }

    const act = state.acts.find((entry) => entry.id === target.id)
    if (!act) {
        return null
    }

    const isLayoutStable = act.position.x === 0
        && act.position.y === 0
        && act.width === viewportSize.width
        && act.height === viewportSize.height
        && act.hidden === false

    if (isLayoutStable) {
        return null
    }

    return {
        acts: state.acts.map((entry) => (
            entry.id === target.id
                ? {
                    ...entry,
                    hidden: false,
                    position: FOCUS_WINDOW_ORIGIN,
                    width: viewportSize.width,
                    height: viewportSize.height,
                }
                : entry
        )),
    }
}

export const buildSyncFocusViewportState = buildSyncFullscreenViewportState

function clampSplitViewInsertIndex(index: number, length: number) {
    if (!Number.isFinite(index)) {
        return length
    }

    return Math.min(length, Math.max(0, Math.round(index)))
}

function splitRowsFromPanes(panes: SplitViewPane[], rowsOrColumns: string[][] | number | undefined) {
    return resolveSplitViewRows(panes, rowsOrColumns)
}

function placementFromIndex(panes: SplitViewPane[], rows: string[][], index: number): SplitViewPlacement {
    const insertIndex = clampSplitViewInsertIndex(index, panes.length)
    if (insertIndex >= panes.length) {
        return rows.length > 0
            ? { rowIndex: rows.length - 1, columnIndex: rows[rows.length - 1].length, rowMode: 'existing' }
            : { rowIndex: 0, columnIndex: 0, rowMode: 'new' }
    }

    const paneId = panes[insertIndex]?.paneId
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const columnIndex = rows[rowIndex].indexOf(paneId)
        if (columnIndex >= 0) {
            return { rowIndex, columnIndex, rowMode: 'existing' }
        }
    }

    return { rowIndex: rows.length, columnIndex: 0, rowMode: 'new' }
}

function normalizeSplitViewPlacement(
    panes: SplitViewPane[],
    rows: string[][],
    placement: number | SplitViewPlacement,
) {
    if (typeof placement === 'number') {
        return placementFromIndex(panes, rows, placement)
    }

    const rowIndex = Math.min(
        placement.rowMode === 'new' ? rows.length : Math.max(0, rows.length - 1),
        Math.max(0, Math.round(placement.rowIndex)),
    )
    const targetRow = rows[rowIndex] || []
    const columnIndex = Math.min(targetRow.length, Math.max(0, Math.round(placement.columnIndex)))

    return {
        rowIndex,
        columnIndex,
        rowMode: placement.rowMode || 'existing',
    } satisfies SplitViewPlacement
}

function insertPaneInRows(rows: string[][], paneId: string, placement: SplitViewPlacement) {
    const nextRows = rows
        .map((row) => row.filter((entryId) => entryId !== paneId))
        .filter((row) => row.length > 0)
    const target = normalizeSplitViewPlacement([], nextRows, placement)

    if (target.rowMode === 'new' || nextRows.length === 0) {
        return [
            ...nextRows.slice(0, target.rowIndex),
            [paneId],
            ...nextRows.slice(target.rowIndex),
        ]
    }

    const targetRow = nextRows[target.rowIndex] || []
    return nextRows.map((row, rowIndex) => (
        rowIndex === target.rowIndex
            ? [
                ...targetRow.slice(0, target.columnIndex),
                paneId,
                ...targetRow.slice(target.columnIndex),
            ]
            : row
    ))
}

function insertPaneAtIndex(panes: SplitViewPane[], pane: SplitViewPane, index: number) {
    const insertIndex = clampSplitViewInsertIndex(index, panes.length)
    return [
        ...panes.slice(0, insertIndex),
        pane,
        ...panes.slice(insertIndex),
    ]
}

function movePaneToIndex(panes: SplitViewPane[], paneId: string, index: number) {
    const pane = panes.find((entry) => entry.paneId === paneId)
    if (!pane) {
        return panes
    }

    const remainingPanes = panes.filter((entry) => entry.paneId !== paneId)
    return insertPaneAtIndex(remainingPanes, pane, index)
}

export function enterFocusModeImpl(
    get: GetState,
    set: SetState,
    nodeId: string,
    nodeType: FocusNodeType,
    viewportSize: ViewportSize,
) {
    const state = get()
    if (state.focusSnapshot) {
        // Prevent corrupting the root snapshot if accidentally called again.
        return
    }
    const patch = buildEnterFocusModeState(state, { id: nodeId, type: nodeType }, viewportSize)
    if (patch) {
        set(patch)
    }
}

export function enterEmptyFullViewImpl(
    get: GetState,
    set: SetState,
) {
    const state = get()
    if (state.viewMode === 'full' && !state.focusSnapshot) {
        return
    }
    const restoredState = state.focusSnapshot
        ? buildExitFocusModeState(state) || {}
        : {}
    const restoredSplitView = resolveCanvasResetSplitView({ ...state, ...restoredState } as StudioState)

    set({
        ...restoredState,
        viewMode: 'full',
        splitView: restoredSplitView,
        focusSnapshot: null,
        selectedPerformerId: null,
        selectedActId: null,
        editingTarget: null,
        inspectorFocus: null,
    })
}

export function enterEmptySplitViewImpl(
    get: GetState,
    set: SetState,
) {
    const state = get()
    if (state.viewMode === 'split' && state.splitView.panes.length === 0 && !state.focusSnapshot) {
        return
    }
    const restoredState = state.focusSnapshot
        ? buildExitFocusModeState(state) || {}
        : {}

    set({
        ...restoredState,
        viewMode: 'split',
        splitView: createEmptySplitViewState(),
        focusSnapshot: null,
        selectedPerformerId: null,
        selectedActId: null,
        editingTarget: null,
        inspectorFocus: null,
    })
}

export function enterSplitViewImpl(
    get: GetState,
    set: SetState,
    nodeId?: string,
    nodeType?: FocusNodeType,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    const requestedTarget = nodeId && nodeType ? { id: nodeId, type: nodeType } : null
    const reusablePanes = sanitizeSplitViewPanes(state, state.splitView.panes)
    const shouldRestoreSavedSplitView = !requestedTarget && reusablePanes.length > 0
    const initialTarget = requestedTarget
        || resolveFocusTarget(state.focusSnapshot)
        || (shouldRestoreSavedSplitView ? resolveSplitViewTarget(state) : null)
        || resolveSelectedFullscreenTarget(state)

    if (!initialTarget || !targetExists(state, initialTarget)) {
        return
    }

    const snapshot = state.focusSnapshot || buildFocusSnapshot(state, initialTarget)
    if (!snapshot) {
        return
    }

    const shouldReuseSplitView = reusablePanes.length > 0 && (state.viewMode === 'split' || shouldRestoreSavedSplitView)
    const currentPanes = shouldReuseSplitView
        ? reusablePanes
        : [createSplitViewPane(initialTarget.id, initialTarget.type)]
    const activePaneId = shouldReuseSplitView && currentPanes.some((pane) => pane.paneId === state.splitView.activePaneId)
        ? state.splitView.activePaneId
        : currentPanes[0]?.paneId || null
    const splitView = normalizeSplitViewState({ ...state, focusSnapshot: snapshot } as StudioState, {
        panes: currentPanes,
        activePaneId,
        rows: shouldReuseSplitView
            ? splitRowsFromPanes(currentPanes, state.splitView.rows || state.splitView.columns)
            : [[currentPanes[0].paneId]],
        rowWeights: shouldReuseSplitView ? state.splitView.rowWeights : undefined,
        columnWeights: shouldReuseSplitView ? state.splitView.columnWeights : undefined,
        columns: state.splitView?.columns ?? DEFAULT_SPLIT_VIEW_COLUMNS,
    })

    set({
        focusSnapshot: snapshot,
        ...buildSplitViewLayoutState({ ...state, focusSnapshot: snapshot } as StudioState, splitView, viewportSize),
    })
}

export function addSplitViewPaneImpl(
    get: GetState,
    set: SetState,
    nodeId: string,
    nodeType: FocusNodeType,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    insertSplitViewPaneImpl(get, set, nodeId, nodeType, Number.POSITIVE_INFINITY, viewportSize)
}

export function insertSplitViewPaneImpl(
    get: GetState,
    set: SetState,
    nodeId: string,
    nodeType: FocusNodeType,
    placement: number | SplitViewPlacement,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    const target = { id: nodeId, type: nodeType }
    if (!targetExists(state, target)) {
        return
    }

    const seedTarget = resolveFocusTarget(state.focusSnapshot) || target
    const snapshot = state.focusSnapshot || buildFocusSnapshot(state, seedTarget)
    if (!snapshot) {
        return
    }

    const basePanes = state.viewMode === 'split'
        ? state.splitView.panes
        : (resolveFocusTarget(snapshot) ? [createSplitViewPane(seedTarget.id, seedTarget.type)] : [])
    const baseRows = splitRowsFromPanes(basePanes, state.viewMode === 'split' ? state.splitView.rows || state.splitView.columns : undefined)
    const nextPane = createSplitViewPane(nodeId, nodeType)
    const hasPane = basePanes.some((pane) => pane.paneId === nextPane.paneId)
    if (!hasPane && basePanes.length >= SPLIT_VIEW_MAX_PANES) {
        return
    }

    const normalizedPlacement = normalizeSplitViewPlacement(basePanes, baseRows, placement)
    const panes = hasPane
        ? movePaneToIndex(basePanes, nextPane.paneId, Number.POSITIVE_INFINITY)
        : insertPaneAtIndex(basePanes, nextPane, Number.POSITIVE_INFINITY)
    const rows = insertPaneInRows(baseRows, nextPane.paneId, normalizedPlacement)
    const splitView = normalizeSplitViewState({ ...state, focusSnapshot: snapshot } as StudioState, {
        panes,
        activePaneId: nextPane.paneId,
        rows,
        rowWeights: state.viewMode === 'split' ? state.splitView.rowWeights : undefined,
        columnWeights: state.viewMode === 'split' ? state.splitView.columnWeights : undefined,
        columns: state.splitView?.columns ?? DEFAULT_SPLIT_VIEW_COLUMNS,
    })

    set({
        focusSnapshot: snapshot,
        ...buildSplitViewLayoutState({ ...state, focusSnapshot: snapshot } as StudioState, splitView, viewportSize),
    })
}

export function removeSplitViewPaneImpl(
    get: GetState,
    set: SetState,
    paneId: string,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    if (state.viewMode !== 'split') {
        return
    }

    const panes = state.splitView.panes.filter((pane) => pane.paneId !== paneId)
    const rows = splitRowsFromPanes(panes, state.splitView.rows || state.splitView.columns)
    const splitView = normalizeSplitViewState(state, {
        panes,
        activePaneId: state.splitView.activePaneId === paneId ? panes[0]?.paneId || null : state.splitView.activePaneId,
        rows,
        rowWeights: state.splitView.rowWeights,
        columnWeights: state.splitView.columnWeights,
        columns: state.splitView.columns,
    })

    set(buildSplitViewLayoutState(state, splitView, viewportSize))
}

export function replaceSplitViewPaneImpl(
    get: GetState,
    set: SetState,
    paneId: string,
    nodeId: string,
    nodeType: FocusNodeType,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    const target = { id: nodeId, type: nodeType }
    if (state.viewMode !== 'split' || !targetExists(state, target)) {
        return
    }

    const currentPane = state.splitView.panes.find((pane) => pane.paneId === paneId)
    if (!currentPane) {
        return
    }

    const nextPane = createSplitViewPane(nodeId, nodeType)
    const duplicatePane = state.splitView.panes.find((pane) => pane.paneId === nextPane.paneId)
    if (duplicatePane) {
        const targetIndex = state.splitView.panes.findIndex((pane) => pane.paneId === paneId)
        moveSplitViewPaneImpl(get, set, duplicatePane.paneId, targetIndex, viewportSize)
        return
    }

    const snapshot = state.focusSnapshot || buildFocusSnapshot(state, target)
    if (!snapshot) {
        return
    }

    const panes = state.splitView.panes.map((pane) => (
        pane.paneId === paneId ? nextPane : pane
    ))
    const rows = splitRowsFromPanes(state.splitView.panes, state.splitView.rows || state.splitView.columns)
        .map((row) => row.map((entryPaneId) => entryPaneId === paneId ? nextPane.paneId : entryPaneId))
    const splitView = normalizeSplitViewState({ ...state, focusSnapshot: snapshot } as StudioState, {
        panes,
        activePaneId: nextPane.paneId,
        rows,
        rowWeights: state.splitView.rowWeights,
        columnWeights: state.splitView.columnWeights,
        columns: state.splitView.columns,
    })

    set({
        focusSnapshot: snapshot,
        ...buildSplitViewLayoutState({ ...state, focusSnapshot: snapshot } as StudioState, splitView, viewportSize),
    })
}

export function moveSplitViewPaneImpl(
    get: GetState,
    set: SetState,
    paneId: string,
    placement: number | SplitViewPlacement,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    if (state.viewMode !== 'split') {
        return
    }

    const panes = movePaneToIndex(state.splitView.panes, paneId, Number.POSITIVE_INFINITY)
    const baseRows = splitRowsFromPanes(state.splitView.panes, state.splitView.rows || state.splitView.columns)
    const rows = insertPaneInRows(baseRows, paneId, normalizeSplitViewPlacement(state.splitView.panes, baseRows, placement))
    const splitView = normalizeSplitViewState(state, {
        panes,
        activePaneId: paneId,
        rows,
        rowWeights: state.splitView.rowWeights,
        columnWeights: state.splitView.columnWeights,
        columns: state.splitView.columns,
    })

    set(buildSplitViewLayoutState(state, splitView, viewportSize))
}

export function setSplitViewActivePaneImpl(
    get: GetState,
    set: SetState,
    nodeId: string,
    nodeType: FocusNodeType,
) {
    const state = get()
    if (state.viewMode !== 'split') {
        return
    }

    const pane = state.splitView.panes.find((entry) => entry.nodeId === nodeId && entry.type === nodeType)
    if (!pane) {
        return
    }

    set({
        splitView: {
            ...state.splitView,
            activePaneId: pane.paneId,
        },
        selectedPerformerId: nodeType === 'performer' ? nodeId : null,
        selectedActId: nodeType === 'act' ? nodeId : null,
        activeChatPerformerId: nodeType === 'performer' ? nodeId : state.activeChatPerformerId,
    })
}

function resolveSplitResizeMinSize(availableSize: number, trackCount: number, preferredMinSize: number) {
    if (trackCount <= 1) {
        return 1
    }

    const evenTrackSize = availableSize / trackCount
    return Math.max(40, Math.min(preferredMinSize, evenTrackSize * 0.75))
}

function resizeAdjacentWeights(
    weights: number[],
    boundaryIndex: number,
    deltaPx: number,
    totalSize: number,
    preferredMinSize: number,
) {
    const count = weights.length
    if (count < 2 || boundaryIndex < 0 || boundaryIndex >= count - 1 || !Number.isFinite(deltaPx)) {
        return weights
    }

    const availableSize = Math.max(1, totalSize - Math.max(0, count - 1) * SPLIT_VIEW_GAP)
    const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0.0001, weight), 0)
    const trackSizes = weights.map((weight) => (Math.max(0.0001, weight) / totalWeight) * availableSize)
    const pairSize = trackSizes[boundaryIndex] + trackSizes[boundaryIndex + 1]
    const minSize = Math.min(resolveSplitResizeMinSize(availableSize, count, preferredMinSize), pairSize / 2)
    const firstSize = Math.min(pairSize - minSize, Math.max(minSize, trackSizes[boundaryIndex] + deltaPx))
    const secondSize = pairSize - firstSize
    const nextTrackSizes = [...trackSizes]
    nextTrackSizes[boundaryIndex] = firstSize
    nextTrackSizes[boundaryIndex + 1] = secondSize

    return nextTrackSizes.map((size) => Math.max(0.0001, (size / availableSize) * totalWeight))
}

export function resizeSplitViewBoundaryImpl(
    get: GetState,
    set: SetState,
    axis: 'row' | 'column',
    rowIndex: number,
    boundaryIndex: number,
    deltaPx: number,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    if (state.viewMode !== 'split') {
        return
    }

    const rows = splitRowsFromPanes(state.splitView.panes, state.splitView.rows || state.splitView.columns)
    if (rows.length === 0) {
        return
    }

    const sizing = normalizeSplitViewSizing(rows, state.splitView)
    const splitView: SplitViewState = {
        ...state.splitView,
        rows,
        rowWeights: sizing.rowWeights,
        columnWeights: sizing.columnWeights,
    }

    if (axis === 'row') {
        splitView.rowWeights = resizeAdjacentWeights(
            normalizeSplitWeights(splitView.rowWeights, rows.length),
            boundaryIndex,
            deltaPx,
            viewportSize.height,
            SPLIT_VIEW_MIN_PANE_HEIGHT,
        )
    } else {
        const row = rows[rowIndex]
        if (!row || row.length < 2) {
            return
        }

        splitView.columnWeights = splitView.columnWeights.map((weights, currentRowIndex) => (
            currentRowIndex === rowIndex
                ? resizeAdjacentWeights(
                    normalizeSplitWeights(weights, row.length),
                    boundaryIndex,
                    deltaPx,
                    viewportSize.width,
                    SPLIT_VIEW_MIN_PANE_WIDTH,
                )
                : weights
        ))
    }

    set(buildSplitViewLayoutState(state, splitView, viewportSize))
}

export function setSplitViewColumnsImpl(
    get: GetState,
    set: SetState,
    columns: number,
    viewportSize: ViewportSize = getCanvasViewportSize(),
) {
    const state = get()
    if (state.viewMode !== 'split') {
        return
    }

    const splitView = {
        ...state.splitView,
        rows: splitRowsFromPanes(state.splitView.panes, columns),
        columns: clampSplitViewColumns(columns),
    }

    set(buildSplitViewLayoutState(state, splitView, viewportSize))
}

export function exitFocusModeImpl(get: GetState, set: SetState) {
    const state = get()
    const patch = buildExitFocusModeState(state)
    if (!patch) return
    set(patch)
}

export function switchFocusTargetImpl(
    get: GetState,
    set: SetState,
    nodeId: string,
    nodeType: FocusNodeType,
) {
    const state = get()
    const currentTarget = resolveFocusTarget(state.focusSnapshot)
    if (!currentTarget) return

    if (nodeId === currentTarget.id && nodeType === currentTarget.type) return

    const restoredPatch = buildExitFocusModeState(state)
    if (!restoredPatch) {
        return
    }

    const restoredState = { ...state, ...restoredPatch } as StudioState
    const viewportSize = resolveCurrentFocusViewportSize(state, currentTarget)
    const nextPatch = buildEnterFocusModeState(restoredState, { id: nodeId, type: nodeType }, viewportSize)
    if (nextPatch) {
        set(nextPatch)
    }
}

export function setWorkingDirImpl(get: GetState, set: SetState, dir: string) {
    const normalized = normalizePath(dir)
    if (!normalized) return
    setApiWorkingDirContext(normalized)
    set((state: StudioState) => ({
        workspaceId: state.workspaceList.find((entry) => entry.workingDir === normalized)?.id || null,
        workingDir: normalized,
        performers: state.performers,
        drafts: {},
        markdownEditors: [],
        editingTarget: null,
        selectedPerformerId: null,
        selectedPerformerSessionId: null,
        selectedMarkdownEditorId: null,
        workspaceMode: 'canvas',
        ...buildCanvasViewResetState(),
        seEntities: {},
        seMessages: {},
        seStatuses: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        chatDrafts: {},
        chatPrefixes: {},
        activeChatPerformerId: null,
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        sessionMutationPending: {},
        sessionReverts: {},
        sessions: [],
        inspectorFocus: null,
        isTrackingOpen: false,
        workspaceDirty: true,
        acts: [],
        selectedActId: null,
        actEditorState: null,
        actThreads: {},
        activeThreadId: null,
        activeThreadParticipantKey: null,
    }))
    get().initRealtimeEvents()
    api.studio.activate(normalized).catch((error) => console.warn('[studio] activate failed', error))
}

export function addCanvasTerminalImpl(
    get: GetState,
    set: SetState,
    canvasTerminalIdCounter: { value: number },
) {
    canvasTerminalIdCounter.value++
    const id = `canvas-term-${canvasTerminalIdCounter.value}`
    const title = `Terminal ${canvasTerminalIdCounter.value}`
    const state = get()
    const spawnPosition = resolveCanvasSpawnPosition({
        canvasCenter: state.canvasCenter,
        existingCount: state.canvasTerminals.length,
        width: 600,
        height: 400,
    })
    set((state: StudioState) => ({
        canvasTerminals: [
            ...state.canvasTerminals,
            {
                id,
                title,
                position: spawnPosition,
                width: 600,
                height: 400,
                sessionId: null,
                connected: false,
            },
        ],
        workspaceDirty: true,
    }))
}

export function removeCanvasTerminalImpl(set: SetState, id: string) {
    set((state: StudioState) => ({
        canvasTerminals: state.canvasTerminals.filter((terminal) => terminal.id !== id),
        workspaceDirty: true,
    }))
}

export function updateCanvasTerminalPositionImpl(set: SetState, id: string, x: number, y: number) {
    set((state: StudioState) => ({
        canvasTerminals: mapCanvasTerminals(state.canvasTerminals, id, (terminal) => ({ ...terminal, position: { x, y } })),
        workspaceDirty: true,
    }))
}

export function updateCanvasTerminalSizeImpl(set: SetState, id: string, width: number, height: number) {
    set((state: StudioState) => ({
        canvasTerminals: mapCanvasTerminals(state.canvasTerminals, id, (terminal) => ({ ...terminal, width, height })),
        workspaceDirty: true,
    }))
}

export function updateCanvasTerminalSessionImpl(set: SetState, id: string, sessionId: string | null, connected: boolean) {
    set((state: StudioState) => ({
        canvasTerminals: mapCanvasTerminals(state.canvasTerminals, id, (terminal) => ({ ...terminal, sessionId, connected })),
    }))
}
