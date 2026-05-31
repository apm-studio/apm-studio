import fsSync from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { parseSkillMarkdown } from '../../../shared/skill-markdown.js'

export type ParsedSource = {
    type: 'github'
    owner: string
    repo: string
    url: string
    ref?: string
    subpath?: string
    refPath?: string
    sourcePathKind?: 'tree' | 'blob' | 'raw'
    skillFilter?: string
}

export type DiscoveredSkill = {
    name: string
    description: string
    tags: string[]
    skillMdPath: string
    relativePath: string
    rawContent: string
    license?: string
    compatibility?: string
    metadata?: Record<string, string>
    allowedTools?: string
}

function toRepoPath(value: string) {
    return value.replace(/\\/g, '/')
}

function sanitizeSubpath(subpath: string) {
    const normalized = subpath.replace(/\\/g, '/').split('/').filter(Boolean).join('/')
    for (const segment of normalized.split('/')) {
        if (segment === '..') {
            throw new Error(`Unsafe subpath: "${subpath}" contains path traversal segments.`)
        }
    }
    return normalized
}

function decodePathSegment(segment: string) {
    try {
        return decodeURIComponent(segment)
    } catch {
        return segment
    }
}

function splitUrlPathname(pathname: string) {
    return pathname
        .split('/')
        .filter(Boolean)
        .map(decodePathSegment)
}

function cleanRepoName(repo: string) {
    return repo.replace(/\.git$/, '')
}

function githubCloneUrl(owner: string, repo: string) {
    return `https://github.com/${owner}/${repo}.git`
}

function parsedGitHubSource(input: {
    owner: string
    repo: string
    ref?: string
    subpath?: string
    refPath?: string
    sourcePathKind?: ParsedSource['sourcePathKind']
}): ParsedSource {
    const repo = cleanRepoName(input.repo)
    return {
        type: 'github',
        owner: input.owner,
        repo,
        url: githubCloneUrl(input.owner, repo),
        ...(input.ref ? { ref: input.ref } : {}),
        ...(input.subpath ? { subpath: sanitizeSubpath(input.subpath) } : {}),
        ...(input.refPath ? { refPath: sanitizeSubpath(input.refPath) } : {}),
        ...(input.sourcePathKind ? { sourcePathKind: input.sourcePathKind } : {}),
    }
}

function parseGitHubUrl(trimmed: string): ParsedSource | null {
    let parsed: URL
    try {
        parsed = new URL(trimmed)
    } catch {
        return null
    }

    const host = parsed.hostname.toLowerCase()
    const segments = splitUrlPathname(parsed.pathname)
    if ((host === 'github.com' || host === 'www.github.com') && segments.length >= 2) {
        const [owner, repo, marker, ...rest] = segments
        if ((marker === 'tree' || marker === 'blob') && rest.length > 0) {
            return parsedGitHubSource({
                owner,
                repo,
                ref: rest[0],
                subpath: rest.slice(1).join('/'),
                refPath: rest.join('/'),
                sourcePathKind: marker,
            })
        }
        return parsedGitHubSource({ owner, repo })
    }

    if (host === 'raw.githubusercontent.com' && segments.length >= 3) {
        const [owner, repo, ...rest] = segments
        return parsedGitHubSource({
            owner,
            repo,
            ref: rest[0],
            subpath: rest.slice(1).join('/'),
            refPath: rest.join('/'),
            sourcePathKind: 'raw',
        })
    }

    return null
}

function parseSshGitHubUrl(trimmed: string): ParsedSource | null {
    const scpLike = trimmed.match(/^git@github\.com:([^/]+)\/(.+)$/)
    if (scpLike) {
        const [, owner, repo] = scpLike
        return parsedGitHubSource({ owner, repo })
    }

    let parsed: URL
    try {
        parsed = new URL(trimmed)
    } catch {
        return null
    }
    if (parsed.protocol !== 'ssh:' || parsed.hostname.toLowerCase() !== 'github.com') {
        return null
    }
    const segments = splitUrlPathname(parsed.pathname)
    if (segments.length < 2) return null
    const [owner, repo] = segments
    return parsedGitHubSource({ owner, repo })
}

