/**
 * AgentEditPanel — Unified edit panel for agent configuration.
 * Shared between standalone AgentFrame and a Team's participant editor.
 *
 * Drill-down pattern:
 *   Main view: Compose cards (DnD + "Drag & drop or click to configure")
 *   Click a card → detail view for that category (Instruction, Skills, Model, MCP)
 *   Back button returns to main card view.
 */
import { useState } from 'react'
import { ArrowLeft, ChevronLeft, Cpu, Hexagon, Server, Zap } from 'lucide-react'

import { unresolvedDeclaredMcpServerNames } from '../../lib/agents'
import type {
    SharedPrimitiveRef } from '../../../shared/chat-contracts'
import type { McpServerSummary } from '../../../shared/opencode-contracts'
import type { WorkspaceModelConfig,
    WorkspaceAgentNode,
} from '../../../shared/workspace-contracts'

import AgentComposeCards from './AgentComposeCards'
import {
    AgentSkillsDetail,
    AgentMcpDetail,
    AgentModelDetail,
    AgentInstructionDetail,
} from './agent-edit-sections'

type DetailView = 'instruction' | 'skills' | 'model' | 'mcp' | null

type AgentEditPanelProps = {
    agentId: string
    agent: WorkspaceAgentNode | null
    presentation: {
        instructionPrimitive: { urn: string; name: string; description?: string } | null
        skillPrimitives: Array<{ urn: string; name: string; description?: string }>
        mcpServers: McpServerSummary[]
        mcpPlaceholders: string[]
        declaredMcpServerNames?: string[]
    }
    runtimeTools: {
        resolvedTools: string[]
        selectedMcpServers: string[]
        unavailableDetails: Array<{ serverName: string; reason: string }>
    } | null
    requestRelations: Array<{ targetName: string; description?: string | undefined }>
    mcpBindingRows: Array<{ placeholderName: string; serverName: string | null }>
    mcpBindingOptions: Array<{ name: string; disabled: boolean }>
    dropRefs: {
        instruction: { isOver: boolean; setNodeRef: (node: HTMLElement | null) => void }
        skill: { isOver: boolean; setNodeRef: (node: HTMLElement | null) => void }
        model: { isOver: boolean; setNodeRef: (node: HTMLElement | null) => void }
        mcp: { isOver: boolean; setNodeRef: (node: HTMLElement | null) => void }
    }
    /** Hide the back/close button (used in Team participant editing) */
    hideBackButton?: boolean
    onClose: () => void
    onNameChange: (value: string) => void
    onDescriptionChange: (value: string) => void
    onAgentBodyChange: (value: string) => void
    onInstructionRefChange: (ref: SharedPrimitiveRef | null) => void
    onModelChange: (model: WorkspaceModelConfig | null) => void
    onModelVariantChange: (variant: string | null) => void
    onRemoveSkill: (id: string, key: string) => void
    onRemoveMcp: (id: string, serverName: string) => void
    onSetMcpBinding: (id: string, placeholderName: string, serverName: string | null) => void

    onOpenPrimitiveEditor: (kind: 'instruction' | 'skill', targetRef: SharedPrimitiveRef | null, attachMode: 'instruction' | 'skill-new' | 'skill-replace') => void
}

