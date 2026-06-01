import type { DraftPrimitive } from '../../lib/primitive-types'
import type {
    Node } from '@xyflow/react'

import type {
    WorkspaceCanvasTerminalNode,
    WorkspaceMarkdownEditorNode,
    WorkspaceAgentNode,
    WorkspaceTeamSnapshot,
} from '../../../shared/workspace-contracts'
import type { WorkspaceSlice } from '../../store/workspace/types'
import {
    TEAM_DEFAULT_WIDTH,
    resolveTeamExpandedHeight,
} from '../../lib/team-layout'
import { primitiveUrnDisplayName } from '../../lib/primitive-urn'
import { hasModelConfig } from '../../lib/agents'

type CanvasNodeKind = 'agent' | 'markdownEditor' | 'canvasTerminal' | 'team'

function getCanvasWindowZIndex({
    selected = false,
    focused = false,
    editing = false,
    transformActive = false,
}: {
    selected?: boolean
    focused?: boolean
    editing?: boolean
    transformActive?: boolean
}) {
    if (transformActive) return 80
    if (editing) return 70
    if (focused) return 60
    if (selected) return 50
    return 1
}

function primitiveRefLabel(
    ref: { kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null | undefined,
    drafts: Record<string, DraftPrimitive>,
) {
    if (!ref) {
        return null
    }
    if (ref.kind === 'draft') {
        const draft = drafts[ref.draftId]
        return draft?.name || draft?.slug || `Draft · ${ref.draftId.slice(0, 8)}`
    }
    return primitiveUrnDisplayName(ref.urn)
}

function skillSummaryLabel(
    refs: Array<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string }>,
    drafts: Record<string, DraftPrimitive>,
) {
    if (refs.length === 0) {
        return null
    }

    const labels = refs
        .map((ref) => primitiveRefLabel(ref, drafts))
        .filter((label): label is string => !!label)

    if (labels.length === 0) {
        return `${refs.length} Skill${refs.length === 1 ? '' : 's'}`
    }

    return labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0]
}

export function buildAgentCanvasNodes(args: {
    teams: WorkspaceTeamSnapshot[]
    editingTeamId: string | null
    agents: WorkspaceAgentNode[]
    selectedAgentId: string | null
    focusedAgentId: string | null
    editingTarget: WorkspaceSlice['editingTarget']
    transformTarget: { id: string; type: CanvasNodeKind } | null
    drafts: Record<string, DraftPrimitive>
    agentMcpSummary: (agent: WorkspaceAgentNode) => string | null
    onActivateTransform: (type: CanvasNodeKind, id: string) => void
    onDeactivateTransform: (type: CanvasNodeKind, id: string) => void
}) {
    const {
        teams,
        editingTeamId,
        agents,
        selectedAgentId,
        focusedAgentId,
        editingTarget,
        transformTarget,
        drafts,
        agentMcpSummary,
        onActivateTransform,
        onDeactivateTransform,
    } = args

    const editingTeam = editingTeamId
        ? teams.find((team) => team.id === editingTeamId) || null
        : null

    const isAgentInEditingTeam = (agent: WorkspaceAgentNode) => {
        if (!editingTeam) return false
        return Object.values(editingTeam.participants).some((binding) => {
            const ref = binding.agentRef
            if (ref.kind === 'draft') {
                return ref.draftId === agent.id
            }
            return agent.meta?.derivedFrom === ref.urn
        })
    }

    return agents.map((agent) => ({
        id: agent.id,
        type: 'agent',
        position: agent.position,
        selected: agent.id === selectedAgentId,
        dragHandle: '.canvas-frame__header',
        hidden: agent.hidden,
        zIndex: getCanvasWindowZIndex({
            selected: agent.id === selectedAgentId,
            focused: focusedAgentId === agent.id,
            editing: editingTarget?.type === 'agent' && editingTarget.id === agent.id,
            transformActive: transformTarget?.type === 'agent' && transformTarget.id === agent.id,
        }),
        data: {
            name: agent.name,
            width: agent.width,
            height: agent.height,
            model: agent.model,
            modelLabel: agent.model?.modelId || null,
            modelTitle: agent.model ? `${agent.model.provider}/${agent.model.modelId}` : null,
            modelVariant: agent.modelVariant || null,
            runtimeAgentId: agent.runtimeAgentId || null,
            modelConfigured: hasModelConfig(agent.model),
            planMode: agent.planMode,
            transformActive: transformTarget?.type === 'agent' && transformTarget.id === agent.id,
            onActivateTransform: () => onActivateTransform('agent', agent.id),
            onDeactivateTransform: () => onDeactivateTransform('agent', agent.id),
            skillSummary: skillSummaryLabel(agent.skillRefs, drafts),
            mcpSummary: agentMcpSummary(agent),
            editMode: editingTarget?.type === 'agent' && editingTarget.id === agent.id,
            teamEditConnectVisible: !!editingTeam,
            teamEditParticipant: isAgentInEditingTeam(agent),
            teamEditDimmed: !!editingTeam && !isAgentInEditingTeam(agent),
        } as Record<string, unknown>,
        style: { width: agent.width || 400, height: agent.height || 500 },
    })) satisfies Node[]
}

