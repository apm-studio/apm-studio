/**
 * AgentFrame - Canvas node representing an agent.
 *
 * This is a thin orchestrator that:
 * 1. Initializes shared hooks and store bindings
 * 2. Renders the CanvasWindowFrame shell with header
 * 3. Delegates to AgentEditPanel or AgentChatPanel
 * Edit-mode composition: AgentEditPanel
 * Chat-mode conversation: AgentChatPanel
 */
import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Handle, Position } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'

import { useStudioStore } from '../../store'
import { useAgents, useMcpServers } from '../../hooks/queries/opencode'
import { hasModelConfig, resolveAgentRuntimeId } from '../../lib/agents'
import { useAgentPresentation } from '../../hooks/useAgentPresentation'
import { showToast } from '../../lib/toast'
import { getCanvasViewportSize } from '../../lib/focus-utils'
import { primitiveUrnDisplayName } from '../../lib/primitive-urn'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts'
import type { WorkspaceModelConfig } from '../../../shared/workspace-contracts'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'

import AgentEditPanel from './AgentEditPanel'
import AgentChatPanel from './AgentChatPanel'
import AgentFrameHeaderActions from './AgentFrameHeaderActions'
import {
    buildAgentFrameCanvasClassName,
    buildAgentFrameDragHandle,
    buildAgentFrameMcpBindingOptions,
    buildAgentFrameMcpBindingRows,
    buildAgentFrameShellClassName,
    buildAgentFrameSurfaceState,
} from './agent-frame-state'
import { useChatSession } from '../../store/session/use-chat-session'

import './AgentFrame.css'
import './AgentChat.css'
import './AgentChatComposer.css'
import './AgentInput.css'

/* Main Component */

type AgentFrameData = {
    name: string
    width?: number
    height?: number
    model?: WorkspaceModelConfig | null
    modelLabel?: string | null
    modelTitle?: string | null
    instructionLabel?: string | null
    skillSummary?: string | null
    runtimeAgentId?: string | null
    planMode?: boolean
    teamEditConnectVisible?: boolean
    teamEditParticipant?: boolean
    teamEditDimmed?: boolean
    transformActive?: boolean
    onActivateTransform?: (() => void) | undefined
    onDeactivateTransform?: (() => void) | undefined
}

type AgentFrameProps = {
    data: AgentFrameData
    id: string
}

