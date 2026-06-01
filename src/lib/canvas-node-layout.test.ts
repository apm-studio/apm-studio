import { describe, expect, it } from 'vitest'
import {
    collectVisibleCanvasNodeRects,
    resolveTeamCreationClusterLayout,
    resolveCanvasNodeSpawnPosition,
} from './canvas-node-layout'

function overlaps(
    left: { x: number; y: number; width: number; height: number },
    right: { x: number; y: number; width: number; height: number },
    padding = 0,
) {
    return !(
        left.x + left.width + padding <= right.x
        || right.x + right.width + padding <= left.x
        || left.y + left.height + padding <= right.y
        || right.y + right.height + padding <= left.y
    )
}

describe('resolveCanvasNodeSpawnPosition', () => {
    it('avoids overlapping visible agent and team windows', () => {
        const occupiedRects = collectVisibleCanvasNodeRects(
            [{
                id: 'agent-1',
                name: 'Researcher',
                position: { x: 840, y: 500 },
                width: 320,
                height: 400,
                scope: 'shared',
                model: null,
                skillRefs: [],
                mcpServerNames: [],
            }],
            [{
                id: 'team-1',
                name: 'Review Flow',
                position: { x: 1200, y: 480 },
                width: 640,
                height: 800,
                participants: {},
                relations: [],
                createdAt: Date.now(),
            }],
        )

        const next = resolveCanvasNodeSpawnPosition({
            canvasCenter: { x: 1000, y: 700 },
            occupiedRects,
            width: 320,
            height: 400,
        })

        expect(overlaps(
            { x: next.x, y: next.y, width: 320, height: 400 },
            occupiedRects[0],
            1,
        )).toBe(false)
        expect(overlaps(
            { x: next.x, y: next.y, width: 320, height: 400 },
            occupiedRects[1],
            1,
        )).toBe(false)
    })
})

describe('resolveTeamCreationClusterLayout', () => {
    it('places the team below a centered agent grid without overlap', () => {
        const layout = resolveTeamCreationClusterLayout({
            canvasCenter: { x: 1000, y: 700 },
            occupiedRects: [],
            agentIds: ['agent-1', 'agent-2', 'agent-3'],
        })

        const agents = Array.from(layout.agentPositions.values()).map((position) => ({
            x: position.x,
            y: position.y,
            width: 320,
            height: 400,
        }))
        const team = {
            x: layout.teamPosition.x,
            y: layout.teamPosition.y,
            width: 640,
            height: 800,
        }

        expect(agents).toHaveLength(3)
        expect(agents.every((agent) => agent.y < team.y)).toBe(true)
        expect(overlaps(agents[0], agents[1], 1)).toBe(false)
        expect(overlaps(agents[1], agents[2], 1)).toBe(false)
        expect(agents.every((agent) => overlaps(agent, team, 1) === false)).toBe(true)
    })
})
