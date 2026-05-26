import { Hexagon, Zap, Cpu, Server, Package, MessageSquare, Workflow } from 'lucide-react'
import { useStudioStore } from './store'
import type { StudioState } from './store'
import { api } from './api'
import { resolveFocusTarget, resolveSplitDropIntent, SPLIT_VIEW_MAX_PANES } from './lib/focus-utils'
import { loadPerformerImportContext, normalizeImportedPerformerAsset } from './lib/performer-import'
import { showToast } from './lib/toast'
import { extractMcpServerNamesFromConfig } from '../shared/mcp-config'
import { resolvePerformerMcpPortability } from '../shared/performer-mcp-portability'
import {
    toDragPreview,
    isInstalledAsset,
    getAssetAuthor,
    getAssetSlug,
    applyAssetToPerformerTarget,
    isSplitPaneDrag,
    isSplitViewNodeDrag,
} from './lib/dnd-handlers'
import type { DragAsset, DropTargetData, PerformerAssetPayload } from './lib/dnd-handlers'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'

export { toDragPreview }
export type { DragAsset }

type McpConfigEntryLike = {
    command?: string | string[]
    url?: string
}

type DraftConfigLike = Record<string, unknown>

function markdownContentFromAssetDetail(detail: { content?: string }) {
    return typeof detail.content === 'string' ? detail.content : ''
}

export function getDragIcon(kind: string) {
    switch (kind) {
        case 'tal': return <Hexagon size={12} className="asset-icon tal" />
        case 'dance': return <Zap size={12} className="asset-icon dance" />
        case 'model': return <Cpu size={12} className="asset-icon model" />
        case 'mcp': return <Server size={12} className="asset-icon mcp" />
        case 'act': return <Workflow size={12} className="asset-icon act" />
        case 'performer': return <Package size={12} className="asset-icon performer" />
        case 'workspace-performer': return <MessageSquare size={12} className="asset-icon performer" />
        case 'workspace-act': return <Workflow size={12} className="asset-icon act" />
        default: return <Package size={12} />
    }
}

function dragEndClientPoint(event: DragEndEvent) {
    const activatorEvent = event.activatorEvent
    if ('clientX' in activatorEvent && 'clientY' in activatorEvent) {
        const pointerEvent = activatorEvent as MouseEvent
        return {
            x: pointerEvent.clientX + event.delta.x,
            y: pointerEvent.clientY + event.delta.y,
        }
    }

    if ('touches' in activatorEvent && (activatorEvent as TouchEvent).touches.length > 0) {
        const touch = (activatorEvent as TouchEvent).touches[0]
        return {
            x: touch.clientX + event.delta.x,
            y: touch.clientY + event.delta.y,
        }
    }

    if ('changedTouches' in activatorEvent && (activatorEvent as TouchEvent).changedTouches.length > 0) {
        const touch = (activatorEvent as TouchEvent).changedTouches[0]
        return {
            x: touch.clientX + event.delta.x,
            y: touch.clientY + event.delta.y,
        }
    }

    return null
}

function resolveSplitDropPoint(event: DragEndEvent, store: StudioState, asset: DragAsset) {
    if (typeof document === 'undefined') {
        return null
    }

    const point = dragEndClientPoint(event)
    const shell = document.querySelector('.canvas-flow-shell')
    if (!point || !shell) {
        return null
    }

    const rect = shell.getBoundingClientRect()
    if (
        point.x < rect.left
        || point.x > rect.right
        || point.y < rect.top
        || point.y > rect.bottom
    ) {
        return null
    }

    const viewportSize = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
    }

    if (store.viewMode === 'full') {
        return {
            paneId: null,
            targetIndex: null,
            placement: null,
            viewportSize,
        }
    }

    const localPoint = {
        x: point.x - rect.left,
        y: point.y - rect.top,
    }
    const alreadyOpenPane = store.splitView.panes.find((pane) => pane.nodeId === asset.nodeId && pane.type === asset.nodeType) || null
    const isReordering = isSplitPaneDrag(asset)
    const canPlaceAtEdge = store.splitView.panes.length < SPLIT_VIEW_MAX_PANES || !!alreadyOpenPane || isReordering
    const intent = resolveSplitDropIntent({
        point: localPoint,
        panes: store.splitView.panes,
        viewportSize,
        rows: store.splitView.rows,
        rowWeights: store.splitView.rowWeights,
        columnWeights: store.splitView.columnWeights,
        canPlaceAtEdge,
    })
    if (!intent) {
        return null
    }

    return {
        paneId: intent.paneId,
        targetIndex: intent.targetIndex,
        placement: intent.placement,
        viewportSize,
    }
}

