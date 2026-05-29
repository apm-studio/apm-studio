import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import type {
    Edge } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
function resolveAgentNodeId(
    team: WorkspaceTeamSnapshot,
    participantKey: string,
    agents: WorkspaceAgentNode[],
): string | null {
    const binding = team.participants[participantKey]
    if (!binding) return null
    const ref = binding.agentRef
    if (ref.kind === 'draft') return ref.draftId || null
    return agents.find((agent) => agent.meta?.derivedFrom === ref.urn)?.id || null
}

/**
 * Pick source/target handles based on relative node positions.
 * Source handles: top, right, bottom, left
 * Target handles: top-target, right-target, bottom-target, left-target
 */
function pickHandles(
    srcPos: { x: number; y: number },
    tgtPos: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
    const dx = tgtPos.x - srcPos.x
    const dy = tgtPos.y - srcPos.y

    if (Math.abs(dx) >= Math.abs(dy)) {
        // Target is mostly horizontal
        return dx >= 0
            ? { sourceHandle: 'right', targetHandle: 'left' }
            : { sourceHandle: 'left', targetHandle: 'right' }
    } else {
        // Target is mostly vertical
        return dy >= 0
            ? { sourceHandle: 'bottom', targetHandle: 'top' }
            : { sourceHandle: 'top', targetHandle: 'bottom' }
    }
}

const PAIR_OFFSET = 50

function buildRelationEdges(
    teams: WorkspaceTeamSnapshot[],
    agents: WorkspaceAgentNode[],
    posMap: Map<string, { x: number; y: number }>,
): Edge[] {
    const edges: Edge[] = []
    const pairTotals = new Map<string, number>()
    const pairCounts = new Map<string, number>()

    // First pass: count totals per pair
    for (const team of teams) {
        for (const relation of team.relations) {
            const s = resolveAgentNodeId(team, relation.between[0], agents)
            const t = resolveAgentNodeId(team, relation.between[1], agents)
            if (!s || !t) continue
            const key = [s, t].sort().join(':')
            pairTotals.set(key, (pairTotals.get(key) || 0) + 1)
        }
    }

    // Second pass: build edges
    for (const team of teams) {
        for (const relation of team.relations) {
            const sourceId = resolveAgentNodeId(team, relation.between[0], agents)
            const targetId = resolveAgentNodeId(team, relation.between[1], agents)
            if (!sourceId || !targetId) continue

            const pairKey = [sourceId, targetId].sort().join(':')
            const idx = pairCounts.get(pairKey) || 0
            pairCounts.set(pairKey, idx + 1)
            const total = pairTotals.get(pairKey) || 1

            // Compute offset for parallel edges
            let offset = 0
            if (total === 2) {
                offset = idx === 0 ? -PAIR_OFFSET : PAIR_OFFSET
            } else if (total > 2) {
                const center = (total - 1) / 2
                offset = (idx - center) * PAIR_OFFSET
            }

            // Pick handles based on relative position
            const srcPos = posMap.get(sourceId)
            const tgtPos = posMap.get(targetId)
            const handles = srcPos && tgtPos
                ? pickHandles(srcPos, tgtPos)
                : { sourceHandle: 'right', targetHandle: 'left-target' }

            const isOneWay = relation.direction === 'one-way'

            edges.push({
                id: `rel:${team.id}:${relation.id}`,
                source: sourceId,
                target: targetId,
                sourceHandle: handles.sourceHandle,
                targetHandle: handles.targetHandle,
                type: 'offsetBezier',
                animated: isOneWay,
                data: { offset },
                label: relation.name || undefined,
                ...(isOneWay ? {
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        width: 16,
                        height: 16,
                        color: 'var(--info, #58f)',
                    },
                } : {
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        width: 12,
                        height: 12,
                        color: 'var(--accent)',
                    },
                    markerStart: {
                        type: MarkerType.ArrowClosed,
                        width: 12,
                        height: 12,
                        color: 'var(--accent)',
                    },
                }),
                style: {
                    stroke: isOneWay ? 'var(--info, #58f)' : 'var(--accent)',
                    strokeWidth: isOneWay ? 2 : 1.5,
                    strokeDasharray: isOneWay ? '6 3' : undefined,
                },
            })
        }
    }

    return edges
}

export function composeCanvasEdges(
    teams: WorkspaceTeamSnapshot[],
    editingTeamId: string | null,
    agents?: WorkspaceAgentNode[],
) {
    if (!editingTeamId) return []
    const editingTeam = teams.find((team) => team.id === editingTeamId)
    if (!editingTeam) return []

    const posMap = new Map<string, { x: number; y: number }>()
    if (agents) {
        for (const p of agents) {
            posMap.set(p.id, p.position)
        }
    }

    return buildRelationEdges([editingTeam], agents || [], posMap)
}
