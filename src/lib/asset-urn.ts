import { parseRosterAssetUrn } from '../../shared/roster-contracts'

export type ParsedStudioAssetUrn = {
    kind: string
    author: string
    path: string
    name: string
    stage: string | null
}

export function parseStudioAssetUrn(urn: string): ParsedStudioAssetUrn | null {
    try {
        const parsed = parseRosterAssetUrn(String(urn || '').trim())
        return {
            kind: parsed.kind,
            author: `@${parsed.owner}`,
            path: `${parsed.stage}/${parsed.name}`,
            name: parsed.name,
            stage: parsed.stage,
        }
    } catch {
        return null
    }
}

export function assetUrnDisplayName(urn: string): string {
    return parseStudioAssetUrn(urn)?.name || urn.split('/').pop() || urn
}

export function assetUrnAuthor(urn: string): string | null {
    return parseStudioAssetUrn(urn)?.author || null
}

export function assetUrnPath(urn: string): string | null {
    return parseStudioAssetUrn(urn)?.path || null
}
