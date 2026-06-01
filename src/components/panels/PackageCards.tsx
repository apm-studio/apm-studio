// Draggable package-library card sub-components
import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
    Hexagon,
    Zap,
    Package,
    Cpu,
    Server,
    GripVertical,
    Workflow,
    Trash2,
    Pencil,
} from 'lucide-react';
import {
    buildPackagePrimitiveDragPayload,
    buildModelDragPayload,
    buildMcpDragPayload,
} from './package-library-utils';
export { HoverableCard, PinnedDetailPanel } from './PackagePopover';
import { HoverableCard } from './PackagePopover';
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants';
import type { McpServerSummary } from '../../../shared/opencode-contracts';
import type { PackagePanelHandler, PackagePrimitive, McpPanelItem, ModelPanelItem } from './package-panel-types';

function agentMcpSummary(item: PackagePrimitive) {
    if (item.kind !== 'agent' || !Array.isArray(item.declaredMcpServerNames) || item.declaredMcpServerNames.length === 0) {
        return null
    }

    const matchCount = Array.isArray(item.matchedMcpServerNames) ? item.matchedMcpServerNames.length : 0
    const missingCount = Array.isArray(item.missingMcpServerNames) ? item.missingMcpServerNames.length : 0
    return `MCP ${item.declaredMcpServerNames.length} declared · ${matchCount} match · ${missingCount} need mapping`
}

function skillSyncLabel(item: PackagePrimitive) {
    const state = item.kind === 'skill' ? item.github?.sync?.state : null
    switch (state) {
        case 'up_to_date':
            return 'Up to date'
        case 'update_available':
            return 'Update available'
        case 'upstream_missing':
            return 'Upstream removed'
        case 'repo_drift':
            return 'Repo drift'
        case 'provenance_unverifiable':
            return 'Needs relink'
        case 'check_failed':
            return 'Check failed'
        default:
            return null
    }
}

function sourceLabel(source: string) {
    return source === 'user' ? 'User' : source
}

function primitiveKindIcon(kind: string, className = 'primitive-icon combo') {
    if (kind === 'instruction') return <Hexagon size={12} className="primitive-icon instruction" />
    if (kind === 'skill') return <Zap size={12} className="primitive-icon skill" />
    if (kind === 'agent') return <Package size={12} className="primitive-icon agent" />
    if (kind === 'team') return <Workflow size={12} className="primitive-icon team" />
    if (kind === 'model') return <Cpu size={12} className="primitive-icon model" />
    if (kind === 'mcp') return <Server size={12} className="primitive-icon mcp" />
    return <Package size={12} className={className} />
}

function PackageCardHeader({
    icon,
    name,
    trailing,
    dragHandle = false,
}: {
    icon: React.ReactNode
    name: string
    trailing?: React.ReactNode
    dragHandle?: boolean
}) {
    return (
        <div className="package-card__header">
            {dragHandle ? <GripVertical size={10} className="drag-handle" /> : null}
            {icon}
            <span className="package-card__name">{name}</span>
            {trailing}
        </div>
    )
}

// ── DraggablePrimitive ──────────────────────────────────────

export function DraggablePrimitive({
    item,
    selected,
    onSelect,
    onUninstall,
    onDeleteDraft,
    onEditDraft,
}: {
    item: PackagePrimitive
    selected: boolean
    onSelect: PackagePanelHandler
    onUninstall?: PackagePanelHandler
    onDeleteDraft?: PackagePanelHandler
    onEditDraft?: PackagePanelHandler
}) {
    const dragPayload = useMemo(() => buildPackagePrimitiveDragPayload(item), [item])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `item-${item.urn || item.name}`,
        data: dragPayload,
    })

    const canDelete = item.source === 'draft' ? !!onDeleteDraft : (item.source === 'user' || item.source === 'workspace') ? !!onUninstall : false
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        if (item.source === 'draft') {
            onDeleteDraft?.(item)
        } else {
            onUninstall?.(item)
        }
    }

    return (
        <HoverableCard item={item}>
            <div
                ref={setNodeRef}
                {...listeners}
                {...attributes}
                className={`package-card ${isDragging ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''}`}
                onClick={() => onSelect(item)}
            >
                <PackageCardHeader
                    icon={primitiveKindIcon(item.kind)}
                    name={item.name}
                    dragHandle
                    trailing={
                        <>
                            {item.source ? <span className={`source-badge ${item.source}`}>{sourceLabel(item.source)}</span> : undefined}
                            {skillSyncLabel(item) ? <span className={`primitive-sync-badge primitive-sync-badge--${item.github?.sync?.state}`}>{skillSyncLabel(item)}</span> : undefined}
                            {item.source === 'draft' && (item.kind === 'instruction' || item.kind === 'skill') && onEditDraft && (
                                <button
                                    className="package-card__edit-btn"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEditDraft(item) }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    title="Edit draft"
                                >
                                    <Pencil size={11} />
                                </button>
                            )}
                            {canDelete && (
                                <button
                                    className="package-card__delete-btn"
                                    onClick={handleDelete}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    title={item.source === 'draft' ? 'Delete draft' : 'Uninstall'}
                                >
                                    <Trash2 size={11} />
                                </button>
                            )}
                        </>
                    }
                />
                <div className="package-card__author">{item.author}</div>
                <div className="package-card__desc">{item.description || 'No description provided.'}</div>
                {skillSyncLabel(item) ? (
                    <div className="package-card__desc">{item.github?.sync?.message || skillSyncLabel(item)}</div>
                ) : null}
                {agentMcpSummary(item) ? (
                    <div className="package-card__desc">{agentMcpSummary(item)}</div>
                ) : null}
            </div>
        </HoverableCard>
    )
}