export default function AgentEditPanel({
    agentId,
    agent,
    presentation,
    runtimeTools,
    requestRelations,
    mcpBindingRows,
    mcpBindingOptions,
    dropRefs,
    hideBackButton,
    onClose,
    onNameChange,
    onDescriptionChange,
    onAgentBodyChange,
    onInstructionRefChange,
    onModelChange,
    onModelVariantChange,
    onRemoveSkill,
    onRemoveMcp,
    onSetMcpBinding,

    onOpenPrimitiveEditor,
}: AgentEditPanelProps) {
    const [detailView, setDetailView] = useState<DetailView>(null)
    const unresolvedMcpPlaceholders = agent ? unresolvedDeclaredMcpServerNames(agent) : []

    // ── Detail view titles ──
    const detailTitles: Record<string, string> = {
        instruction: 'Instruction',
        skills: 'Skills',
        model: 'Model & Runtime',
        mcp: 'MCP & Relations',
    }

    // ── Compose card descriptions (with counts) ──
    const instructionDesc = presentation.instructionPrimitive ? presentation.instructionPrimitive.name : 'Drag & drop or click to add'
    const skillDesc = presentation.skillPrimitives.length > 0
        ? `${presentation.skillPrimitives.length} Skill${presentation.skillPrimitives.length !== 1 ? 's' : ''}`
        : 'Drag & drop or click to add'
    const modelDesc = agent?.model
        ? `${agent.model.modelId}`
        : 'Drag & drop or click to select'
    const mcpDesc = presentation.mcpServers.length > 0
        ? `${presentation.mcpServers.length} server${presentation.mcpServers.length !== 1 ? 's' : ''}`
        : 'Drag & drop or click to add'

    return (
        <>
            {/* ── Header ── */}
            {(detailView || !hideBackButton) && (
            <div className="edit-workbench__header">
                {detailView ? (
                    <button
                        className="edit-workbench__back"
                        onClick={(event) => {
                            event.stopPropagation()
                            setDetailView(null)
                        }}
                        title="Back to overview"
                    >
                        <ChevronLeft size={12} />
                    </button>
                ) : (
                    <button
                        className="edit-workbench__back"
                        onClick={(event) => {
                            event.stopPropagation()
                            onClose()
                        }}
                        title="Back to chat"
                    >
                        <ArrowLeft size={12} />
                    </button>
                )}
                <span className="section-title">
                    {detailView
                        ? detailTitles[detailView]
                        : 'Back to Chat'}
                </span>
            </div>
            )}

            {/* ── Name (always visible in both views) ── */}
            {!detailView && (
                <div className="adv-section">
                    <div className="adv-section__body">
                        <label className="adv-field">
                            <span className="adv-field__label">Name</span>
                            <input
                                className="text-input nodrag nowheel"
                                value={agent?.name || ''}
                                onChange={(event) => onNameChange(event.target.value)}
                            />
                        </label>
                        <label className="adv-field">
                            <span className="adv-field__label">Description</span>
                            <input
                                className="text-input nodrag nowheel"
                                value={agent?.meta?.authoring?.description || ''}
                                onChange={(event) => onDescriptionChange(event.target.value)}
                                placeholder="Describe this Studio Agent"
                            />
                        </label>
                        <label className="adv-field">
                            <span className="adv-field__label">Studio Agent Body</span>
                            <textarea
                                className="text-input adv-field__textarea nodrag nowheel"
                                value={agent?.agentBody || ''}
                                onChange={(event) => onAgentBodyChange(event.target.value)}
                                placeholder="Write the target-agnostic body for this Studio Agent."
                                rows={5}
                            />
                        </label>
                    </div>
                </div>
            )}

            {/* ── Main View: Compose Cards ── */}
            {!detailView && (
                <>
                    <AgentComposeCards
                        cards={[
                            {
                                key: 'instruction',
                                title: 'Instruction',
                                description: instructionDesc,
                                icon: <Hexagon size={12} />,
                                isOver: dropRefs.instruction.isOver,
                                setNodeRef: dropRefs.instruction.setNodeRef,
                                onClick: () => setDetailView('instruction'),
                            },
                            {
                                key: 'skills',
                                title: 'Skills',
                                description: skillDesc,
                                icon: <Zap size={12} />,
                                isOver: dropRefs.skill.isOver,
                                setNodeRef: dropRefs.skill.setNodeRef,
                                onClick: () => setDetailView('skills'),
                            },
                            {
                                key: 'model',
                                title: 'Model',
                                description: modelDesc,
                                icon: <Cpu size={12} />,
                                isOver: dropRefs.model.isOver,
                                setNodeRef: dropRefs.model.setNodeRef,
                                onClick: () => setDetailView('model'),
                            },
                            {
                                key: 'mcp',
                                title: 'MCP',
                                description: mcpDesc,
                                icon: <Server size={12} />,
                                isOver: dropRefs.mcp.isOver,
                                setNodeRef: dropRefs.mcp.setNodeRef,
                                onClick: () => setDetailView('mcp'),
                            },
                        ]}
                    />
                </>
            )}

            {/* ── Detail Views ── */}
            {detailView === 'instruction' && (
                <AgentInstructionDetail
                    agent={agent}
                    instructionPrimitive={presentation.instructionPrimitive}
                    onOpenPrimitiveEditor={onOpenPrimitiveEditor}
                    onInstructionRefChange={onInstructionRefChange}
                />
            )}
            {detailView === 'skills' && (
                <AgentSkillsDetail
                    agent={agent}
                    agentId={agentId}
                    onOpenPrimitiveEditor={onOpenPrimitiveEditor}
                    onRemoveSkill={onRemoveSkill}
                />
            )}
            {detailView === 'model' && (
                <AgentModelDetail
                    agent={agent}
                    runtimeTools={runtimeTools}
                    onModelChange={onModelChange}
                    onModelVariantChange={onModelVariantChange}
                />
            )}
            {detailView === 'mcp' && (
                <AgentMcpDetail
                    agent={agent}
                    agentId={agentId}
                    unresolvedMcpPlaceholders={unresolvedMcpPlaceholders}
                    mcpBindingRows={mcpBindingRows}
                    mcpBindingOptions={mcpBindingOptions}
                    requestRelations={requestRelations}
                    onRemoveMcp={onRemoveMcp}
                    onSetMcpBinding={onSetMcpBinding}
                />
            )}

        </>
    )
}
