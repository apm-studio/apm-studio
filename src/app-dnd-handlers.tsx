import type { PrimitiveCard } from './lib/primitive-types'
import { Hexagon, Zap, Cpu, Server, Package, MessageSquare, Workflow } from 'lucide-react'
import { useStudioStore } from './store'
import type { AgentDraftContent, TeamDraftContent } from '../shared/draft-contracts'
import {
    toDragPreview,
    applyPrimitiveToAgentTarget,
    isSplitViewNodeDrag,
} from './lib/dnd-handlers'
import type { DragPrimitive, DropTargetData } from './lib/dnd-handlers'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { resolveApmPackageAgentPrimitive } from './app-dnd-apm-package'
import { resolveAgentPrimitiveForStudio } from './app-dnd-agent-resolver'
import { handleMarkdownEditorDrop } from './app-dnd-markdown'
import { handleSplitViewNodeDrop } from './app-dnd-split-view'

export { toDragPreview }
export type { DragPrimitive }

export function getDragIcon(kind: string) {
    switch (kind) {
        case 'instruction':
            return <Hexagon size={12} className="primitive-icon instruction" />
        case 'skill':
            return <Zap size={12} className="primitive-icon skill" />
        case 'model': return <Cpu size={12} className="primitive-icon model" />
        case 'mcp': return <Server size={12} className="primitive-icon mcp" />
        case 'team':
            return <Workflow size={12} className="primitive-icon team" />
        case 'agent':
            return <Package size={12} className="primitive-icon agent" />
        case 'apm-package': return <Package size={12} className="primitive-icon agent" />
        case 'workspace-agent': return <MessageSquare size={12} className="primitive-icon agent" />
        case 'workspace-team': return <Workflow size={12} className="primitive-icon team" />
        default: return <Package size={12} />
    }
}

export function createDragStartHandler(
    setActiveDrag: (drag: { kind: string; label: string } | null) => void,
) {
    return (event: DragStartEvent) => {
        setActiveDrag(toDragPreview((event.active.data.current as DragPrimitive | undefined) || {}))
    }
}

export function createDragEndHandler(
    setActiveDrag: (drag: null) => void,
    showDropWarning: (message: string) => void,
) {
    return async (event: DragEndEvent) => {
        setActiveDrag(null)
        const { active, over } = event

        const primitive = active.data.current as DragPrimitive
        const dropData = over?.data.current as DropTargetData | undefined

        if (!primitive) {
            return
        }

        const store = useStudioStore.getState()

        if (handleSplitViewNodeDrop(event, store, primitive, showDropWarning)) {
            return
        }

        if (!dropData) {
            return
        }

        const handleCanvasRootDrop = async () => {
            if (dropData.type !== 'canvas-root') {
                return false
            }

            if (isSplitViewNodeDrag(primitive)) {
                return false
            }

            if (primitive.kind === 'agent') {
                if (primitive.source === 'draft' && primitive.draftContent) {
                    const cfg = primitive.draftContent as AgentDraftContent
                    store.addAgentFromDraft(primitive.name || 'Draft Agent', cfg, primitive.description || undefined)
                    return true
                }
                store.addAgentFromPrimitive(await resolveAgentPrimitiveForStudio(primitive, showDropWarning))
                return true
            }

            if (primitive.kind === 'apm-package') {
                const packageAgent = await resolveApmPackageAgentPrimitive(primitive, showDropWarning)
                if (!packageAgent) {
                    return true
                }
                store.addAgentFromPrimitive(await resolveAgentPrimitiveForStudio(packageAgent, showDropWarning))
                return true
            }

            if (primitive.kind === 'team') {
                if (primitive.source === 'draft' && primitive.draftContent) {
                    const cfg = primitive.draftContent as TeamDraftContent
                    store.importTeamFromDraft(primitive.name || 'Draft Team', cfg)
                    return true
                }
                await store.importTeamFromPrimitive(primitive as PrimitiveCard)
                return true
            }

            return false
        }

        if (await handleCanvasRootDrop()) {
            return
        }

        if (await handleMarkdownEditorDrop(dropData, primitive, store)) {
            return
        }

        // Standalone agent drops
        if (dropData.agentId) {
            if (primitive.kind === 'apm-package') {
                const packageAgent = await resolveApmPackageAgentPrimitive(primitive, showDropWarning)
                if (packageAgent) {
                    store.applyAgentPrimitive(dropData.agentId, await resolveAgentPrimitiveForStudio(packageAgent, showDropWarning))
                }
                return
            }
            await applyPrimitiveToAgentTarget(
                store,
                dropData.agentId,
                dropData.type,
                primitive,
                showDropWarning,
                (a) => resolveAgentPrimitiveForStudio(a, showDropWarning),
            )
        }
    }
}