export default function AgentFrame({ data, id }: AgentFrameProps) {
    // Store
    const {
        selectedAgentId, editingTarget,
        setAgentRuntimeId,
        toggleAgentVisibility, closeEditor,
        agents: workspaceAgents, drafts,
        openDraftEditor,
        openAgentEditor,
        updateAgentName,
        updateAgentAuthoringMeta,
        setAgentInstructionRef,
        setAgentBody,
        setAgentModel, setAgentModelVariant,
        removeAgentMcp, setAgentMcpBinding, removeAgentSkill,
        enterFocusMode, exitFocusMode,
        focusSnapshot,
        viewMode,
        workspaceMode,
        splitView,
        removeSplitViewPane,
    } = useStudioStore(useShallow((state) => ({
        selectedAgentId: state.selectedAgentId,
        editingTarget: state.editingTarget,
        setAgentRuntimeId: state.setAgentRuntimeId,
        toggleAgentVisibility: state.toggleAgentVisibility,
        closeEditor: state.closeEditor,
        agents: state.agents,
        drafts: state.drafts,
        openDraftEditor: state.openDraftEditor,
        openAgentEditor: state.openAgentEditor,
        updateAgentName: state.updateAgentName,
        updateAgentAuthoringMeta: state.updateAgentAuthoringMeta,
        setAgentInstructionRef: state.setAgentInstructionRef,
        setAgentBody: state.setAgentBody,
        setAgentModel: state.setAgentModel,
        setAgentModelVariant: state.setAgentModelVariant,
        removeAgentMcp: state.removeAgentMcp,
        setAgentMcpBinding: state.setAgentMcpBinding,
        removeAgentSkill: state.removeAgentSkill,
        enterFocusMode: state.enterFocusMode,
        exitFocusMode: state.exitFocusMode,
        focusSnapshot: state.focusSnapshot,
        viewMode: state.viewMode,
        workspaceMode: state.workspaceMode,
        splitView: state.splitView,
        removeSplitViewPane: state.removeSplitViewPane,
    })))

    // Local State
    const bodyRef = useRef<HTMLDivElement>(null)

    // Derived
    const surface = useMemo(() => buildAgentFrameSurfaceState({
        id,
        selectedAgentId,
        editingTarget,
        focusSnapshot,
        viewMode,
        workspaceMode,
        splitView,
        teamEditConnectVisible: data.teamEditConnectVisible,
    }), [data.teamEditConnectVisible, editingTarget, focusSnapshot, id, selectedAgentId, splitView, viewMode, workspaceMode])
    const {
        isSelected,
        isFullView,
        splitPane,
        isSplitPane,
        isFullscreenSurface,
        isManageMode,
        hideFocusControl,
        isTeamEditMode,
        shouldShowEditPanel,
    } = surface
    const chatSession = useChatSession(id)
    const messages = chatSession.messages
    const isLoading = chatSession.isLoading
    const canAbort = chatSession.canAbort
    const prefixCount = chatSession.prefixCount
    const modelConfigured = hasModelConfig(data.model)
    const agent = workspaceAgents.find((item) => item.id === id) || null
    const sessionId = chatSession.sessionId
    const hasActiveSession = !!sessionId

    // Queries
    const { data: runtimeAgents = [] } = useAgents(isSelected || shouldShowEditPanel)
    const { data: mcpServers = [] } = useMcpServers(isSelected || shouldShowEditPanel)

    // DnD
    const instructionDrop = useDroppable({ id: `agent-edit-instruction-${id}`, data: { agentId: id, type: 'instruction' } })
    const skillDrop = useDroppable({ id: `agent-edit-skill-${id}`, data: { agentId: id, type: 'skill' } })
    const modelDrop = useDroppable({ id: `agent-edit-model-${id}`, data: { agentId: id, type: 'model' } })
    const mcpDrop = useDroppable({ id: `agent-edit-mcp-${id}`, data: { agentId: id, type: 'mcp' } })

    // Agent/model resolution
    const selectedRuntimeAgentId = agent
        ? resolveAgentRuntimeId(agent)
        : (data.runtimeAgentId || (data.planMode ? 'plan' : 'build'))
    const buildAgent = useMemo(() => runtimeAgents.find((a) => a.name === 'build') || null, [runtimeAgents])
    const planAgent = useMemo(() => runtimeAgents.find((a) => a.name === 'plan') || null, [runtimeAgents])

    // Presentation
    const { presentation: agentPresentation, runtimeTools } = useAgentPresentation(
        agent, [], mcpServers, drafts,
        { enableTools: (isSelected || shouldShowEditPanel) },
    )
    // Standalone agents no longer have edges; relations live inside Teams only.
    const requestRelations: Array<{ targetName: string; description: string }> = []
    const mcpBindingRows = useMemo(
        () => buildAgentFrameMcpBindingRows(agentPresentation.declaredMcpServerNames, agent?.mcpBindingMap),
        [agent?.mcpBindingMap, agentPresentation.declaredMcpServerNames],
    )
    const mcpBindingOptions = useMemo(
        () => buildAgentFrameMcpBindingOptions(mcpServers),
        [mcpServers],
    )

    // MCP binding auto-cleanup
    useEffect(() => {
        if (!agent?.mcpBindingMap) return
        const validNames = new Set(mcpServers.map((s) => s.name))
        for (const [placeholderName, serverName] of Object.entries(agent.mcpBindingMap)) {
            if (!serverName || validNames.has(serverName)) continue
            setAgentMcpBinding(id, placeholderName, null)
        }
    }, [id, mcpServers, agent?.mcpBindingMap, setAgentMcpBinding])

    // Wheel isolation
    useEffect(() => {
        const el = bodyRef.current
        if (!el) return
        const handler = (e: WheelEvent) => { e.stopPropagation() }
        el.addEventListener('wheel', handler, { passive: true })
        return () => el.removeEventListener('wheel', handler)
    }, [])

    const handleToggleFocus = useCallback(() => {
        if (workspaceMode === 'run' && isFullView) return
        if (isFullView) {
            exitFocusMode()
            return
        }

        enterFocusMode(id, 'agent', getCanvasViewportSize())
    }, [enterFocusMode, exitFocusMode, id, isFullView, workspaceMode])

    const handleRemoveSplitPane = useCallback(() => {
        if (!splitPane) return
        removeSplitViewPane(splitPane.paneId, getCanvasViewportSize())
    }, [removeSplitViewPane, splitPane])

    const handleOpenAgentEditor = useCallback(() => {
        openAgentEditor(id)
    }, [id, openAgentEditor])

    const openPrimitiveEditor = useCallback(async (
        kind: 'instruction' | 'skill',
        targetRef: SharedPrimitiveRef | null,
        _attachMode: 'instruction' | 'skill-new' | 'skill-replace',
    ) => {
        if (!targetRef) return
        try {
            if (targetRef.kind === 'draft') {
                const draft = drafts[targetRef.draftId]
                if (!draft) throw new Error('Draft not found.')
                openDraftEditor(targetRef.draftId)
                return
            }
            const displayName = primitiveUrnDisplayName(targetRef.urn)
            showToast(`${displayName} is an imported package reference. Edit package primitives from Manage.`, 'info', {
                title: 'Open package from Manage',
                dedupeKey: `agent-package-ref-open:${id}:${kind}:${targetRef.urn}`,
            })
        } catch (error) {
            console.error('Failed to open markdown editor', error)
            showToast(`Studio could not open the ${kind === 'instruction' ? 'Instruction' : 'Skill'} editor for this agent.`, 'error', {
                title: `${kind === 'instruction' ? 'Instruction' : 'Skill'} editor failed`,
                dedupeKey: `agent-editor-open:${id}:${kind}:${targetRef?.kind}:${targetRef?.kind === 'registry' ? targetRef.urn : targetRef?.draftId}`,
                actionLabel: 'Retry',
                onAction: () => { void openPrimitiveEditor(kind, targetRef, _attachMode) },
            })
        }
    }, [openDraftEditor, drafts, id])

    // Render
    return (
        <div className={buildAgentFrameShellClassName({
            teamEditParticipant: data.teamEditParticipant,
            teamEditDimmed: data.teamEditDimmed,
        })}>
            {data.teamEditConnectVisible ? (
                <>
                    <Handle id="top" type="source" position={Position.Top} className="agent-node-shell__handle" isConnectable />
                    <Handle id="right" type="source" position={Position.Right} className="agent-node-shell__handle" isConnectable />
                    <Handle id="bottom" type="source" position={Position.Bottom} className="agent-node-shell__handle" isConnectable />
                    <Handle id="left" type="source" position={Position.Left} className="agent-node-shell__handle" isConnectable />
                </>
            ) : null}
            <CanvasWindowFrame
                className={buildAgentFrameCanvasClassName({ isFullView, isSplitPane })}
                width={data.width || 320}
                height={data.height || 400}
                transformActive={!!data.transformActive}
                onActivateTransform={data.onActivateTransform as (() => void) | undefined}
                onDeactivateTransform={data.onDeactivateTransform as (() => void) | undefined}
                selected={isSelected}
                focused={isFullView}
                locked={isFullscreenSurface}
                dragHandle={buildAgentFrameDragHandle({ splitPane, id, name: data.name })}
                minWidth={280}
                minHeight={320}
                headerStart={<span className="canvas-frame__name">{data.name}</span>}
                headerEnd={(
                    <AgentFrameHeaderActions
                        modelLabel={data.modelLabel || null}
                        modelTitle={data.modelTitle || null}
                        instructionLabel={data.instructionLabel || null}
                        skillSummary={data.skillSummary || null}
                        isFullscreenSurface={isFullscreenSurface}
                        shouldShowEditPanel={shouldShowEditPanel}
                        isSplitPane={isSplitPane}
                        isFullView={isFullView}
                        hideFocusControl={hideFocusControl}
                        onRemoveSplitPane={handleRemoveSplitPane}
                        onToggleFocus={handleToggleFocus}
                        onOpenEditor={handleOpenAgentEditor}
                        onToggleVisibility={() => toggleAgentVisibility(id)}
                    />
                )}
                bodyClassName="nowheel nodrag"
                bodyRef={bodyRef}
            >
                {shouldShowEditPanel ? (
                    <AgentEditPanel
                        agentId={id}
                        agent={agent}
                        hideBackButton={isTeamEditMode || isManageMode}
                        presentation={agentPresentation}
                        runtimeTools={runtimeTools || null}
                        requestRelations={requestRelations}
                        mcpBindingRows={mcpBindingRows}
                        mcpBindingOptions={mcpBindingOptions}
                        dropRefs={{
                            instruction: { isOver: instructionDrop.isOver, setNodeRef: instructionDrop.setNodeRef },
                            skill: { isOver: skillDrop.isOver, setNodeRef: skillDrop.setNodeRef },
                            model: { isOver: modelDrop.isOver, setNodeRef: modelDrop.setNodeRef },
                            mcp: { isOver: mcpDrop.isOver, setNodeRef: mcpDrop.setNodeRef },
                        }}
                        onClose={closeEditor}
                        onNameChange={(value) => updateAgentName(id, value)}
                        onDescriptionChange={(value) => updateAgentAuthoringMeta(id, { description: value })}
                        onAgentBodyChange={(value) => setAgentBody(id, value)}
                        onInstructionRefChange={(ref) => setAgentInstructionRef(id, ref)}
                        onModelChange={(model) => setAgentModel(id, model)}
                        onModelVariantChange={(variant) => setAgentModelVariant(id, variant)}
                        onRemoveSkill={removeAgentSkill}
                        onRemoveMcp={removeAgentMcp}
                        onSetMcpBinding={setAgentMcpBinding}

                        onOpenPrimitiveEditor={openPrimitiveEditor}
                    />
                ) : (
                    <AgentChatPanel
                        agentId={id}
                        agent={agent}
                        messages={messages}
                        prefixCount={prefixCount}
                        isLoading={isLoading}
                        canAbort={canAbort}
                        sessionId={sessionId}
                        hasActiveSession={hasActiveSession}
                        modelConfigured={modelConfigured}
                        selectedAgentId={selectedRuntimeAgentId}
                        buildAgent={buildAgent}
                        planAgent={planAgent}
                        runtimeTools={runtimeTools || null}
                        skillPrimitives={[]}
                        drafts={drafts}
                        onSetAgentId={setAgentRuntimeId}
                        onSetModelVariant={setAgentModelVariant}
                        // Keep the build/plan runtime wiring in place even while the
                        // standalone agent composer temporarily hides the toggle.
                        // We'll re-enable this control after the standalone build-mode
                        // behavior is fixed, so this is intentionally not dead code.
                        showModeToggle={false}
                    />
                )}
            </CanvasWindowFrame>
        </div>
    )
}