function splitHashRef(value: string) {
    const index = value.indexOf('#')
    if (index < 0) return { source: value, ref: undefined }
    return {
        source: value.slice(0, index),
        ref: value.slice(index + 1),
    }
}

export function parseSource(input: string): ParsedSource {
    const trimmed = input.trim()
    const urlSource = parseGitHubUrl(trimmed) || parseSshGitHubUrl(trimmed)
    if (urlSource) return urlSource

    const { source, ref } = splitHashRef(trimmed)
    const atRefMatch = source.match(/^([^/]+)\/([^/@]+)@(.+)$/)
    if (atRefMatch && !source.includes(':') && !source.startsWith('.') && !source.startsWith('/')) {
        const [, owner, repo, parsedRef] = atRefMatch
        return parsedGitHubSource({
            owner,
            repo,
            ref: ref || parsedRef,
        })
    }

    const shorthandMatch = source.match(/^([^/]+)\/([^/]+)(?:\/(.+))?$/)
    if (shorthandMatch && !source.includes(':') && !source.startsWith('.') && !source.startsWith('/')) {
        const [, owner, repo, subpath] = shorthandMatch
        return parsedGitHubSource({
            owner,
            repo,
            ref,
            subpath,
        })
    }

    throw new Error(`Cannot parse source: '${trimmed}'. Expected owner/repo, owner/repo#ref, owner/repo@ref, owner/repo/subpath, GitHub tree/blob/raw URL, or GitHub SSH URL.`)
}

export function getOwnerRepo(url: string) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (!match) return null
    return `${match[1]}/${match[2].replace(/\.git$/, '')}`
}

const PRIORITY_DIRS = [
    'skills',
    'skills/.curated',
    'skills/.system',
    'agent-skills',
    '.skills',
    'src/skills',
    'lib/skills',
    'packages/skills',
]

export async function discoverSkills(rootDir: string): Promise<DiscoveredSkill[]> {
    const skills: DiscoveredSkill[] = []
    const seen = new Set<string>()
    const rootSkill = await tryParseSkillMd(rootDir, rootDir)
    if (rootSkill) {
        seen.add(rootSkill.name)
        skills.push(rootSkill)
    }

    for (const dir of PRIORITY_DIRS) {
        skills.push(...await discoverInDir(path.join(rootDir, dir), rootDir, seen))
    }
    skills.push(...await discoverRecursive(rootDir, rootDir, seen, 0, 5))
    return skills
}

async function discoverInDir(dir: string, rootDir: string, seen: Set<string>) {
    const skills: DiscoveredSkill[] = []
    const entries: string[] = await fs.readdir(dir).catch((): string[] => [])
    for (const entry of entries) {
        const entryPath = path.join(dir, entry)
        const stat = await fs.stat(entryPath).catch(() => null)
        if (!stat?.isDirectory()) continue
        const skill = await tryParseSkillMd(entryPath, rootDir)
        if (skill && !seen.has(skill.name)) {
            seen.add(skill.name)
            skills.push(skill)
        }
    }
    return skills
}

async function discoverRecursive(
    dir: string,
    rootDir: string,
    seen: Set<string>,
    depth: number,
    maxDepth: number,
): Promise<DiscoveredSkill[]> {
    if (depth >= maxDepth) return []
    const skills: DiscoveredSkill[] = []
    const entries: string[] = await fs.readdir(dir).catch((): string[] => [])
    if (entries.includes('SKILL.md')) {
        const skill = await tryParseSkillMd(dir, rootDir)
        if (skill && !seen.has(skill.name)) {
            seen.add(skill.name)
            skills.push(skill)
            return skills
        }
    }
    for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'node_modules') continue
        const entryPath = path.join(dir, entry)
        const stat = await fs.stat(entryPath).catch(() => null)
        if (!stat?.isDirectory()) continue
        skills.push(...await discoverRecursive(entryPath, rootDir, seen, depth + 1, maxDepth))
    }
    return skills
}