export async function loadMarkdownTemplateIntoEditor(
    editorId: string,
    asset: DragAsset,
    store: StudioState,
) {
    const editor = store.markdownEditors.find((item) => item.id === editorId)
    if (!editor) {
        throw new Error('Editor not found.')
    }
    if (editor.kind !== asset.kind) {
        throw new Error(`${editor.kind === 'tal' ? 'Instruction' : 'Skill'} editor only accepts matching assets.`)
    }

    const isLocalInstalled = isInstalledAsset(asset)
    const detail = !isLocalInstalled
        ? await api.assets.getRegistry(asset.kind as 'tal' | 'dance', getAssetAuthor(asset), getAssetSlug(asset))
        : await api.assets.get(asset.kind as 'tal' | 'dance', getAssetAuthor(asset), getAssetSlug(asset))

    const currentDraft = store.drafts[editor.draftId]
    if (!currentDraft) {
        throw new Error('Editor draft not found.')
    }

    store.upsertDraft({
        ...currentDraft,
        name: detail.name || asset.name || currentDraft.name,
        slug: detail.slug || asset.slug || asset.name,
        description: detail.description || detail.name || asset.name,
        tags: Array.isArray(detail.tags) ? detail.tags : [],
        content: markdownContentFromAssetDetail(detail),
        derivedFrom: detail.urn || asset.urn || undefined,
        updatedAt: Date.now(),
    })
    store.updateMarkdownEditorBaseline(editor.id, {
        name: detail.name || asset.name || currentDraft.name,
        slug: detail.slug || asset.slug || asset.name,
        description: detail.description || detail.name || asset.name,
        tags: Array.isArray(detail.tags) ? detail.tags : [],
        content: markdownContentFromAssetDetail(detail),
    })
    store.selectMarkdownEditor(editor.id)
    showToast(`Loaded ${asset.kind} template into the editor.`, 'success')
}

export async function resolvePerformerAssetForStudio(
    asset: DragAsset,
    showDropWarning: (message: string) => void,
): Promise<PerformerAssetPayload> {
    const context = await loadPerformerImportContext()
    const normalized = normalizeImportedPerformerAsset(asset, context)
    if (!normalized.model && normalized.modelPlaceholder) {
        showDropWarning(`Model ${normalized.modelPlaceholder.provider}/${normalized.modelPlaceholder.modelId} is not available in this Studio runtime. A placeholder was kept so you can pick a replacement.`)
    }
    const portability = (
        Array.isArray(asset.declaredMcpServerNames)
        && Array.isArray(asset.matchedMcpServerNames)
        && Array.isArray(asset.missingMcpServerNames)
    )
        ? {
            declaredMcpServerNames: asset.declaredMcpServerNames,
            matchedMcpServerNames: asset.matchedMcpServerNames,
            missingMcpServerNames: asset.missingMcpServerNames,
        }
        : resolvePerformerMcpPortability(asset.mcpConfig, context.availableMcpServerNames)

    const declaredMcpNames = portability.declaredMcpServerNames.length > 0
        ? portability.declaredMcpServerNames
        : extractMcpServerNamesFromConfig(asset.mcpConfig)
    const unresolvedMcpNames = declaredMcpNames.filter((name) => !(normalized.mcpBindingMap?.[name] || '').trim())

    if (portability.matchedMcpServerNames.length > 0) {
        showToast(
            `Imported performer found matching Studio MCP names: ${portability.matchedMcpServerNames.join(', ')}. Review the performer binding after import.`,
            'info',
            {
                title: 'Matching MCP names found',
                dedupeKey: `performer-import-mcp-match:${asset.urn || asset.name}:${portability.matchedMcpServerNames.join(',')}`,
                durationMs: 5000,
            },
        )
    }
    if (unresolvedMcpNames.length > 0) {
        const mcpConfig = (asset.mcpConfig && typeof asset.mcpConfig === 'object')
            ? asset.mcpConfig as Record<string, McpConfigEntryLike>
            : {}
        const details = unresolvedMcpNames.map((name) => {
            const cfg = mcpConfig[name]
            if (cfg && cfg.command) {
                const cmd = Array.isArray(cfg.command) ? cfg.command.join(' ') : String(cfg.command)
                return `• ${name} (local: ${cmd})`
            }
            if (cfg && cfg.url) {
                return `• ${name} (remote: ${cfg.url})`
            }
            return `• ${name}`
        }).join('\n')
        showToast(
            `This performer requires MCP servers that are not yet in the Studio MCP library:\n${details}\n\nAdd them in Packages → MCP.`,
            'warning',
            {
                title: 'MCP servers required',
                dedupeKey: `performer-import-mcp-missing:${asset.urn || asset.name}`,
                durationMs: 8000,
            },
        )
    }
    return normalized as PerformerAssetPayload
}

export function createDragStartHandler(
    setActiveDrag: (drag: { kind: string; label: string } | null) => void,
) {
    return (event: DragStartEvent) => {
        setActiveDrag(toDragPreview((event.active.data.current as DragAsset | undefined) || {}))
    }
}

