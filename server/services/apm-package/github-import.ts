import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import type {
    ApmGitHubImportCandidate,
    ApmGitHubImportPackage,
    ApmGitHubImportPreviewResponse,
    ApmGitHubImportRequest,
    ApmGitHubImportResponse,
    ApmGitHubSourceAsset,
    ApmGitHubSourceCatalogId,
    ApmGitHubSourceCatalogRequest,
    ApmGitHubSourceCatalogResponse,
    ApmGitHubSourceCatalogSource,
    ApmPackageManifest,
} from '../../../shared/apm-contracts.js'
import { parseSource } from '../../lib/apm-asset-source.js'
import { getGlobalStudioCwd } from '../../lib/apm-studio-paths.js'
import { MANIFEST_FILE, packageDir, manifestPath, toPosixPath } from './paths.js'
import { writeApmPackage } from './repository.js'
import { parseYamlRecord } from './yaml-io.js'

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

type AgentCandidate = {
    adapter: 'codex-toml' | 'claude-md'
    name: string
    description: string
    instruction: string
    sourcePath: string
    model?: string | null
    modelVariant?: string | null
    tools?: string[]
}

type ImportCandidate = ApmGitHubImportCandidate & {
    manifest: ApmPackageManifest
    copyFiles: Array<{
        sourcePath: string
        targetPath: string
    }>
}

type SourceAdapter = {
    id: ApmGitHubSourceCatalogId
    name: string
    owner: string
    repo: string
    href: string
    kind: 'agents' | 'skills' | 'preset'
    stars?: number
}

type GitHubRepoMetadata = {
    defaultBranch: string
    stars?: number
    href: string
}

const DEFAULT_IMPORT_LIMIT = 24
const MAX_IMPORT_LIMIT = 100
const DEFAULT_CATALOG_LIMIT = 48
const MAX_CATALOG_LIMIT = 120
const REPO_METADATA_TTL_MS = 5 * 60_000
const MAX_TREE_TARBALL_BYTES = 32 * 1024 * 1024
const DEFAULT_STUDIO_MODEL = { provider: 'openai', modelId: 'gpt-5.4' }
const ALL_TARGET_LABELS = ['Codex', 'Gemini', 'Claude', 'OpenCode', 'Cursor', 'Windsurf', 'Copilot']
const ALL_TARGET_IDS = ['codex', 'gemini', 'claude', 'opencode', 'cursor', 'windsurf', 'copilot']
const REPO_METADATA_CACHE = new Map<string, { cachedAt: number; value: GitHubRepoMetadata }>()
const gunzipAsync = promisify(gunzip)
const SOURCE_ADAPTERS: SourceAdapter[] = [
    {
        id: 'awesome-copilot',
        name: 'Awesome Copilot',
        owner: 'github',
        repo: 'awesome-copilot',
        href: 'https://github.com/github/awesome-copilot',
        kind: 'preset',
        stars: 33_901,
    },
    {
        id: 'addy-agent-skills',
        name: 'Addy Agent Skills',
        owner: 'addyosmani',
        repo: 'agent-skills',
        href: 'https://github.com/addyosmani/agent-skills',
        kind: 'preset',
        stars: 46_358,
    },
    {
        id: 'vercel-agent-skills',
        name: 'Vercel Agent Skills',
        owner: 'vercel-labs',
        repo: 'agent-skills',
        href: 'https://github.com/vercel-labs/agent-skills',
        kind: 'preset',
        stars: 27_156,
    },
    {
        id: 'vercel-skills',
        name: 'Vercel Skills',
        owner: 'vercel-labs',
        repo: 'skills',
        href: 'https://github.com/vercel-labs/skills',
        kind: 'preset',
        stars: 20_238,
    },
    {
        id: 'microsoft-skills',
        name: 'Microsoft Skills',
        owner: 'microsoft',
        repo: 'skills',
        href: 'https://github.com/microsoft/skills',
        kind: 'preset',
        stars: 2_399,
    },
    {
        id: 'awesome-claude-code-subagents',
        name: 'Claude Code Subagents',
        owner: 'VoltAgent',
        repo: 'awesome-claude-code-subagents',
        href: 'https://github.com/VoltAgent/awesome-claude-code-subagents',
        kind: 'agents',
        stars: 20_615,
    },
    {
        id: 'microsoft-apm',
        name: 'Microsoft APM',
        owner: 'microsoft',
        repo: 'apm',
        href: 'https://github.com/microsoft/apm',
        kind: 'preset',
        stars: 2_612,
    },
    {
        id: 'awesome-agent-skills',
        name: 'Agent Skills Index',
        owner: 'VoltAgent',
        repo: 'awesome-agent-skills',
        href: 'https://github.com/VoltAgent/awesome-agent-skills',
        kind: 'skills',
    },
]

function normalizeRepoPath(value: string | null | undefined) {
    if (!value) return ''
    return value
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .join('/')
}

function slugify(value: string, fallback = 'agent') {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
    return slug || fallback
}

