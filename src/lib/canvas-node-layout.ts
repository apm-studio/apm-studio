import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../shared/workspace-contracts'
import {
    TEAM_DEFAULT_EXPANDED_HEIGHT,
    TEAM_DEFAULT_WIDTH,
} from './team-layout'
import {
    AGENT_DEFAULT_HEIGHT,
    AGENT_DEFAULT_WIDTH,
} from './agents-node'

const DEFAULT_RECT_PADDING = 32
const DEFAULT_FALLBACK_MARGIN = 60
const DEFAULT_CLUSTER_GAP_X = 48
const DEFAULT_CLUSTER_GAP_Y = 40
const DEFAULT_TEAM_CLUSTER_GAP = 56
const MAX_SEARCH_RADIUS = 12

export interface CanvasRect {
    x: number
    y: number
    width: number
    height: number
}

function resolveAnchorPosition(input: {
    canvasCenter: { x: number; y: number } | null
    width: number
    height: number
    fallbackCenter?: { x: number; y: number }
    centerOffset?: { x: number; y: number }
}) {
    const anchor = input.canvasCenter || input.fallbackCenter || {
        x: (input.width / 2) + DEFAULT_FALLBACK_MARGIN,
        y: (input.height / 2) + DEFAULT_FALLBACK_MARGIN,
    }
    const centerOffset = input.centerOffset || { x: 0, y: 0 }

    return {
        x: Math.round(anchor.x + centerOffset.x - (input.width / 2)),
        y: Math.round(anchor.y + centerOffset.y - (input.height / 2)),
    }
}

function overlaps(left: CanvasRect, right: CanvasRect, padding = DEFAULT_RECT_PADDING) {
    return !(
        left.x + left.width + padding <= right.x
        || right.x + right.width + padding <= left.x
        || left.y + left.height + padding <= right.y
        || right.y + right.height + padding <= left.y
    )
}

function buildCandidateOffsets(radius: number) {
    if (radius === 0) {
        return [{ col: 0, row: 0 }]
    }

    const entries: Array<{ col: number; row: number }> = []
    for (let row = -radius; row <= radius; row += 1) {
        for (let col = -radius; col <= radius; col += 1) {
            if (Math.max(Math.abs(col), Math.abs(row)) !== radius) continue
            entries.push({ col, row })
        }
    }

    return entries.sort((left, right) => {
        const leftScore = Math.abs(left.col) + Math.abs(left.row)
        const rightScore = Math.abs(right.col) + Math.abs(right.row)
        if (leftScore !== rightScore) return leftScore - rightScore
        if (Math.abs(left.row) !== Math.abs(right.row)) return Math.abs(left.row) - Math.abs(right.row)
        if (left.row !== right.row) return left.row - right.row
        return left.col - right.col
    })
}

export function collectVisibleCanvasNodeRects(
    agents: WorkspaceAgentNode[],
    teams: WorkspaceTeamSnapshot[],
): CanvasRect[] {
    const agentRects = agents
        .filter((agent) => agent.hidden !== true)
        .map((agent) => ({
            x: agent.position.x,
            y: agent.position.y,
            width: agent.width || AGENT_DEFAULT_WIDTH,
            height: agent.height || AGENT_DEFAULT_HEIGHT,
        }))

    const teamRects = teams
        .filter((team) => team.hidden !== true)
        .map((team) => ({
            x: team.position.x,
            y: team.position.y,
            width: team.width || TEAM_DEFAULT_WIDTH,
            height: team.height || TEAM_DEFAULT_EXPANDED_HEIGHT,
        }))

    return [...agentRects, ...teamRects]
}

export function resolveCanvasNodeSpawnPosition(input: {
    canvasCenter: { x: number; y: number } | null
    occupiedRects: CanvasRect[]
    width: number
    height: number
    fallbackCenter?: { x: number; y: number }
    centerOffset?: { x: number; y: number }
    padding?: number
}) {
    const base = resolveAnchorPosition(input)
    const stepX = input.width + DEFAULT_RECT_PADDING
    const stepY = input.height + DEFAULT_RECT_PADDING
    const padding = input.padding ?? DEFAULT_RECT_PADDING

    for (let radius = 0; radius <= MAX_SEARCH_RADIUS; radius += 1) {
        for (const offset of buildCandidateOffsets(radius)) {
            const candidate = {
                x: base.x + (offset.col * stepX),
                y: base.y + (offset.row * stepY),
                width: input.width,
                height: input.height,
            }
            if (!input.occupiedRects.some((rect) => overlaps(candidate, rect, padding))) {
                return { x: candidate.x, y: candidate.y }
            }
        }
    }

    return { x: base.x, y: base.y }
}

export function resolveTeamCreationClusterLayout(input: {
    canvasCenter: { x: number; y: number } | null
    occupiedRects: CanvasRect[]
    agentIds: string[]
    agentWidth?: number
    agentHeight?: number
    teamWidth?: number
    teamHeight?: number
}) {
    const agentWidth = input.agentWidth || AGENT_DEFAULT_WIDTH
    const agentHeight = input.agentHeight || AGENT_DEFAULT_HEIGHT
    const teamWidth = input.teamWidth || TEAM_DEFAULT_WIDTH
    const teamHeight = input.teamHeight || TEAM_DEFAULT_EXPANDED_HEIGHT
    const agentCount = input.agentIds.length

    const columns = agentCount <= 1 ? agentCount : Math.min(3, Math.ceil(Math.sqrt(agentCount)))
    const rows = agentCount === 0 ? 0 : Math.ceil(agentCount / columns)
    const agentGridWidth = agentCount === 0
        ? 0
        : (columns * agentWidth) + ((columns - 1) * DEFAULT_CLUSTER_GAP_X)
    const agentGridHeight = agentCount === 0
        ? 0
        : (rows * agentHeight) + ((rows - 1) * DEFAULT_CLUSTER_GAP_Y)
    const teamGap = agentCount > 0 ? DEFAULT_TEAM_CLUSTER_GAP : 0
    const clusterWidth = Math.max(teamWidth, agentGridWidth)
    const clusterHeight = agentGridHeight + teamGap + teamHeight
    const clusterOrigin = resolveCanvasNodeSpawnPosition({
        canvasCenter: input.canvasCenter,
        occupiedRects: input.occupiedRects,
        width: clusterWidth,
        height: clusterHeight,
    })

    const agentPositions = new Map<string, { x: number; y: number }>()
    for (let row = 0; row < rows; row += 1) {
        const rowStartIndex = row * columns
        const rowIds = input.agentIds.slice(rowStartIndex, rowStartIndex + columns)
        const rowWidth = (rowIds.length * agentWidth) + ((rowIds.length - 1) * DEFAULT_CLUSTER_GAP_X)
        const rowX = clusterOrigin.x + Math.round((clusterWidth - rowWidth) / 2)
        const rowY = clusterOrigin.y + (row * (agentHeight + DEFAULT_CLUSTER_GAP_Y))

        rowIds.forEach((agentId, index) => {
            agentPositions.set(agentId, {
                x: rowX + (index * (agentWidth + DEFAULT_CLUSTER_GAP_X)),
                y: rowY,
            })
        })
    }

    return {
        teamPosition: {
            x: clusterOrigin.x + Math.round((clusterWidth - teamWidth) / 2),
            y: clusterOrigin.y + agentGridHeight + teamGap,
        },
        agentPositions,
    }
}