export function buildMarkdownEditorCanvasNodes(args: {
    markdownEditors: WorkspaceMarkdownEditorNode[]
    selectedMarkdownEditorId: string | null
    transformTarget: { id: string; type: CanvasNodeKind } | null
    workingDir: string
    onActivateTransform: (type: CanvasNodeKind, id: string) => void
    onDeactivateTransform: (type: CanvasNodeKind, id: string) => void
}) {
    const {
        markdownEditors,
        selectedMarkdownEditorId,
        transformTarget,
        workingDir,
        onActivateTransform,
        onDeactivateTransform,
    } = args

    return markdownEditors.map((editor) => ({
        id: editor.id,
        type: 'markdownEditor',
        position: editor.position,
        selected: editor.id === selectedMarkdownEditorId,
        dragHandle: '.canvas-frame__header',
        hidden: editor.hidden,
        zIndex: getCanvasWindowZIndex({
            selected: editor.id === selectedMarkdownEditorId,
            editing: selectedMarkdownEditorId === editor.id,
            transformActive: transformTarget?.type === 'markdownEditor' && transformTarget.id === editor.id,
        }),
        data: {
            kind: editor.kind,
            draftId: editor.draftId,
            baseline: editor.baseline,
            attachTarget: editor.attachTarget,
            width: editor.width,
            height: editor.height,
            transformActive: transformTarget?.type === 'markdownEditor' && transformTarget.id === editor.id,
            onActivateTransform: () => onActivateTransform('markdownEditor', editor.id),
            onDeactivateTransform: () => onDeactivateTransform('markdownEditor', editor.id),
            workingDir,
        } as Record<string, unknown>,
        style: { width: editor.width || 560, height: editor.height || 420 },
    })) satisfies Node[]
}

export function buildCanvasTerminalWindowNodes(args: {
    canvasTerminals: WorkspaceCanvasTerminalNode[]
    transformTarget: { id: string; type: CanvasNodeKind } | null
    onActivateTransform: (type: CanvasNodeKind, id: string) => void
    onDeactivateTransform: (type: CanvasNodeKind, id: string) => void
    onCloseTerminal: (id: string) => void
    onResizeTerminal: (id: string, width: number, height: number) => void
    onSessionChange: (id: string, sessionId: string | null, connected: boolean) => void
}) {
    const {
        canvasTerminals,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
        onCloseTerminal,
        onResizeTerminal,
        onSessionChange,
    } = args

    return canvasTerminals.map((terminal) => ({
        id: terminal.id,
        type: 'canvasTerminal',
        position: terminal.position,
        dragHandle: '.canvas-frame__header',
        zIndex: getCanvasWindowZIndex({
            transformActive: transformTarget?.type === 'canvasTerminal' && transformTarget.id === terminal.id,
        }),
        data: {
            nodeId: terminal.id,
            title: terminal.title,
            width: terminal.width,
            height: terminal.height,
            transformActive: transformTarget?.type === 'canvasTerminal' && transformTarget.id === terminal.id,
            onActivateTransform: () => onActivateTransform('canvasTerminal', terminal.id),
            onDeactivateTransform: () => onDeactivateTransform('canvasTerminal', terminal.id),
            onClose: () => onCloseTerminal(terminal.id),
            onResize: (width: number, height: number) => onResizeTerminal(terminal.id, width, height),
            onSessionChange: (sessionId: string | null, connected: boolean) => onSessionChange(terminal.id, sessionId, connected),
        } as Record<string, unknown>,
        style: { width: terminal.width || 600, height: terminal.height || 400 },
    })) satisfies Node[]
}

export function buildTeamCanvasNodes(args: {
    teams: WorkspaceTeamSnapshot[]
    editingTeamId: string | null
    selectedTeamId: string | null
    transformTarget: { id: string; type: CanvasNodeKind } | null
    onActivateTransform: (type: CanvasNodeKind, id: string) => void
    onDeactivateTransform: (type: CanvasNodeKind, id: string) => void
}) {
    const {
        teams,
        editingTeamId,
        selectedTeamId,
        transformTarget,
        onActivateTransform,
        onDeactivateTransform,
    } = args

    return teams.map((team) => ({
        id: team.id,
        type: 'team' as const,
        position: team.position,
        dragHandle: '.canvas-frame__header',
        hidden: team.hidden,
        zIndex: getCanvasWindowZIndex({
            editing: editingTeamId === team.id,
            selected: selectedTeamId === team.id,
            transformActive: transformTarget?.type === 'team' && transformTarget.id === team.id,
        }),
        data: {
            width: team.width || TEAM_DEFAULT_WIDTH,
            height: resolveTeamExpandedHeight(team.height),
            editMode: editingTeamId === team.id,
            transformActive: transformTarget?.type === 'team' && transformTarget.id === team.id,
            onActivateTransform: () => onActivateTransform('team', team.id),
            onDeactivateTransform: () => onDeactivateTransform('team', team.id),
        } as Record<string, unknown>,
        style: { width: team.width || TEAM_DEFAULT_WIDTH, height: resolveTeamExpandedHeight(team.height) },
    })) satisfies Node[]
}
