import crypto from 'crypto'
import path from 'path'
import type {
    ApmPackageManifest,
} from '../../shared/apm-contracts.js'
import type {
    RegistryCatalogResponse,
    RegistryImportListingResponse,
    RegistryListing,
    RegistryListingKind,
    RegistryListingResponse,
    RegistryPresetListResponse,
    RegistryPresetResponse,
    RegistryTargetId,
} from '../../shared/registry-contracts.js'
import { writeApmPackage } from './apm-package-service.js'
import { manifestPath, packageDir, toPosixPath } from './apm-package/paths.js'

const DEFAULT_REGISTRY_URL = 'https://registry.apm.studio'

type CatalogQuery = {
    q?: string
    kind?: RegistryListingKind
    target?: RegistryTargetId
    tag?: string
    limit?: number
    cursor?: string
}

type CodexTomlAgent = {
    name?: string
    description?: string
    model?: string
    model_reasoning_effort?: string
    developer_instructions?: string
}

function registryBaseUrl() {
    return (process.env.APM_STUDIO_REGISTRY_URL || DEFAULT_REGISTRY_URL).replace(/\/+$/, '')
}

function registryUrl(pathname: string, params?: Record<string, string | number | undefined>) {
    const url = new URL(`${registryBaseUrl()}${pathname}`)
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && `${value}`.trim()) {
            url.searchParams.set(key, `${value}`)
        }
    })
    return url
}

async function fetchJson<T>(url: URL): Promise<T> {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`APM Registry request failed with HTTP ${response.status}.`)
    }
    return await response.json() as T
}

function assertGithubPath(source: RegistryListing['source']) {
    if (source.type !== 'github' || !source.repo || !source.ref || !source.path) {
        throw new Error('Registry listing must reference a GitHub file path.')
    }
    if (source.path.startsWith('/') || source.path.includes('..') || source.path.includes('\\')) {
        throw new Error('Registry listing contains an unsafe GitHub source path.')
    }
}

function rawGithubUrl(source: RegistryListing['source']) {
    assertGithubPath(source)
    return new URL(`https://raw.githubusercontent.com/${source.repo}/${source.ref}/${source.path}`)
}

async function fetchGithubSource(source: RegistryListing['source']) {
    const response = await fetch(rawGithubUrl(source))
    if (!response.ok) {
        throw new Error(`GitHub source fetch failed with HTTP ${response.status}.`)
    }
    return await response.text()
}

function unquoteTomlString(value: string) {
    const trimmed = value.trim()
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            return JSON.parse(trimmed) as string
        } catch {
            return trimmed.slice(1, -1)
        }
    }
    return trimmed
}

function parseCodexTomlAgent(source: string): CodexTomlAgent {
    const result: CodexTomlAgent = {}
    const lines = source.replace(/\r\n/g, '\n').split('\n')

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/)
        if (!match) continue

        const key = match[1] as keyof CodexTomlAgent
        if (!['name', 'description', 'model', 'model_reasoning_effort', 'developer_instructions'].includes(key)) {
            continue
        }

        let value = match[2].trim()
        if (value.startsWith('"""')) {
            value = value.slice(3)
            const block: string[] = []
            if (value.endsWith('"""')) {
                block.push(value.slice(0, -3))
            } else {
                if (value) block.push(value)
                index += 1
                while (index < lines.length) {
                    const nextLine = lines[index]
                    const end = nextLine.indexOf('"""')
                    if (end >= 0) {
                        block.push(nextLine.slice(0, end))
                        break
                    }
                    block.push(nextLine)
                    index += 1
                }
            }
            result[key] = block.join('\n').trim()
            continue
        }

        result[key] = unquoteTomlString(value)
    }

    return result
}

function slugify(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'agent'
}

function packageIdForListing(listing: RegistryListing) {
    const hash = crypto
        .createHash('sha1')
        .update(`${listing.source.repo}:${listing.source.ref}:${listing.source.path || ''}:${listing.id}`)
        .digest('hex')
        .slice(0, 8)
    return `${slugify(listing.slug || listing.name)}-${hash}`
}

function modelSelection(modelId: string | undefined) {
    const raw = modelId?.trim() || 'gpt-5.4'
    if (raw.includes('/')) {
        const [provider, ...rest] = raw.split('/')
        return { provider, modelId: rest.join('/') || raw }
    }
    return { provider: 'openai', modelId: raw }
}

function buildCodexTomlManifest(listing: RegistryListing, rawSource: string): ApmPackageManifest {
    const parsed = parseCodexTomlAgent(rawSource)
    const packageId = packageIdForListing(listing)
    const agentName = parsed.name || listing.name
    const instruction = parsed.developer_instructions || listing.description || listing.summary
    const model = modelSelection(parsed.model)

    return {
        name: slugify(agentName),
        version: '0.1.0',
        type: 'hybrid',
        includes: 'auto',
        description: parsed.description || listing.summary,
        license: listing.license,
        agents: [{
            id: packageId,
            name: agentName,
            model,
            instruction: {
                source: 'inline',
                content: instruction,
            },
            source: {
                type: 'github',
                repo: listing.source.repo,
                ref: listing.source.ref,
                path: listing.source.path,
            },
        }],
        instructions: [],
        skills: [],
        dependencies: {
            apm: [],
            mcp: [],
        },
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: 'agent',
            agent: {
                agentNodeId: packageId,
                agentName,
                model,
                modelVariant: parsed.model_reasoning_effort
                    ? `reasoning-${parsed.model_reasoning_effort}`
                    : null,
                agentBody: instruction,
                instructionRef: null,
                skillRefs: [],
                mcpServerNames: [],
                agentId: null,
                planMode: false,
                derivedFrom: `registry:${listing.id}`,
            },
        },
    }
}

export async function searchExploreCatalog(query: CatalogQuery): Promise<RegistryCatalogResponse> {
    return fetchJson<RegistryCatalogResponse>(registryUrl('/v1/catalog', {
        q: query.q,
        kind: query.kind,
        target: query.target,
        tag: query.tag,
        limit: query.limit || 20,
        cursor: query.cursor,
    }))
}

export async function listExplorePresets(): Promise<RegistryPresetListResponse> {
    return fetchJson<RegistryPresetListResponse>(registryUrl('/v1/presets'))
}

export async function readExplorePreset(idOrSlug: string): Promise<RegistryPresetResponse> {
    return fetchJson<RegistryPresetResponse>(registryUrl(`/v1/presets/${encodeURIComponent(idOrSlug)}`))
}

export async function readExploreListing(idOrSlug: string): Promise<RegistryListingResponse> {
    return fetchJson<RegistryListingResponse>(registryUrl(`/v1/listings/${encodeURIComponent(idOrSlug)}`))
}

export async function importExploreListing(
    workingDir: string,
    listingId: string,
): Promise<RegistryImportListingResponse> {
    const { listing } = await readExploreListing(listingId)
    if (listing.importRecipe.format !== 'codex-toml') {
        throw new Error(`Import format '${listing.importRecipe.format}' is not implemented yet.`)
    }

    const rawSource = await fetchGithubSource(listing.source)
    const manifest = buildCodexTomlManifest(listing, rawSource)
    const packageId = manifest['x-apm']?.packageId || packageIdForListing(listing)
    const written = await writeApmPackage(workingDir, packageId, manifest)

    return {
        ok: true,
        listing,
        packageId: written.packageId,
        packagePath: toPosixPath(path.relative(workingDir, packageDir(workingDir, written.packageId))),
        manifestPath: toPosixPath(path.relative(workingDir, manifestPath(workingDir, written.packageId))),
    }
}
