export function getSkillSlashMatch(input: string, activeCommand: string | null) {
    const trimmed = input.trimStart()
    if (!trimmed.startsWith('/')) return null
    if (trimmed === '/undo' || trimmed === '/redo') return null

    const skillCommand = trimmed.startsWith('/skill') ? '/skill' : null
    if (skillCommand) {
        const trailing = trimmed.slice(skillCommand.length)
        if (trailing.length > 0 && !trailing.startsWith(' ')) return null
        return trailing.trim().toLowerCase()
    }

    if (activeCommand === '/skill') {
        const trailing = trimmed.slice('/'.length)
        return trailing.trim().toLowerCase()
    }

    return trimmed.slice('/'.length).trim().toLowerCase()
}
