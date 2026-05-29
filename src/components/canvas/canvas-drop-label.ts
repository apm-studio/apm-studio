export function getCanvasDropLabel(activeKind: string | undefined) {
    if (activeKind !== 'agent') {
        return null
    }

    return 'Drop to add this agent to the current workspace'
}
