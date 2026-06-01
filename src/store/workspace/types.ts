import type { DraftPrimitive, PackageLibraryItem } from '../../lib/primitive-types'

import type { ApmPackageScope } from '../../../shared/apm-contracts'
import type {
    AgentDraftContent,
    TeamDraftContent,
} from '../../../shared/draft-contracts'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts'
import type { McpServerSummary } from '../../../shared/opencode-contracts'
import type {
    SavedWorkspaceSummary,
    WorkspaceCanvasTerminalNode,
    WorkspaceMarkdownEditorKind,
    WorkspaceMarkdownEditorNode,
    WorkspaceModelConfig,
    WorkspaceAgentNode,
} from '../../../shared/workspace-contracts'
import type { ProjectionDirtyState, RuntimeChangeClass, StudioChangeDescriptor } from '../runtime/change-policy'

export type WorkspaceMode = 'import' | 'studio-agent' | 'export'
export type WorkspaceViewMode = 'canvas' | 'full' | 'split'
export type FullscreenNodeType = 'agent' | 'team'

export interface FullscreenNodeRect {
    nodeId: string
    type: FullscreenNodeType
    nodePosition: { x: number; y: number }
    nodeSize: { width: number; height: number }
}

export interface FocusSnapshot {
    nodeId: string
    type: FullscreenNodeType
    teamId?: string
    nodePosition?: { x: number; y: number }
    hiddenAgentIds: string[]
    hiddenTeamIds: string[]
    hiddenEditorIds: string[]
    hiddenTerminalIds: string[]
    nodeSize: { width: number; height: number }
    nodeRects?: FullscreenNodeRect[]
    packageLibraryOpen: boolean
    assistantOpen: boolean
    trackingOpen: boolean
    terminalOpen: boolean
}

export interface SplitViewPane {
    paneId: string
    nodeId: string
    type: FullscreenNodeType
}

export interface SplitViewState {
    panes: SplitViewPane[]
    activePaneId: string | null
    rows: string[][]
    rowWeights: number[]
    columnWeights: number[][]
    columns: number
}

export interface SplitViewPlacement {
    rowIndex: number
    columnIndex: number
    rowMode?: 'existing' | 'new'
}

export interface CanvasRevealTarget {
    id: string
    type: FullscreenNodeType | 'markdownEditor' | 'canvasTerminal'
    nonce: number
}

export interface WorkspaceSlice {
    workspaceId: string | null
    agents: WorkspaceAgentNode[]
    drafts: Record<string, DraftPrimitive>
    markdownEditors: WorkspaceMarkdownEditorNode[]
    editingTarget: { type: 'agent'; id: string } | null
    selectedAgentId: string | null
    selectedAgentSessionId: string | null
    selectedMarkdownEditorId: string | null
    workspaceMode: WorkspaceMode
    apmPackageScope: ApmPackageScope
    viewMode: WorkspaceViewMode
    splitView: SplitViewState
    focusSnapshot: FocusSnapshot | null
    canvasRevealTarget: CanvasRevealTarget | null
    inspectorFocus: string | null
    workspaceList: SavedWorkspaceSummary[]
    workspaceDirty: boolean
    projectionDirty: ProjectionDirtyState
    runtimeReloadPending: boolean
    theme: 'light' | 'dark'
    workingDir: string
    isTerminalOpen: boolean
    isTrackingOpen: boolean
    isPackageLibraryOpen: boolean
    canvasTerminals: WorkspaceCanvasTerminalNode[]
    canvasCenter: { x: number; y: number } | null
    layoutTeamId: string | null