function packageIdForCandidate(repo: string, ref: string, candidate: AgentCandidate) {
    const hash = crypto
        .createHash('sha1')
        .update(`${repo}:${ref}:${candidate.sourcePath}:${candidate.adapter}`)
        .digest('hex')
        .slice(0, 8)
    return `${slugify(candidate.name)}-${hash}`
}

function packageIdForSource(repo: string, ref: string, sourcePath: string, name: string, format: string) {
    const hash = crypto
        .createHash('sha1')
        .update(`${repo}:${ref}:${sourcePath}:${format}`)
        .digest('hex')
        .slice(0, 8)
    return `${slugify(name, 'package')}-${hash}`
}

function candidateId(repo: string, ref: string, sourcePath: string, format: string) {
    return `github:${repo}:${ref}:${sourcePath}:${format}`
}

function importLimit(value: number | undefined) {
    if (!Number.isFinite(value || NaN)) return DEFAULT_IMPORT_LIMIT
    return Math.min(MAX_IMPORT_LIMIT, Math.max(1, Math.floor(value || DEFAULT_IMPORT_LIMIT)))
}

function catalogLimit(value: number | undefined) {
    if (!Number.isFinite(value || NaN)) return DEFAULT_CATALOG_LIMIT
    return Math.min(MAX_CATALOG_LIMIT, Math.max(1, Math.floor(value || DEFAULT_CATALOG_LIMIT)))
}

