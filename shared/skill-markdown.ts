export type SkillMarkdownMeta = {
    name: string
    description: string
    tags: string[]
    license?: string
    compatibility?: string
    metadata?: Record<string, string>
    allowedTools?: string
    content: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function unquoteYamlScalar(value: string) {
    const trimmed = value.trim()
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

function parseInlineArray(value: string) {
    const trimmed = value.trim()
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
        return null
    }
    return trimmed.slice(1, -1)
        .split(',')
        .map((entry) => unquoteYamlScalar(entry))
        .filter(Boolean)
}

function parseInlineObject(value: string) {
    const trimmed = value.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        return null
    }
    try {
        const parsed = JSON.parse(trimmed) as unknown
        return isRecord(parsed) ? parsed : null
    } catch {
        return null
    }
}

function parseSimpleFrontmatter(raw: string) {
    const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/)
    if (lines[0]?.trim() !== '---') {
        return { data: {} as Record<string, unknown>, content: raw }
    }
    const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (endIndex < 0) {
        return { data: {} as Record<string, unknown>, content: raw }
    }
    const data: Record<string, unknown> = {}
    let activeObjectKey: string | null = null
    for (const line of lines.slice(1, endIndex)) {
        const nestedMatch = line.match(/^\s{2,}([^:]+):\s*(.*)$/)
        if (nestedMatch && activeObjectKey) {
            const target = isRecord(data[activeObjectKey]) ? data[activeObjectKey] as Record<string, string> : {}
            target[nestedMatch[1].trim()] = unquoteYamlScalar(nestedMatch[2])
            data[activeObjectKey] = target
            continue
        }
        const match = line.match(/^([^:#]+):\s*(.*)$/)
        if (!match) continue
        const key = match[1].trim()
        const rawValue = match[2]
        if (!rawValue.trim()) {
            activeObjectKey = key
            data[key] = {}
            continue
        }
        activeObjectKey = null
        data[key] = parseInlineArray(rawValue) || parseInlineObject(rawValue) || unquoteYamlScalar(rawValue)
    }
    return {
        data,
        content: lines.slice(endIndex + 1).join('\n'),
    }
}

export function extractSkillTags(metadata?: Record<string, unknown>): string[] {
    if (!metadata) return []
    const tagFields = ['tags', 'tag', 'keywords', 'keyword', 'category']
    const seen = new Set<string>()
    const result: string[] = []
    for (const field of tagFields) {
        const value = metadata[field]
        const items = Array.isArray(value)
            ? value.filter((entry): entry is string => typeof entry === 'string')
            : typeof value === 'string'
                ? value.split(',').map((entry) => entry.trim()).filter(Boolean)
                : []
        for (const item of items) {
            const normalized = item.toLowerCase().trim()
            if (normalized && !seen.has(normalized)) {
                seen.add(normalized)
                result.push(normalized)
            }
        }
    }
    return result
}

export function parseSkillMarkdown(raw: string): SkillMarkdownMeta {
    const { data, content } = parseSimpleFrontmatter(raw)
    if (!isNonEmptyString(data.name)) {
        throw new Error("SKILL.md frontmatter must include a non-empty 'name' field")
    }
    if (!isNonEmptyString(data.description)) {
        throw new Error("SKILL.md frontmatter must include a non-empty 'description' field")
    }
    const metadata = isRecord(data.metadata)
        ? Object.fromEntries(
            Object.entries(data.metadata)
                .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        )
        : undefined
    const allowedTools = typeof data['allowed-tools'] === 'string'
        ? data['allowed-tools']
        : Array.isArray(data['allowed-tools'])
            ? data['allowed-tools'].filter((entry): entry is string => typeof entry === 'string').join(', ') || undefined
            : undefined
    return {
        name: data.name,
        description: data.description,
        content: content.trim(),
        tags: extractSkillTags(metadata),
        ...(typeof data.license === 'string' ? { license: data.license } : {}),
        ...(typeof data.compatibility === 'string' ? { compatibility: data.compatibility } : {}),
        ...(metadata ? { metadata } : {}),
        ...(allowedTools ? { allowedTools } : {}),
    }
}
