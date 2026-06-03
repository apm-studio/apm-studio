import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import type { ApmGitHubSourceCatalogId } from '../../../shared/apm-contracts.js'

type GitHubTreeItem = {
    path?: unknown
    type?: unknown
}

type GitHubTreeResponse = {
    tree?: GitHubTreeItem[]
}

type GitHubRepoResponse = {
    default_branch?: unknown
    stargazers_count?: unknown
    html_url?: unknown
}

export type SourceAdapter = {
    id: ApmGitHubSourceCatalogId
    name: string
    owner: string
    repo: string
    href: string
    kind: 'agents' | 'skills' | 'preset'
    stars?: number
}

export type GitHubRepoMetadata = {
    defaultBranch: string
    stars?: number
    href: string
}

const REPO_METADATA_TTL_MS = 5 * 60_000
const TREE_TTL_MS = 2 * 60_000
const RAW_TEXT_TTL_MS = 2 * 60_000
const MAX_TREE_TARBALL_BYTES = 32 * 1024 * 1024
const MAX_RAW_TEXT_CACHE_CHARS = 1024 * 1024
const MAX_RAW_TEXT_CACHE_ENTRIES = 400
const REPO_METADATA_CACHE = new Map<string, { cachedAt: number; value: GitHubRepoMetadata }>()
const TREE_CACHE = new Map<string, { cachedAt: number; value: string[] }>()
const TREE_IN_FLIGHT = new Map<string, Promise<string[]>>()
const RAW_TEXT_CACHE = new Map<string, { cachedAt: number; value: string }>()
const RAW_TEXT_IN_FLIGHT = new Map<string, Promise<string>>()
const gunzipAsync = promisify(gunzip)

export const SOURCE_ADAPTERS: SourceAdapter[] = [
    {
        id: 'anthropic-skills',
        name: 'Anthropic Skills',
        owner: 'anthropics',
        repo: 'skills',
        href: 'https://github.com/anthropics/skills',
        kind: 'preset',
    },
    {
        id: 'addy-agent-skills',
        name: 'Addy Agent Skills',
        owner: 'addyosmani',
        repo: 'agent-skills',
        href: 'https://github.com/addyosmani/agent-skills',
        kind: 'preset',
    },
    {
        id: 'wshobson-agents',
        name: 'wshobson Agents',
        owner: 'wshobson',
        repo: 'agents',
        href: 'https://github.com/wshobson/agents',
        kind: 'preset',
    },
    {
        id: 'vercel-agent-skills',
        name: 'Vercel Agent Skills',
        owner: 'vercel-labs',
        repo: 'agent-skills',
        href: 'https://github.com/vercel-labs/agent-skills',
        kind: 'preset',
    },
    {
        id: 'awesome-claude-code-subagents',
        name: 'Claude Subagents',
        owner: 'VoltAgent',
        repo: 'awesome-claude-code-subagents',
        href: 'https://github.com/VoltAgent/awesome-claude-code-subagents',
        kind: 'agents',
    },
    {
        id: 'awesome-codex-subagents',
        name: 'Codex Subagents',
        owner: 'VoltAgent',
        repo: 'awesome-codex-subagents',
        href: 'https://github.com/VoltAgent/awesome-codex-subagents',
        kind: 'agents',
    },
    {
        id: 'disler-hooks-mastery',
        name: 'Hooks Mastery',
        owner: 'disler',
        repo: 'claude-code-hooks-mastery',
        href: 'https://github.com/disler/claude-code-hooks-mastery',
        kind: 'preset',
    },
    {
        id: 'claude-spellbook',
        name: 'Claude Spellbook',
        owner: 'kid-sid',
        repo: 'claude-spellbook',
        href: 'https://github.com/kid-sid/claude-spellbook',
        kind: 'preset',
    },
    {
        id: 'copilot-assets',
        name: 'Copilot Assets',
        owner: 'PlagueHO',
        repo: 'github-copilot-assets-library',
        href: 'https://github.com/PlagueHO/github-copilot-assets-library',
        kind: 'preset',
    },
    {
        id: 'superclaude-plugin',
        name: 'SuperClaude Plugin',
        owner: 'SuperClaude-Org',
        repo: 'SuperClaude_Plugin',
        href: 'https://github.com/SuperClaude-Org/SuperClaude_Plugin',
        kind: 'preset',
    },
    {
        id: 'cursor-prompts',
        name: 'Cursor Prompts',
        owner: 'DVC2',
        repo: 'cursor_prompts',
        href: 'https://github.com/DVC2/cursor_prompts',
        kind: 'preset',
    },
    {
        id: 'windsurf-antigravity-rules',
        name: 'Windsurf Rules',
        owner: 'kinopeee',
        repo: 'windsurf-antigravity-rules',
        href: 'https://github.com/kinopeee/windsurf-antigravity-rules',
        kind: 'preset',
    },
]