    setTerminalOpen: (open: boolean) => void
    setTrackingOpen: (open: boolean) => void
    setWorkspaceMode: (mode: WorkspaceMode) => void
    setApmPackageScope: (scope: ApmPackageScope) => void
    setPackageLibraryOpen: (open: boolean) => void
    toggleTheme: () => void
    setCanvasCenter: (x: number, y: number) => void
    addAgent: (name: string, x?: number, y?: number) => string
    addAgentFromPrimitive: (primitive: {
        name: string
        skillUrns?: string[]
        model?: WorkspaceModelConfig | string | null
        modelVariant?: string | null
        modelPlaceholder?: WorkspaceModelConfig | null
        agentBody?: string | null
        runtimeAgentId?: string | null
        planMode?: boolean
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
        mcpConfig?: Record<string, unknown> | null
        description?: string
    }, x?: number, y?: number) => void
    applyAgentPrimitive: (agentId: string, primitive: {
        name: string
        skillUrns?: string[]
        model?: WorkspaceModelConfig | string | null
        modelVariant?: string | null
        modelPlaceholder?: WorkspaceModelConfig | null
        agentBody?: string | null
        runtimeAgentId?: string | null
        planMode?: boolean
        mcpServerNames?: string[]
        mcpBindingMap?: Record<string, string>
        mcpConfig?: Record<string, unknown> | null
        description?: string
    }) => void
    removeAgent: (id: string) => void
    updateAgentPosition: (id: string, x: number, y: number) => void
    updateAgentSize: (id: string, width: number, height: number) => void
    updateAgentName: (id: string, name: string) => void
    selectAgent: (id: string | null) => void
    selectAgentSession: (sessionId: string | null) => void
    selectMarkdownEditor: (id: string | null) => void
    enterFocusMode: (nodeId: string, nodeType: FullscreenNodeType, viewportSize: { width: number; height: number }) => void
    enterEmptyFullView: () => void
    enterEmptySplitView: () => void
    exitFocusMode: () => void
    switchFocusTarget: (nodeId: string, nodeType: FullscreenNodeType) => void
    enterSplitView: (nodeId?: string, nodeType?: FullscreenNodeType, viewportSize?: { width: number; height: number }) => void
    addSplitViewPane: (nodeId: string, nodeType: FullscreenNodeType, viewportSize?: { width: number; height: number }) => void
    insertSplitViewPane: (nodeId: string, nodeType: FullscreenNodeType, placement: number | SplitViewPlacement, viewportSize?: { width: number; height: number }) => void
    replaceSplitViewPane: (paneId: string, nodeId: string, nodeType: FullscreenNodeType, viewportSize?: { width: number; height: number }) => void
    moveSplitViewPane: (paneId: string, placement: number | SplitViewPlacement, viewportSize?: { width: number; height: number }) => void
    removeSplitViewPane: (paneId: string, viewportSize?: { width: number; height: number }) => void
    setSplitViewActivePane: (nodeId: string, nodeType: FullscreenNodeType) => void
    resizeSplitViewBoundary: (
        axis: 'row' | 'column',
        rowIndex: number,
        boundaryIndex: number,
        deltaPx: number,
        viewportSize?: { width: number; height: number },
    ) => void
    setSplitViewColumns: (columns: number, viewportSize?: { width: number; height: number }) => void
    revealCanvasNode: (nodeId: string, nodeType: FullscreenNodeType) => void
    exitTeamLayoutMode: () => void
    setInspectorFocus: (focus: string | null) => void
    openAgentEditor: (id: string, focus?: string | null) => void
    closeEditor: () => void
    setWorkingDir: (dir: string) => void
    newWorkspace: () => Promise<void>
    closeWorkspace: (workspaceId: string) => Promise<void>
    saveWorkspace: () => Promise<void>
    loadWorkspace: (workspaceId: string) => Promise<void>
    listWorkspaces: () => Promise<void>
    deleteWorkspace: (workspaceId: string) => Promise<void>
    markProjectionDirty: (patch: Partial<ProjectionDirtyState>) => void
    clearProjectionDirty: (patch?: Partial<ProjectionDirtyState>) => void
    recordStudioChange: (change: StudioChangeDescriptor) => RuntimeChangeClass
    markRuntimeReloadPending: () => void
    clearRuntimeReloadPending: () => void
    applyPendingRuntimeReload: () => Promise<boolean>

    setAgentBody: (agentId: string, agentBody: string | null) => void
    addAgentSkill: (agentId: string, skill: PackageLibraryItem) => void
    addAgentSkillRef: (agentId: string, skillRef: SharedPrimitiveRef) => void
    replaceAgentSkillRef: (agentId: string, currentRef: SharedPrimitiveRef, nextRef: SharedPrimitiveRef) => void
    removeAgentSkill: (agentId: string, skillKey: string) => void
    setAgentModel: (agentId: string, model: WorkspaceModelConfig | null) => void
    setAgentModelVariant: (agentId: string, variant: string | null) => void
    setAgentRuntimeId: (agentId: string, runtimeAgentId: string | null) => void
    addAgentMcp: (agentId: string, mcp: McpServerSummary) => void
    removeAgentMcp: (agentId: string, mcpName: string) => void
    setAgentMcpBinding: (agentId: string, placeholderName: string, serverName: string | null) => void
    updateAgentAuthoringMeta: (agentId: string, patch: { slug?: string; description?: string; tags?: string[] }) => void
    toggleAgentVisibility: (id: string) => void
    addCanvasTerminal: () => void
    removeCanvasTerminal: (id: string) => void
    updateCanvasTerminalPosition: (id: string, x: number, y: number) => void
    updateCanvasTerminalSize: (id: string, width: number, height: number) => void
    updateCanvasTerminalSession: (id: string, sessionId: string | null, connected: boolean) => void
    upsertDraft: (draft: DraftPrimitive) => void
    saveAgentAsDraft: (agentId: string) => Promise<void>
    saveTeamAsDraft: (teamId: string) => Promise<void>
    loadDraftsFromDisk: () => Promise<void>
    addAgentFromDraft: (name: string, draftContent: AgentDraftContent, description?: string) => void
    importTeamFromDraft: (name: string, draftContent: TeamDraftContent) => void
    createMarkdownEditor: (
        kind: WorkspaceMarkdownEditorKind,
        options?: {
            source?: {
                name: string
                slug?: string
                description?: string
                tags?: string[]
                content: string
                derivedFrom?: string | null
            }
            attachTarget?: WorkspaceMarkdownEditorNode['attachTarget']
            position?: { x: number; y: number }
        },
    ) => string
    saveMarkdownDraft: (editorId: string) => Promise<DraftPrimitive>
    updateMarkdownEditorPosition: (id: string, x: number, y: number) => void
    updateMarkdownEditorSize: (id: string, width: number, height: number) => void
    updateMarkdownEditorBaseline: (id: string, baseline: WorkspaceMarkdownEditorNode['baseline']) => void
    removeMarkdownEditor: (id: string) => void
    openDraftEditor: (draftId: string) => string | null
}
