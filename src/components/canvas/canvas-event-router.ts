import type { Edge, Node } from '@xyflow/react'
import type { WorkspaceSlice } from '../../store/workspace/types'

type EditingTargetLike = WorkspaceSlice['editingTarget'] | undefined

export type CanvasDragStopResult =
    | { kind: 'markdownEditor'; id: string; x: number; y: number }
    | { kind: 'canvasTerminal'; id: string; x: number; y: number }
    | { kind: 'team'; id: string; x: number; y: number }
    | { kind: 'agent'; id: string; x: number; y: number }

export type CanvasNodeClickResult =
    | { kind: 'ignore' }
    | { kind: 'markdownEditor'; id: string }
    | { kind: 'canvasTerminal' }
    | { kind: 'team'; id: string }
    | { kind: 'agent'; id: string; shouldCloseEditor: boolean }

function roundedPosition(node: Pick<Node, 'position'>) {
    return {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
    }
}

export function shouldIgnoreCanvasInteractiveClick(target: EventTarget | null) {
    return target instanceof HTMLElement && !!target.closest('.canvas-drag-handle--interactive')
}

export function resolveCanvasDragStop(node: Pick<Node, 'id' | 'position' | 'type'>): CanvasDragStopResult {
    const position = roundedPosition(node)

    if (node.type === 'markdownEditor') {
        return { kind: 'markdownEditor', id: node.id, ...position }
    }

    if (node.type === 'canvasTerminal') {
        return { kind: 'canvasTerminal', id: node.id, ...position }
    }

    if (node.type === 'team') {
        return { kind: 'team', id: node.id, ...position }
    }

    return { kind: 'agent', id: node.id, ...position }
}

export function resolveCanvasNodeClick(
    node: Pick<Node, 'id' | 'type'>,
    target: EventTarget | null,
    editingTarget: EditingTargetLike,
): CanvasNodeClickResult {
    if (shouldIgnoreCanvasInteractiveClick(target)) {
        return { kind: 'ignore' }
    }

    if (node.type === 'markdownEditor') {
        return { kind: 'markdownEditor', id: node.id }
    }

    if (node.type === 'canvasTerminal') {
        return { kind: 'canvasTerminal' }
    }

    if (node.type === 'team') {
        return { kind: 'team', id: node.id }
    }

    return {
        kind: 'agent',
        id: node.id,
        shouldCloseEditor: !!(editingTarget && !(editingTarget.type === 'agent' && editingTarget.id === node.id)),
    }
}

export function resolveCanvasEdgeClick(edge: Pick<Edge, 'id'>) {
    // Edges on main canvas represent Team relations — edge.id format: rel:{teamId}:{relationId}
    if (edge.id.startsWith('rel:')) {
        const parts = edge.id.split(':')
        return parts.length >= 3 ? parts.slice(2).join(':') : edge.id
    }

    return edge.id
}