export function normalizeRepoPath(value: string | null | undefined) {
    if (!value) return ''
    return value
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .join('/')
}

function githubHeaders() {
    return {
        Accept: 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    }
}

async function fetchGithubJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: githubHeaders() })
    if (!response.ok) {
        throw new Error(`GitHub request failed with HTTP ${response.status}.`)
    }
    return await response.json() as T
}

function cachedValue<T>(cache: Map<string, { cachedAt: number; value: T }>, key: string, ttlMs: number) {
    const cached = cache.get(key)
    if (cached && Date.now() - cached.cachedAt < ttlMs) {
        return cached.value
    }
    if (cached) cache.delete(key)
    return null
}

function rememberRawText(key: string, value: string) {
    if (value.length > MAX_RAW_TEXT_CACHE_CHARS) return
    RAW_TEXT_CACHE.set(key, { cachedAt: Date.now(), value })
    while (RAW_TEXT_CACHE.size > MAX_RAW_TEXT_CACHE_ENTRIES) {
        const oldestKey = RAW_TEXT_CACHE.keys().next().value
        if (!oldestKey) break
        RAW_TEXT_CACHE.delete(oldestKey)
    }
}

async function fetchGithubTextUncached(repo: string, ref: string, sourcePath: string) {
    const encodedPath = sourcePath.split('/').map((segment) => encodeURIComponent(segment)).join('/')
    const response = await fetch(`https://raw.githubusercontent.com/${repo}/${ref}/${encodedPath}`)
    if (!response.ok) {
        throw new Error(`GitHub source fetch failed for ${sourcePath} with HTTP ${response.status}.`)
    }
    return await response.text()
}

export async function fetchGithubText(repo: string, ref: string, sourcePath: string) {
    const key = `${repo}:${ref}:${normalizeRepoPath(sourcePath)}`
    const cached = cachedValue(RAW_TEXT_CACHE, key, RAW_TEXT_TTL_MS)
    if (cached !== null) return cached

    const inFlight = RAW_TEXT_IN_FLIGHT.get(key)
    if (inFlight) return inFlight

    const request = fetchGithubTextUncached(repo, ref, sourcePath)
        .then((value) => {
            rememberRawText(key, value)
            return value
        })
        .finally(() => {
            RAW_TEXT_IN_FLIGHT.delete(key)
        })
    RAW_TEXT_IN_FLIGHT.set(key, request)
    return request
}

export async function fetchGithubRawText(owner: string, repo: string, ref: string, sourcePath: string) {
    return fetchGithubText(`${owner}/${repo}`, ref, sourcePath)
}

export async function fetchRepoMetadata(owner: string, repo: string, fallback?: SourceAdapter): Promise<GitHubRepoMetadata> {
    const key = `${owner}/${repo}`.toLowerCase()
    const cached = REPO_METADATA_CACHE.get(key)
    if (cached && Date.now() - cached.cachedAt < REPO_METADATA_TTL_MS) {
        return cached.value
    }

    try {
        const response = await fetchGithubJson<GitHubRepoResponse>(`https://api.github.com/repos/${owner}/${repo}`)
        const value: GitHubRepoMetadata = {
            defaultBranch: typeof response.default_branch === 'string' && response.default_branch.trim()
                ? response.default_branch.trim()
                : 'HEAD',
            href: typeof response.html_url === 'string' && response.html_url.trim()
                ? response.html_url.trim()
                : fallback?.href || `https://github.com/${owner}/${repo}`,
            ...(typeof response.stargazers_count === 'number'
                ? { stars: response.stargazers_count }
                : (typeof fallback?.stars === 'number' ? { stars: fallback.stars } : {})),
        }
        REPO_METADATA_CACHE.set(key, { cachedAt: Date.now(), value })
        return value
    } catch {
        const value: GitHubRepoMetadata = {
            defaultBranch: 'HEAD',
            href: fallback?.href || `https://github.com/${owner}/${repo}`,
            ...(typeof fallback?.stars === 'number' ? { stars: fallback.stars } : {}),
        }
        REPO_METADATA_CACHE.set(key, { cachedAt: Date.now(), value })
        return value
    }
}

