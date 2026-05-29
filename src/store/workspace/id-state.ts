export const agentIdCounter = { value: 0 }
export const markdownEditorIdCounter = { value: 0 }
export const canvasTerminalIdCounter = { value: 0 }

export function makeWorkspaceNodeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
