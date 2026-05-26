export function getCanvasDropLabel(activeKind: string | undefined) {
    if (activeKind !== 'performer') {
        return null
    }

    return 'Drop to add this agent to the current stage'
}