function normalizeTreePaths(tree: GitHubTreeItem[] | undefined) {
    return (tree || [])
        .filter((entry) => entry.type === 'blob' && typeof entry.path === 'string')
        .map((entry) => normalizeRepoPath(entry.path as string))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
}

function readTarString(buffer: Buffer, offset: number, length: number) {
    const slice = buffer.subarray(offset, offset + length)
    const nullIndex = slice.indexOf(0)
    return slice.subarray(0, nullIndex >= 0 ? nullIndex : undefined).toString('utf-8').trim()
}

function listTarballBlobPaths(buffer: Buffer) {
    const paths = new Set<string>()
    let offset = 0

    while (offset + 512 <= buffer.length) {
        const header = buffer.subarray(offset, offset + 512)
        if (header.every((byte) => byte === 0)) break

        const name = readTarString(header, 0, 100)
        const size = Number.parseInt(readTarString(header, 124, 12) || '0', 8) || 0
        const typeflag = String.fromCharCode(header[156] || 0).replace('\0', '')
        const prefix = readTarString(header, 345, 155)
        const fullPath = normalizeRepoPath(prefix ? `${prefix}/${name}` : name)
        const sourcePath = fullPath.split('/').slice(1).join('/')

        if (sourcePath && (!typeflag || typeflag === '0')) {
            paths.add(sourcePath)
        }

        offset += 512 + Math.ceil(size / 512) * 512
    }

    return [...paths].sort((left, right) => left.localeCompare(right))
}

async function fetchTreeFromTarball(owner: string, repo: string, ref: string) {
    const response = await fetch(`https://codeload.github.com/${owner}/${repo}/tar.gz/${encodeURIComponent(ref)}`, {
        headers: { Accept: 'application/x-gzip' },
    })
    if (!response.ok) {
        throw new Error(`GitHub tarball request failed with HTTP ${response.status}.`)
    }

    const length = Number(response.headers.get('content-length') || '0')
    if (length > MAX_TREE_TARBALL_BYTES) {
        throw new Error('GitHub tarball is too large to inspect without the GitHub API.')
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > MAX_TREE_TARBALL_BYTES) {
        throw new Error('GitHub tarball is too large to inspect without the GitHub API.')
    }

    return listTarballBlobPaths(await gunzipAsync(bytes))
}

async function fetchTreeUncached(owner: string, repo: string, ref: string) {
    try {
        const response = await fetchGithubJson<GitHubTreeResponse>(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
        )
        return normalizeTreePaths(response.tree)
    } catch (error) {
        try {
            return await fetchTreeFromTarball(owner, repo, ref)
        } catch {
            throw error
        }
    }
}

export async function fetchTree(owner: string, repo: string, ref: string) {
    const key = `${owner}/${repo}:${ref}`.toLowerCase()
    const cached = cachedValue(TREE_CACHE, key, TREE_TTL_MS)
    if (cached) return cached

    const inFlight = TREE_IN_FLIGHT.get(key)
    if (inFlight) return inFlight

    const request = fetchTreeUncached(owner, repo, ref)
        .then((value) => {
            TREE_CACHE.set(key, { cachedAt: Date.now(), value })
            return value
        })
        .finally(() => {
            TREE_IN_FLIGHT.delete(key)
        })
    TREE_IN_FLIGHT.set(key, request)
    return request
}

export function clearGithubSourceCaches() {
    REPO_METADATA_CACHE.clear()
    TREE_CACHE.clear()
    TREE_IN_FLIGHT.clear()
    RAW_TEXT_CACHE.clear()
    RAW_TEXT_IN_FLIGHT.clear()
}
