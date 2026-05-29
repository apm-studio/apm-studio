import type {
    WorkspaceCanvasTerminalNode,
    WorkspaceMarkdownEditorNode,
    WorkspaceAgentNode,
} from '../../../shared/workspace-contracts'

export function normalizePath(dir: string): string {
    return dir.trim().replace(/\/+$/, '')
}

export function getMaxAgentCounter(agents: Array<{ id: string }>): number {
    return agents.reduce((max, agent) => {
        const match = agent.id.match(/^agent-(\d+)$/)
        if (!match) {
            return max
        }
        return Math.max(max, Number.parseInt(match[1], 10))
    }, 0)
}

export function getMaxMarkdownEditorCounter(editors: Array<{ id: string }>): number {
    return editors.reduce((max, editor) => {
        const match = editor.id.match(/^markdown-editor-(\d+)$/)
        if (!match) {
            return max
        }
        return Math.max(max, Number.parseInt(match[1], 10))
    }, 0)
}

export function defaultMarkdownContent(kind: 'instruction' | 'skill') {
    return kind === 'instruction' ? '' : ''
}

const SPAWN_STACK_OFFSETS = [
    { x: 0, y: 0 },
    { x: 36, y: 28 },
    { x: 72, y: 56 },
    { x: 108, y: 84 },
    { x: -36, y: 28 },
    { x: 36, y: -28 },
]

export function resolveCanvasSpawnPosition(input: {
    canvasCenter: { x: number; y: number } | null
    existingCount: number
    width: number
    height: number
    fallbackCenter?: { x: number; y: number }
    centerOffset?: { x: number; y: number }
}) {
    const anchor = input.canvasCenter || input.fallbackCenter || {
        x: (input.width / 2) + 60,
        y: (input.height / 2) + 60,
    }
    const offset = SPAWN_STACK_OFFSETS[Math.max(0, input.existingCount) % SPAWN_STACK_OFFSETS.length] || SPAWN_STACK_OFFSETS[0]
    const centerOffset = input.centerOffset || { x: 0, y: 0 }

    return {
        x: Math.round(anchor.x + centerOffset.x - (input.width / 2) + offset.x),
        y: Math.round(anchor.y + centerOffset.y - (input.height / 2) + offset.y),
    }
}

export function resolveCanvasCenterPosition(
    canvasElement: HTMLDivElement,
    screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number },
) {
    const rect = canvasElement.getBoundingClientRect()
    const center = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    })

    return {
        x: Math.round(center.x),
        y: Math.round(center.y),
    }
}

type AgentPatch = Partial<Omit<WorkspaceAgentNode, 'meta'>> & {
    meta?: Partial<NonNullable<WorkspaceAgentNode['meta']>>
}

export function applyAgentPatch<T extends AgentPatch>(agent: WorkspaceAgentNode, patch: T): WorkspaceAgentNode {
    const mutatesSourceIdentity = (
        'name' in patch
        || 'instructionRef' in patch
        || 'skillRefs' in patch
        || 'model' in patch
        || 'modelPlaceholder' in patch
        || 'mcpServerNames' in patch
        || 'declaredMcpConfig' in patch
    ) && (patch.meta?.sourceBindingUrn === undefined)

    const next = {
        ...agent,
        ...patch,
    }
    if (mutatesSourceIdentity) {
        next.meta = {
            ...agent.meta,
            ...patch.meta,
            sourceBindingUrn: null,
        }
    }
    return next
}

export function mapAgents(
    agents: WorkspaceAgentNode[],
    agentId: string,
    updater: (agent: WorkspaceAgentNode) => WorkspaceAgentNode,
): WorkspaceAgentNode[] {
    return agents.map((agent) => (
        agent.id === agentId
            ? updater(agent)
            : agent
    ))
}

export function mapCanvasTerminals(
    canvasTerminals: WorkspaceCanvasTerminalNode[],
    id: string,
    updater: (terminal: WorkspaceCanvasTerminalNode) => WorkspaceCanvasTerminalNode,
): WorkspaceCanvasTerminalNode[] {
    return canvasTerminals.map((terminal) => (
        terminal.id === id
            ? updater(terminal)
            : terminal
    ))
}

export function mapMarkdownEditors(
    markdownEditors: WorkspaceMarkdownEditorNode[],
    id: string,
    updater: (editor: WorkspaceMarkdownEditorNode) => WorkspaceMarkdownEditorNode,
): WorkspaceMarkdownEditorNode[] {
    return markdownEditors.map((editor) => (
        editor.id === id
            ? updater(editor)
            : editor
    ))
}

export function removeMarkdownEditorsByDraftIds(
    markdownEditors: WorkspaceMarkdownEditorNode[],
    draftIds: string[],
): WorkspaceMarkdownEditorNode[] {
    if (draftIds.length === 0) return markdownEditors
    const removed = new Set(draftIds)
    return markdownEditors.filter((editor) => !removed.has(editor.draftId))
}