function uniqueStrings(values: Array<string | null | undefined>) {
    const seen = new Set<string>()
    const result: string[] = []
    for (const value of values) {
        const normalized = value?.trim()
        if (!normalized) continue
        const key = normalized.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        result.push(normalized)
    }
    return result
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

async function fetchGithubText(repo: string, ref: string, sourcePath: string) {
    const encodedPath = sourcePath.split('/').map((segment) => encodeURIComponent(segment)).join('/')
    const response = await fetch(`https://raw.githubusercontent.com/${repo}/${ref}/${encodedPath}`)
    if (!response.ok) {
        throw new Error(`GitHub source fetch failed for ${sourcePath} with HTTP ${response.status}.`)
    }
    return await response.text()
}

async function fetchGithubRawText(owner: string, repo: string, ref: string, sourcePath: string) {
    return fetchGithubText(`${owner}/${repo}`, ref, sourcePath)
}

async function fetchRepoMetadata(owner: string, repo: string, fallback?: SourceAdapter): Promise<GitHubRepoMetadata> {
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

async function fetchTree(owner: string, repo: string, ref: string) {
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

function pathIsInsideSubpath(filePath: string, subpath: string) {
    if (!subpath) return true
    return filePath === subpath || filePath.startsWith(`${subpath}/`)
}

function isReadmePath(filePath: string) {
    return /^readme\.md$/i.test(path.posix.basename(filePath))
}

function looksLikeClaudeAgentMarkdown(filePath: string, subpath: string) {
    if (!filePath.endsWith('.md') || isReadmePath(filePath)) return false
    if (subpath && filePath === subpath) return true
    return filePath.includes('.claude/agents/')
        || filePath.includes('/agents/')
        || filePath.includes('/subagents/')
        || filePath.startsWith('agents/')
        || filePath.startsWith('subagents/')
        || filePath.startsWith('categories/')
}

function parseInlineList(value: string) {
    return value
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
}

function parseFrontmatter(raw: string) {
    const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')
    if (lines[0]?.trim() !== '---') return null
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (end < 0) return null

    const data: Record<string, string | string[]> = {}
    for (const line of lines.slice(1, end)) {
        const match = line.match(/^([^:#]+):\s*(.*)$/)
        if (!match) continue
        const key = match[1].trim()
        const rawValue = match[2].trim()
        if (!rawValue) continue
        const unquoted = rawValue.replace(/^['"]|['"]$/g, '')
        data[key] = key === 'tools' ? parseInlineList(unquoted) : unquoted
    }

    return {
        data,
        content: lines.slice(end + 1).join('\n').trim(),
    }
}

function isApmManifestPath(sourcePath: string) {
    return /(^|\/)apm\.ya?ml$/i.test(sourcePath)
}

function looksLikeSkillMarkdown(sourcePath: string) {
    return /(^|\/)SKILL\.md$/i.test(sourcePath)
}

function looksLikeCodexTomlAgent(sourcePath: string, subpath: string) {
    if (!sourcePath.endsWith('.toml')) return false
    if (subpath && sourcePath === subpath) return true
    return sourcePath.includes('.codex/agents/')
        || sourcePath.startsWith('agents/')
        || sourcePath.includes('/agents/')
}

function looksLikeInstructionMarkdown(sourcePath: string, subpath: string) {
    if (!sourcePath.endsWith('.md') || isReadmePath(sourcePath) || looksLikeSkillMarkdown(sourcePath)) return false
    if (looksLikePromptMarkdown(sourcePath, subpath)) return false
    if (subpath && sourcePath === subpath) return true
    return sourcePath.includes('.github/instructions/')
        || sourcePath.startsWith('instructions/')
        || sourcePath.includes('/instructions/')
        || /\.instructions\.md$/i.test(sourcePath)
}

function looksLikePromptMarkdown(sourcePath: string, subpath: string) {
    if (!sourcePath.endsWith('.md') || isReadmePath(sourcePath) || looksLikeSkillMarkdown(sourcePath)) return false
    if (subpath && sourcePath === subpath) {
        return /\.prompt\.md$/i.test(sourcePath)
            || sourcePath.startsWith('prompts/')
            || sourcePath.includes('/prompts/')
    }
    return /\.prompt\.md$/i.test(sourcePath)
        || sourcePath.startsWith('prompts/')
        || sourcePath.includes('/prompts/')
}

function looksLikeMcpConfig(sourcePath: string, subpath: string) {
    const base = path.posix.basename(sourcePath).toLowerCase()
    if (subpath && sourcePath === subpath) return base.endsWith('.json')
    return base === 'mcp.json'
        || base === '.mcp.json'
        || base === 'mcp-servers.json'
        || sourcePath.endsWith('/.cursor/mcp.json')
        || sourcePath.endsWith('/.vscode/mcp.json')
}

function firstParagraph(raw: string, fallback: string) {
    const paragraph = raw
        .replace(/^---[\s\S]*?---/, '')
        .split(/\n\s*\n/)
        .map((entry) => entry.replace(/^#+\s*/, '').trim())
        .find(Boolean)
    return paragraph?.slice(0, 220) || fallback
}

function githubSource(repo: string, ref: string, sourcePath: string, format: string) {
    return {
        type: 'github',
        repo,
        ref,
        path: sourcePath,
        format,
    }
}

function sourceRootForManifest(sourcePath: string) {
    const dir = path.posix.dirname(sourcePath)
    return dir === '.' ? '' : dir
}

function parseClaudeAgentMarkdown(sourcePath: string, raw: string): AgentCandidate | null {
    const parsed = parseFrontmatter(raw)
    if (!parsed) return null
    const name = typeof parsed.data.name === 'string' ? parsed.data.name.trim() : ''
    const description = typeof parsed.data.description === 'string' ? parsed.data.description.trim() : ''
    const instruction = parsed.content.trim()
    if (!name || !description || !instruction) return null
    return {
        adapter: 'claude-md',
        name,
        description,
        instruction,
        sourcePath,
        model: typeof parsed.data.model === 'string' ? parsed.data.model.trim() : null,
        tools: Array.isArray(parsed.data.tools) ? parsed.data.tools : [],
    }
}

function categoryFromAgentPath(sourcePath: string) {
    const match = sourcePath.match(/^categories\/\d+-([^/]+)\//)
    return match ? match[1].replace(/-/g, ' ') : null
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

function parseCodexTomlAgent(sourcePath: string, raw: string): AgentCandidate | null {
    const result: Record<string, string> = {}
    const lines = raw.replace(/\r\n/g, '\n').split('\n')
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/)
        if (!match) continue
        const key = match[1]
        if (!['name', 'description', 'model', 'model_reasoning_effort', 'developer_instructions'].includes(key)) continue

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

    const name = result.name?.trim() || slugify(path.posix.basename(sourcePath, '.toml'))
    const instruction = result.developer_instructions?.trim()
    if (!name || !instruction) return null
    return {
        adapter: 'codex-toml',
        name,
        description: result.description?.trim() || `${name} Codex agent`,
        instruction,
        sourcePath,
        model: result.model?.trim() || null,
        modelVariant: result.model_reasoning_effort ? `reasoning-${result.model_reasoning_effort}` : null,
    }
}

function modelSelection(candidate: AgentCandidate) {
    if (candidate.adapter === 'codex-toml' && candidate.model?.includes('/')) {
        const [provider, ...rest] = candidate.model.split('/')
        return { provider, modelId: rest.join('/') || candidate.model }
    }
    if (candidate.adapter === 'codex-toml' && candidate.model) {
        return { provider: 'openai', modelId: candidate.model }
    }
    return DEFAULT_STUDIO_MODEL
}

function buildAgentManifest(repo: string, ref: string, candidate: AgentCandidate): ApmPackageManifest {
    const packageId = packageIdForCandidate(repo, ref, candidate)
    const model = modelSelection(candidate)
    return {
        name: slugify(candidate.name),
        version: '0.1.0',
        type: 'hybrid',
        includes: 'auto',
        target: ALL_TARGET_IDS,
        description: candidate.description,
        marketplace: { source: githubSource(repo, ref, candidate.sourcePath, candidate.adapter) },
        agents: [{
            id: packageId,
            name: candidate.name,
            model,
            instruction: {
                source: 'inline',
                content: candidate.instruction,
            },
            source: {
                type: 'github',
                repo,
                ref,
                path: candidate.sourcePath,
                adapter: candidate.adapter,
                ...(candidate.model ? { sourceModel: candidate.model } : {}),
                ...(candidate.tools?.length ? { tools: candidate.tools } : {}),
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
                agentName: candidate.name,
                model,
                modelVariant: candidate.modelVariant || null,
                agentBody: candidate.instruction,
                instructionRef: null,
                skillRefs: [],
                mcpServerNames: [],
                agentId: null,
                planMode: false,
                derivedFrom: `github:${repo}:${ref}:${candidate.sourcePath}`,
            },
        },
    }
}

function buildInstructionManifest(repo: string, ref: string, sourcePath: string, raw: string): ImportCandidate {
    const parsed = parseFrontmatter(raw)
    const name = slugify(
        (parsed?.data.name as string | undefined)
            || path.posix.basename(sourcePath, path.posix.extname(sourcePath)),
        'instruction',
    )
    const description = (parsed?.data.description as string | undefined)
        || firstParagraph(raw, `${name} instructions`)
    const packageId = packageIdForSource(repo, ref, sourcePath, name, 'instruction-md')
    const targetPath = `.apm/instructions/${name}.instructions.md`
    const manifest: ApmPackageManifest = {
        name,
        version: '0.1.0',
        type: 'instructions',
        includes: 'auto',
        target: ALL_TARGET_IDS,
        description,
        marketplace: { source: githubSource(repo, ref, sourcePath, 'instruction-md') },
        instructions: [{ path: targetPath }],
        dependencies: { apm: [], mcp: [] },
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: 'instruction',
        },
    }
    return {
        id: candidateId(repo, ref, sourcePath, 'instruction-md'),
        name,
        description,
        kind: 'instruction',
        format: 'instruction-md',
        sourcePath,
        packageId,
        targets: ALL_TARGET_LABELS,
        primitiveCounts: { instructions: 1 },
        manifest,
        copyFiles: [{ sourcePath, targetPath }],
    }
}

function buildSkillManifest(repo: string, ref: string, sourcePath: string, raw: string, tree: string[]): ImportCandidate {
    const parsed = parseFrontmatter(raw)
    const name = slugify(
        (parsed?.data.name as string | undefined)
            || path.posix.basename(path.posix.dirname(sourcePath))
            || path.posix.basename(sourcePath, '.md'),
        'skill',
    )
    const description = (parsed?.data.description as string | undefined)
        || firstParagraph(raw, `${name} skill`)
    const packageId = packageIdForSource(repo, ref, sourcePath, name, 'skill-md')
    const skillRoot = path.posix.dirname(sourcePath)
    const copySourceRoot = skillRoot === '.' ? '' : `${skillRoot}/`
    const targetRoot = `.apm/skills/${name}`
    const copyFiles = tree
        .filter((entry) => entry === sourcePath || (copySourceRoot && entry.startsWith(copySourceRoot)))
        .map((entry) => ({
            sourcePath: entry,
            targetPath: `${targetRoot}/${copySourceRoot ? entry.slice(copySourceRoot.length) : path.posix.basename(entry)}`,
        }))
    const manifest: ApmPackageManifest = {
        name,
        version: '0.1.0',
        type: 'skill',
        includes: 'auto',
        target: ALL_TARGET_IDS,
        description,
        marketplace: { source: githubSource(repo, ref, sourcePath, 'skill-md') },
        skills: [{ path: `${targetRoot}/SKILL.md` }],
        dependencies: { apm: [], mcp: [] },
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: 'skill',
        },
    }
    return {
        id: candidateId(repo, ref, sourcePath, 'skill-md'),
        name,
        description,
        kind: 'skill',
        format: 'skill-md',
        sourcePath,
        packageId,
        targets: ALL_TARGET_LABELS,
        primitiveCounts: { skills: 1 },
        manifest,
        copyFiles,
    }
}

function buildMcpManifest(repo: string, ref: string, sourcePath: string, raw: string): ImportCandidate | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return null
    }
    const serversRecord = parsed && typeof parsed === 'object' && 'mcpServers' in parsed
        ? (parsed as { mcpServers?: unknown }).mcpServers
        : parsed
    const names = serversRecord && typeof serversRecord === 'object' && !Array.isArray(serversRecord)
        ? Object.keys(serversRecord as Record<string, unknown>)
        : []
    if (names.length === 0) return null

    const name = slugify(path.posix.basename(sourcePath, path.posix.extname(sourcePath)), 'mcp')
    const packageId = packageIdForSource(repo, ref, sourcePath, name, 'mcp-config')
    const targetPath = `.apm/mcp/${path.posix.basename(sourcePath)}`
    const manifest: ApmPackageManifest = {
        name,
        version: '0.1.0',
        type: 'hybrid',
        includes: 'auto',
        target: ALL_TARGET_IDS,
        description: `MCP config with ${names.length} server${names.length === 1 ? '' : 's'}.`,
        marketplace: { source: githubSource(repo, ref, sourcePath, 'mcp-config') },
        dependencies: {
            apm: [],
            mcp: names.map((serverName) => ({ name: serverName })),
        },
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: 'mcp',
        },
    }
    return {
        id: candidateId(repo, ref, sourcePath, 'mcp-config'),
        name,
        description: manifest.description || name,
        kind: 'mcp',
        format: 'mcp-config',
        sourcePath,
        packageId,
        targets: ALL_TARGET_LABELS,
        primitiveCounts: {},
        manifest,
        copyFiles: [{ sourcePath, targetPath }],
    }
}

function buildApmManifestCandidate(repo: string, ref: string, sourcePath: string, raw: string, tree: string[]): ImportCandidate | null {
    let manifest: ApmPackageManifest
    try {
        manifest = parseYamlRecord<ApmPackageManifest>(raw, MANIFEST_FILE)
    } catch {
        return null
    }
    if (typeof manifest.name !== 'string' || !manifest.name.trim()) return null
    const root = sourceRootForManifest(sourcePath)
    const apmPrefix = root ? `${root}/.apm/` : '.apm/'
    const extensionPackageId = typeof manifest['x-apm']?.packageId === 'string'
        ? manifest['x-apm']?.packageId
        : null
    const packageId = extensionPackageId || packageIdForSource(repo, ref, sourcePath, manifest.name, 'apm')
    const copyFiles = tree
        .filter((entry) => entry.startsWith(apmPrefix))
        .map((entry) => ({
            sourcePath: entry,
            targetPath: `.apm/${entry.slice(apmPrefix.length)}`,
        }))
    const primitiveCounts = {
        agents: copyFiles.filter((entry) => entry.targetPath.startsWith('.apm/agents/')).length,
        instructions: copyFiles.filter((entry) => entry.targetPath.startsWith('.apm/instructions/')).length,
        skills: copyFiles.filter((entry) => entry.targetPath.endsWith('/SKILL.md')).length,
    }
    return {
        id: candidateId(repo, ref, sourcePath, 'apm'),
        name: manifest.name,
        description: typeof manifest.description === 'string' ? manifest.description : `${manifest.name} APM package`,
        kind: 'package',
        format: 'apm',
        sourcePath,
        packageId,
        targets: Array.isArray(manifest.target)
            ? manifest.target.map((entry) => String(entry))
            : (typeof manifest.target === 'string' ? [manifest.target] : ALL_TARGET_LABELS),
        primitiveCounts,
        manifest: {
            ...manifest,
            marketplace: {
                ...(manifest.marketplace && typeof manifest.marketplace === 'object' ? manifest.marketplace : {}),
                source: githubSource(repo, ref, sourcePath, 'apm'),
            },
            'x-apm': {
                schemaVersion: 1,
                kind: manifest['x-apm']?.kind || 'package',
                ...manifest['x-apm'],
                packageId,
            },
        },
        copyFiles,
    }
}

function agentCandidateToImportCandidate(repo: string, ref: string, candidate: AgentCandidate): ImportCandidate {
    const manifest = buildAgentManifest(repo, ref, candidate)
    const packageId = manifest['x-apm']?.packageId || packageIdForCandidate(repo, ref, candidate)
    return {
        id: candidateId(repo, ref, candidate.sourcePath, candidate.adapter),
        name: candidate.name,
        description: candidate.description,
        kind: 'agent',
        format: candidate.adapter,
        sourcePath: candidate.sourcePath,
        packageId,
        targets: ALL_TARGET_LABELS,
        primitiveCounts: { agents: 1, instructions: 1 },
        manifest,
        copyFiles: [],
    }
}

function agentCandidateToCatalogAsset(
    adapter: SourceAdapter,
    ref: string,
    candidate: AgentCandidate,
): ApmGitHubSourceAsset {
    const repo = `${adapter.owner}/${adapter.repo}`
    const id = `github:${repo}:${ref}:${candidate.sourcePath}`
    return {
        id,
        kind: 'agent',
        name: candidate.name,
        description: candidate.description,
        sourceName: adapter.name,
        repo,
        href: `${adapter.href}/blob/${ref}/${candidate.sourcePath}`,
        sourcePath: candidate.sourcePath,
        tags: uniqueStrings([
            'agent',
            candidate.adapter === 'claude-md' ? 'claude' : 'codex',
            categoryFromAgentPath(candidate.sourcePath),
            ...(candidate.tools || []).slice(0, 2).map((tool) => tool.toLowerCase()),
        ]),
        targets: ALL_TARGET_LABELS,
        stars: adapter.stars,
        importRequest: {
            source: `${repo}/${candidate.sourcePath}`,
            format: candidate.adapter,
            limit: 1,
        },
    }
}

function parseAwesomeAgentSkillRows(raw: string) {
    const rows: ApmGitHubSourceAsset[] = []
    const lines = raw.replace(/\r\n/g, '\n').split('\n')
    let section = 'Skills'

    for (const line of lines) {
        const sectionMatch = line.match(/^###\s+(.+)$/) || line.match(/^<summary><h3[^>]*>(.+?)<\/h3><\/summary>$/)
        if (sectionMatch) {
            section = sectionMatch[1].replace(/<[^>]+>/g, '').trim() || section
            continue
        }

        const match = line.match(/^- \*\*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\*\* - (.+)$/)
        if (!match) continue

        const [, label, href, description] = match
        const [owner, ...nameParts] = label.split('/')
        const name = nameParts.join('/') || label
        const repoMatch = href.match(/^https:\/\/github\.com\/([^/]+\/[^/#?]+)/)
        const sourceUrl = repoMatch ? `https://github.com/${repoMatch[1].replace(/\.git$/, '')}` : href
        rows.push({
            id: `awesome-agent-skills:${label}`,
            kind: 'skill',
            name,
            description: description.trim(),
            sourceName: 'Agent Skills Index',
            repo: 'VoltAgent/awesome-agent-skills',
            href,
            sourceUrl,
            sourcePath: 'README.md',
            tags: uniqueStrings(['skill', owner, section.toLowerCase().replace(/^skills by\s+/, '')]).slice(0, 4),
            targets: ['Claude', 'Codex', 'OpenCode', 'Cursor'],
        })
    }

    return rows
}

async function listClaudeSubagentAssets(adapter: SourceAdapter, limit: number) {
    const metadata = await fetchRepoMetadata(adapter.owner, adapter.repo, adapter)
    const ref = metadata.defaultBranch
    const tree = await fetchTree(adapter.owner, adapter.repo, ref)
    const candidatePaths = tree
        .filter((sourcePath) => looksLikeClaudeAgentMarkdown(sourcePath, ''))
    const sourcePaths = candidatePaths.slice(0, limit)
    const rawCandidates = await Promise.all(sourcePaths.map(async (sourcePath) => {
        const raw = await fetchGithubRawText(adapter.owner, adapter.repo, ref, sourcePath).catch(() => null)
        return raw ? parseClaudeAgentMarkdown(sourcePath, raw) : null
    }))

    return {
        source: {
            id: adapter.id,
            name: adapter.name,
            repo: `${adapter.owner}/${adapter.repo}`,
            ref,
            href: metadata.href,
            stars: metadata.stars,
        } satisfies ApmGitHubSourceCatalogSource,
        assets: rawCandidates
            .filter((candidate): candidate is AgentCandidate => !!candidate)
            .map((candidate) => agentCandidateToCatalogAsset({ ...adapter, href: metadata.href, stars: metadata.stars }, ref, candidate)),
        totalCandidates: candidatePaths.length,
    }
}

async function listAgentSkillAssets(adapter: SourceAdapter, limit: number) {
    const metadata = await fetchRepoMetadata(adapter.owner, adapter.repo, adapter)
    const ref = metadata.defaultBranch
    const raw = await fetchGithubRawText(adapter.owner, adapter.repo, ref, 'README.md')
    const parsedAssets = parseAwesomeAgentSkillRows(raw)
    return {
        source: {
            id: adapter.id,
            name: adapter.name,
            repo: `${adapter.owner}/${adapter.repo}`,
            ref,
            href: metadata.href,
            stars: metadata.stars,
        } satisfies ApmGitHubSourceCatalogSource,
        assets: parsedAssets.slice(0, limit),
        totalCandidates: parsedAssets.length,
    }
}

async function listPresetAssets(adapter: SourceAdapter) {
    const metadata = await fetchRepoMetadata(adapter.owner, adapter.repo, adapter)
    const ref = metadata.defaultBranch
    const repo = `${adapter.owner}/${adapter.repo}`
    return {
        source: {
            id: adapter.id,
            name: adapter.name,
            repo,
            ref,
            href: metadata.href,
            stars: metadata.stars,
        } satisfies ApmGitHubSourceCatalogSource,
        assets: [{
            id: `github:${repo}:${ref}`,
            kind: 'package',
            name: adapter.name,
            description: `Scan ${repo} and import detected APM packages, Skills, agents, instructions, and MCP configs.`,
            sourceName: adapter.name,
            repo,
            href: metadata.href,
            tags: uniqueStrings(['preset', 'github', adapter.repo]),
            targets: ALL_TARGET_LABELS,
            stars: metadata.stars,
            importRequest: {
                source: repo,
                format: 'auto',
                limit: 24,
            },
        } satisfies ApmGitHubSourceAsset],
        totalCandidates: 1,
    }
}

function sourceMatchesFormat(sourcePath: string, subpath: string, format: ApmGitHubImportRequest['format']) {
    if (format === 'apm') return isApmManifestPath(sourcePath)
    if (format === 'skill-md') return looksLikeSkillMarkdown(sourcePath)
    if (format === 'codex-toml') return looksLikeCodexTomlAgent(sourcePath, subpath)
    if (format === 'claude-md') return looksLikeClaudeAgentMarkdown(sourcePath, subpath)
    if (format === 'instruction-md') return looksLikeInstructionMarkdown(sourcePath, subpath)
    if (format === 'mcp-config') return looksLikeMcpConfig(sourcePath, subpath)
    return isApmManifestPath(sourcePath)
        || looksLikeSkillMarkdown(sourcePath)
        || looksLikeClaudeAgentMarkdown(sourcePath, subpath)
        || looksLikeCodexTomlAgent(sourcePath, subpath)
        || looksLikeInstructionMarkdown(sourcePath, subpath)
        || looksLikeMcpConfig(sourcePath, subpath)
}

function sourcePriority(sourcePath: string, subpath: string) {
    if (isApmManifestPath(sourcePath)) return 0
    if (looksLikeSkillMarkdown(sourcePath)) return 1
    if (looksLikeClaudeAgentMarkdown(sourcePath, subpath)) return 2
    if (looksLikeCodexTomlAgent(sourcePath, subpath)) return 3
    if (looksLikeInstructionMarkdown(sourcePath, subpath)) return 4
    if (looksLikeMcpConfig(sourcePath, subpath)) return 5
    return 7
}

async function buildImportCandidates(
    repo: string,
    ref: string,
    subpath: string,
    format: ApmGitHubImportRequest['format'],
    limit: number,
): Promise<{ candidates: ImportCandidate[]; totalMatched: number }> {
    const [owner, repoName] = repo.split('/')
    const tree = await fetchTree(owner, repoName, ref)
    const sourcePaths = tree
        .filter((sourcePath) => pathIsInsideSubpath(sourcePath, subpath))
        .filter((sourcePath) => sourceMatchesFormat(sourcePath, subpath, format || 'auto'))
        .sort((left, right) => sourcePriority(left, subpath) - sourcePriority(right, subpath) || left.localeCompare(right))

    const candidates: ImportCandidate[] = []
    for (const sourcePath of sourcePaths) {
        if (candidates.length >= limit) break
        const raw = await fetchGithubText(repo, ref, sourcePath).catch(() => null)
        if (!raw) continue

        if ((format === 'auto' || !format || format === 'apm') && isApmManifestPath(sourcePath)) {
            const candidate = buildApmManifestCandidate(repo, ref, sourcePath, raw, tree)
            if (candidate) {
                candidates.push(candidate)
                continue
            }
        }
        if ((format === 'auto' || !format || format === 'skill-md') && looksLikeSkillMarkdown(sourcePath)) {
            candidates.push(buildSkillManifest(repo, ref, sourcePath, raw, tree))
            continue
        }
        if ((format === 'auto' || !format || format === 'codex-toml') && looksLikeCodexTomlAgent(sourcePath, subpath)) {
            const agent = parseCodexTomlAgent(sourcePath, raw)
            if (agent) {
                candidates.push(agentCandidateToImportCandidate(repo, ref, agent))
                continue
            }
        }
        if ((format === 'auto' || !format || format === 'claude-md') && looksLikeClaudeAgentMarkdown(sourcePath, subpath)) {
            const agent = parseClaudeAgentMarkdown(sourcePath, raw)
            if (agent) {
                candidates.push(agentCandidateToImportCandidate(repo, ref, agent))
                continue
            }
        }
        if ((format === 'auto' || !format || format === 'instruction-md') && looksLikeInstructionMarkdown(sourcePath, subpath)) {
            candidates.push(buildInstructionManifest(repo, ref, sourcePath, raw))
            continue
        }
        if ((format === 'auto' || !format || format === 'mcp-config') && looksLikeMcpConfig(sourcePath, subpath)) {
            const candidate = buildMcpManifest(repo, ref, sourcePath, raw)
            if (candidate) {
                candidates.push(candidate)
            }
        }
    }

    return { candidates, totalMatched: sourcePaths.length }
}

async function copyCandidateFiles(workingDir: string, repo: string, ref: string, candidate: ImportCandidate) {
    if (candidate.copyFiles.length === 0) return
    const root = packageDir(workingDir, candidate.packageId)
    for (const file of candidate.copyFiles) {
        const raw = await fetchGithubText(repo, ref, file.sourcePath)
        const target = path.join(root, file.targetPath)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, raw, 'utf-8')
    }
}

function previewCandidate(candidate: ImportCandidate): ApmGitHubImportCandidate {
    return {
        id: candidate.id,
        name: candidate.name,
        description: candidate.description,
        kind: candidate.kind,
        format: candidate.format,
        sourcePath: candidate.sourcePath,
        packageId: candidate.packageId,
        targets: candidate.targets,
        primitiveCounts: candidate.primitiveCounts,
    }
}

export async function previewApmPackagesFromGitHub(
    request: ApmGitHubImportRequest,
): Promise<ApmGitHubImportPreviewResponse> {
    if (!request.source?.trim()) {
        throw new Error('source is required.')
    }

    const parsed = parseSource(request.source)
    const repo = `${parsed.owner}/${parsed.repo}`
    const metadata = await fetchRepoMetadata(parsed.owner, parsed.repo)
    const ref = request.ref?.trim() || parsed.ref?.trim() || metadata.defaultBranch
    const subpath = normalizeRepoPath(parsed.subpath)
    const format = request.format || 'auto'
    const limit = importLimit(request.limit)
    const { candidates, totalMatched } = await buildImportCandidates(repo, ref, subpath, format, limit)
    const warnings: string[] = []
    if (candidates.length === 0) {
        warnings.push(`No importable ${format === 'auto' ? 'APM, agent, skill, instruction, or MCP' : format} files found in ${request.source}.`)
    }
    if (candidates.length >= limit && totalMatched > candidates.length) {
        warnings.push(`Showing the first ${candidates.length} candidates. Narrow the source path or raise the limit to inspect more.`)
    }

    return {
        ok: true,
        source: {
            repo,
            ref,
            ...(subpath ? { subpath } : {}),
            href: metadata.href,
            ...(typeof metadata.stars === 'number' ? { stars: metadata.stars } : {}),
        },
        candidates: candidates.map(previewCandidate),
        warnings,
    }
}

export async function importApmPackagesFromGitHub(
    workingDir: string,
    request: ApmGitHubImportRequest,
): Promise<ApmGitHubImportResponse> {
    if (!request.source?.trim()) {
        throw new Error('source is required.')
    }

    const parsed = parseSource(request.source)
    const repo = `${parsed.owner}/${parsed.repo}`
    const metadata = await fetchRepoMetadata(parsed.owner, parsed.repo)
    const ref = request.ref?.trim() || parsed.ref?.trim() || metadata.defaultBranch
    const subpath = normalizeRepoPath(parsed.subpath)
    const format = request.format || 'auto'
    const limit = importLimit(request.limit)
    const { candidates, totalMatched } = await buildImportCandidates(repo, ref, subpath, format, limit)
    const selectedIds = new Set((request.candidateIds || []).filter(Boolean))
    const selectedCandidates = selectedIds.size > 0
        ? candidates.filter((candidate) => selectedIds.has(candidate.id))
        : candidates
    const scope = request.scope === 'global' ? 'global' : 'stage'
    const targetWorkingDir = scope === 'global' ? getGlobalStudioCwd() : workingDir
    const warnings: string[] = []
    const packages: ApmGitHubImportPackage[] = []

    for (const candidate of selectedCandidates) {
        const written = await writeApmPackage(targetWorkingDir, candidate.packageId, candidate.manifest)
        await copyCandidateFiles(targetWorkingDir, repo, ref, candidate)
        packages.push({
            packageId: written.packageId,
            name: candidate.name,
            kind: candidate.kind,
            sourcePath: candidate.sourcePath,
            packagePath: toPosixPath(path.relative(targetWorkingDir, packageDir(targetWorkingDir, written.packageId))),
            manifestPath: toPosixPath(path.relative(targetWorkingDir, manifestPath(targetWorkingDir, written.packageId))),
        })
    }

    if (packages.length === 0) {
        throw new Error(`No importable ${format === 'auto' ? 'APM, agent, skill, instruction, or MCP' : format} files found in ${request.source}.`)
    }
    if (packages.length >= limit && totalMatched > packages.length) {
        warnings.push(`Imported the first ${packages.length} packages. Narrow the source path or raise the limit to import more.`)
    }

    return {
        ok: true,
        scope,
        targetWorkingDir,
        source: {
            repo,
            ref,
            ...(subpath ? { subpath } : {}),
            href: metadata.href,
            ...(typeof metadata.stars === 'number' ? { stars: metadata.stars } : {}),
        },
        packages,
        warnings,
    }
}

export async function listApmGitHubSourceAssets(
    request: ApmGitHubSourceCatalogRequest = {},
): Promise<ApmGitHubSourceCatalogResponse> {
    const requestedSources = request.sources?.length
        ? new Set(request.sources)
        : null
    const limit = catalogLimit(request.limitPerSource)
    const adapters = SOURCE_ADAPTERS.filter((adapter) => !requestedSources || requestedSources.has(adapter.id))
    const warnings: string[] = []
    const sources: ApmGitHubSourceCatalogSource[] = []
    const assets: ApmGitHubSourceAsset[] = []

    for (const adapter of adapters) {
        try {
            const result = adapter.kind === 'agents'
                ? await listClaudeSubagentAssets(adapter, limit)
                : adapter.kind === 'skills'
                    ? await listAgentSkillAssets(adapter, limit)
                    : await listPresetAssets(adapter)
            sources.push(result.source)
            assets.push(...result.assets)
            if (result.totalCandidates > result.assets.length) {
                warnings.push(`${adapter.name}: showing ${result.assets.length} of ${result.totalCandidates} converted assets.`)
            }
        } catch (error) {
            warnings.push(`${adapter.name}: ${error instanceof Error ? error.message : 'Unable to convert source.'}`)
        }
    }

    const sortedSources = sources.sort((left, right) => (right.stars || 0) - (left.stars || 0) || left.name.localeCompare(right.name))
    const sourceRank = new Map(sortedSources.map((source, index) => [source.repo.toLowerCase(), index]))
    const sortedAssets = assets.sort((left, right) => {
        const rankDelta = (sourceRank.get(left.repo.toLowerCase()) ?? 999) - (sourceRank.get(right.repo.toLowerCase()) ?? 999)
        if (rankDelta !== 0) return rankDelta
        return (right.stars || 0) - (left.stars || 0) || left.name.localeCompare(right.name)
    })

    return {
        ok: true,
        sources: sortedSources,
        assets: sortedAssets,
        warnings,
    }
}