// ── DraggableModel ──────────────────────────────────────

export function DraggableModel({
    model,
    selected,
    onSelect,
}: {
    model: RuntimeModelCatalogEntry
    selected: boolean
    onSelect: PackagePanelHandler
}) {
    const dragPayload = useMemo(() => buildModelDragPayload(model), [model])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `model-${model.provider}-${model.id}`,
        data: dragPayload,
    })

    const modelItem: ModelPanelItem = { ...model, kind: 'model', name: model.name || model.id }

    return (
        <HoverableCard item={modelItem}>
            <div
                ref={setNodeRef}
                {...listeners}
                {...attributes}
                className={`package-card model-card ${isDragging ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''}`}
                onClick={() => onSelect(modelItem)}
            >
                <PackageCardHeader
                    icon={primitiveKindIcon('model')}
                    name={model.name || model.id}
                    dragHandle
                />
                <div className="package-card__author">{model.providerName}</div>
                <div className="package-card__desc">
                    {model.context ? `Ctx: ${Math.round(model.context / 1000)}k` : ''}
                    {model.connected ? ' • Ready' : ' • Not Configured'}
                </div>
            </div>
        </HoverableCard>
    )
}

// ── DraggableMcp ────────────────────────────────────────

export function DraggableMcp({
    mcp,
    selected,
    onSelect,
    onEdit,
    onDelete,
}: {
    mcp: McpServerSummary
    selected: boolean
    onSelect: PackagePanelHandler
    onEdit?: PackagePanelHandler
    onDelete?: PackagePanelHandler
}) {
    const dragPayload = useMemo(() => buildMcpDragPayload(mcp), [mcp])
    const dragDisabled = mcp.defined === false
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `mcp-${mcp.name}`,
        data: dragPayload,
        disabled: dragDisabled,
    })

    const mcpItem: McpPanelItem = { ...mcp, kind: 'mcp' }

    return (
        <HoverableCard item={mcpItem}>
            <div
                ref={setNodeRef}
                {...listeners}
                {...attributes}
                className={`package-card mcp-card ${isDragging ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''}`}
                onClick={() => onSelect(mcpItem)}
            >
                <PackageCardHeader
                    icon={primitiveKindIcon('mcp')}
                    name={mcp.name}
                    dragHandle
                    trailing={
                        <>
                            {onEdit ? (
                                <button
                                    className="package-card__edit-btn"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(mcpItem) }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    title="Edit server"
                                >
                                    <Pencil size={11} />
                                </button>
                            ) : null}
                            {onDelete ? (
                                <button
                                    className="package-card__delete-btn"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(mcpItem) }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    title="Remove server"
                                >
                                    <Trash2 size={11} />
                                </button>
                            ) : null}
                        </>
                    }
                />
                <div className="package-card__author">
                    <span className={`package-mcp-editor__status-dot package-mcp-editor__status-dot--${mcp.status || 'disconnected'}`} style={{ display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} />
                    {mcp.status}
                    {mcp.configType ? ` · ${mcp.configType}` : ''}
                </div>
                <div className="package-card__desc">
                    {dragDisabled ? 'Save this server before dragging.' : 'Drag onto an Agent to enable it there.'}
                </div>
            </div>
        </HoverableCard>
    )
}