async function tryParseSkillMd(dir: string, rootDir: string): Promise<DiscoveredSkill | null> {
    const skillMdPath = path.join(dir, 'SKILL.md')
    const rawContent = await fs.readFile(skillMdPath, 'utf-8').catch(() => null)
    if (!rawContent) return null
    try {
        const meta = parseSkillMarkdown(rawContent)
        return {
            name: meta.name,
            description: meta.description,
            tags: meta.tags,
            skillMdPath,
            relativePath: toRepoPath(path.relative(rootDir, dir)),
            rawContent,
            ...(meta.license ? { license: meta.license } : {}),
            ...(meta.compatibility ? { compatibility: meta.compatibility } : {}),
            ...(meta.metadata ? { metadata: meta.metadata } : {}),
            ...(meta.allowedTools ? { allowedTools: meta.allowedTools } : {}),
        }
    } catch {
        return null
    }
}

function isWithinDirectory(rootPath: string, targetPath: string) {
    const relative = path.relative(rootPath, targetPath)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function describeRepoPath(repoRoot: string, sourcePath: string) {
    const relative = path.relative(repoRoot, sourcePath)
    return relative && !relative.startsWith('..') ? relative : sourcePath
}

function resolveRepoRoot(srcDir: string, options?: { repoRoot?: string }) {
    const configuredRoot = options?.repoRoot ? path.resolve(options.repoRoot) : path.resolve(srcDir)
    return fsSync.realpathSync.native?.(configuredRoot) || fsSync.realpathSync(configuredRoot)
}

function copyFile(sourcePath: string, destinationPath: string) {
    fsSync.mkdirSync(path.dirname(destinationPath), { recursive: true })
    fsSync.copyFileSync(sourcePath, destinationPath)
}

function copyEntry(sourcePath: string, destinationPath: string, repoRoot: string, activeRealDirs: Set<string>) {
    const name = path.basename(sourcePath)
    if (name.startsWith('.')) return
    const sourceStat = fsSync.lstatSync(sourcePath)
    if (sourceStat.isSymbolicLink()) {
        const resolvedPath = fsSync.realpathSync(sourcePath)
        if (!isWithinDirectory(repoRoot, resolvedPath)) {
            throw new Error(`Skill contains a symlink outside the repository root: ${describeRepoPath(repoRoot, sourcePath)}`)
        }
        const resolvedStat = fsSync.statSync(resolvedPath)
        if (resolvedStat.isDirectory()) {
            copyDirectory(resolvedPath, destinationPath, repoRoot, activeRealDirs)
            return
        }
        if (resolvedStat.isFile()) {
            copyFile(resolvedPath, destinationPath)
            return
        }
        throw new Error(`Skill symlink resolves to an unsupported file type: ${describeRepoPath(repoRoot, sourcePath)}`)
    }
    if (sourceStat.isDirectory()) {
        copyDirectory(sourcePath, destinationPath, repoRoot, activeRealDirs)
        return
    }
    if (sourceStat.isFile()) {
        copyFile(sourcePath, destinationPath)
    }
}

function copyDirectory(sourceDir: string, destinationDir: string, repoRoot: string, activeRealDirs: Set<string>) {
    const realSourceDir = fsSync.realpathSync(sourceDir)
    if (!isWithinDirectory(repoRoot, realSourceDir)) {
        throw new Error(`Skill resolves outside the repository root: ${describeRepoPath(repoRoot, sourceDir)}`)
    }
    if (activeRealDirs.has(realSourceDir)) {
        throw new Error(`Skill contains a cyclic symlinked directory: ${describeRepoPath(repoRoot, sourceDir)}`)
    }
    activeRealDirs.add(realSourceDir)
    try {
        fsSync.mkdirSync(destinationDir, { recursive: true })
        for (const entry of fsSync.readdirSync(sourceDir, { withFileTypes: true })) {
            copyEntry(
                path.join(sourceDir, entry.name),
                path.join(destinationDir, entry.name),
                repoRoot,
                activeRealDirs,
            )
        }
    } finally {
        activeRealDirs.delete(realSourceDir)
    }
}

export function copySkillDir(srcDir: string, destDir: string, options?: { repoRoot?: string }) {
    if (fsSync.existsSync(destDir)) {
        fsSync.rmSync(destDir, { recursive: true, force: true })
    }
    const repoRoot = resolveRepoRoot(srcDir, options)
    copyDirectory(srcDir, destDir, repoRoot, new Set())
}
