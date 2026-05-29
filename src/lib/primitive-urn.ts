export type ParsedStudioPrimitiveUrn = {
    kind: string
    author: string
    path: string
    name: string
}

export function parseStudioPrimitiveUrn(urn: string): ParsedStudioPrimitiveUrn | null {
    const parts = String(urn || '').trim().split('/').filter(Boolean)
    if (parts.length < 4 || !parts[1]?.startsWith('@')) {
        return null
    }
    const [kind, owner, collection, ...nameParts] = parts
    const name = nameParts.join('/')
    if (!kind || !owner || !collection || !name) return null
    return {
        kind,
        author: owner,
        path: `${collection}/${name}`,
        name,
    }
}

export function primitiveUrnDisplayName(urn: string): string {
    return parseStudioPrimitiveUrn(urn)?.name || urn.split('/').pop() || urn
}

export function primitiveUrnAuthor(urn: string): string | null {
    return parseStudioPrimitiveUrn(urn)?.author || null
}

export function primitiveUrnPath(urn: string): string | null {
    return parseStudioPrimitiveUrn(urn)?.path || null
}
