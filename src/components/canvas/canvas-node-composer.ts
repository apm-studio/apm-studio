import type { Node } from '@xyflow/react'

export function composeCanvasNodes(args: {
    agentNodes: Node[]
    markdownEditorNodes: Node[]
    canvasTerminalNodes: Node[]
    teamNodes: Node[]
}) {
    return [
        ...args.agentNodes,
        ...args.markdownEditorNodes,
        ...args.canvasTerminalNodes,
        ...args.teamNodes,
    ]
}
