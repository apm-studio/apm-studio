export function getDanceSlashMatch(input: string, activeCommand: string | null) {
    const trimmed = input.trimStart()
    if (!trimmed.startsWith('/')) return null
    if (trimmed === '/undo' || trimmed === '/redo') return null

    if (trimmed.startsWith('/dance')) {
        const trailing = trimmed.slice('/dance'.length)
        if (trailing.length > 0 && !trailing.startsWith(' ')) return null
        return trailing.trim().toLowerCase()
    }

    if (activeCommand === '/dance') {
        const trailing = trimmed.slice('/'.length)
        return trailing.trim().toLowerCase()
    }

    return trimmed.slice('/'.length).trim().toLowerCase()
}