export function createDragEndHandler(
    setActiveDrag: (drag: null) => void,
    showDropWarning: (message: string) => void,
) {
    return async (event: DragEndEvent) => {
        setActiveDrag(null)
        const { active, over } = event

        const asset = active.data.current as DragAsset
        const dropData = over?.data.current as DropTargetData | undefined

        if (!asset) {
            return
        }

        const store = useStudioStore.getState()

        const handleSplitViewNodeDrop = () => {
            if (!isSplitViewNodeDrag(asset) || (store.viewMode !== 'full' && store.viewMode !== 'split')) {
                return false
            }

            const dropPoint = resolveSplitDropPoint(event, store, asset)
            if (!dropPoint) {
                return false
            }

            const alreadyOpenPane = store.viewMode === 'split'
                ? store.splitView.panes.find((pane) => pane.nodeId === asset.nodeId && pane.type === asset.nodeType) || null
                : null

            if (store.viewMode === 'full') {
                const currentTarget = resolveFocusTarget(store.focusSnapshot)
                if (currentTarget && currentTarget.id === asset.nodeId && currentTarget.type === asset.nodeType) {
                    return true
                }
                store.addSplitViewPane(asset.nodeId, asset.nodeType, dropPoint.viewportSize)
                return true
            }

            if (isSplitPaneDrag(asset)) {
                if (dropPoint.targetIndex === null) {
                    store.setSplitViewActivePane(asset.nodeId, asset.nodeType)
                    return true
                }

                if (!dropPoint.placement) {
                    return true
                }
                store.moveSplitViewPane(asset.paneId, dropPoint.placement, dropPoint.viewportSize)
                return true
            }

            if (dropPoint.targetIndex !== null) {
                if (alreadyOpenPane) {
                    if (!dropPoint.placement) {
                        return true
                    }
                    store.moveSplitViewPane(alreadyOpenPane.paneId, dropPoint.placement, dropPoint.viewportSize)
                    return true
                }

                if (store.splitView.panes.length < SPLIT_VIEW_MAX_PANES) {
                    store.insertSplitViewPane(asset.nodeId, asset.nodeType, dropPoint.placement || dropPoint.targetIndex, dropPoint.viewportSize)
                    return true
                }

                if (dropPoint.paneId) {
                    store.replaceSplitViewPane(dropPoint.paneId, asset.nodeId, asset.nodeType, dropPoint.viewportSize)
                    return true
                }

                showDropWarning(`Split View supports up to ${SPLIT_VIEW_MAX_PANES} panes.`)
                return true
            }

            if (alreadyOpenPane) {
                store.setSplitViewActivePane(asset.nodeId, asset.nodeType)
                return true
            }

            if (store.splitView.panes.length >= SPLIT_VIEW_MAX_PANES) {
                showDropWarning(`Split View supports up to ${SPLIT_VIEW_MAX_PANES} panes. Drop onto an existing slot to replace it.`)
                return true
            }

            store.addSplitViewPane(asset.nodeId, asset.nodeType, dropPoint.viewportSize)
            return true
        }

        if (handleSplitViewNodeDrop()) {
            return
        }

        if (!dropData) {
            return
        }

        const handleCanvasRootDrop = async () => {
            if (dropData.type !== 'canvas-root') {
                return false
            }

            if (isSplitViewNodeDrag(asset)) {
                return false
            }

            if (asset.kind === 'performer') {
                // Draft performer: create from draft content
                if (asset.source === 'draft' && asset.draftContent) {
                    const cfg = asset.draftContent as DraftConfigLike
                    store.addPerformerFromDraft(asset.name || 'Draft Agent', cfg, asset.description || undefined)
                    return true
                }
                store.addPerformerFromAsset(await resolvePerformerAssetForStudio(asset, showDropWarning))
                return true
            }

            if (asset.kind === 'act') {
                // Draft act: create from draft content
                if (asset.source === 'draft' && asset.draftContent) {
                    const cfg = asset.draftContent as DraftConfigLike
                    store.importActFromDraft(asset.name || 'Draft Team', cfg)
                    return true
                }
                await store.importActFromAsset(asset as import('./types').AssetCard)
                return true
            }

            return false
        }

        const handleMarkdownEditorDrop = async () => {
            if (dropData.type !== 'markdown-editor' || (asset.kind !== 'tal' && asset.kind !== 'dance') || !dropData.editorId) {
                return false
            }

            try {
                await loadMarkdownTemplateIntoEditor(dropData.editorId, asset, store)
            } catch (error) {
                console.error('Failed to load markdown template', error)
                showToast('Failed to load asset template into the editor.', 'error', {
                    title: 'Template import failed',
                    dedupeKey: `markdown-template-import:${dropData.editorId}:${asset.kind}:${asset.slug || asset.name}`,
                    actionLabel: 'Retry',
                    onAction: () => {
                        void loadMarkdownTemplateIntoEditor(dropData.editorId as string, asset, useStudioStore.getState()).catch((retryError) => {
                            console.error('Failed to retry markdown template load', retryError)
                        })
                    },
                })
            }
            return true
        }

        if (await handleCanvasRootDrop()) {
            return
        }

        if (await handleMarkdownEditorDrop()) {
            return
        }

        // Standalone performer drops
        if (dropData.performerId) {
            await applyAssetToPerformerTarget(
                store,
                dropData.performerId,
                dropData.type,
                asset,
                showDropWarning,
                (a) => resolvePerformerAssetForStudio(a, showDropWarning),
            )
        }
    }
}
