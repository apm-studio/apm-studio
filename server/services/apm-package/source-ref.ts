import { execFile } from 'child_process'
import fsSync from 'fs'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { parseSkillMarkdown } from '../../../shared/skill-markdown.js'

const execFileAsync = promisify(execFile)
const DEFAULT_CLONE_TIMEOUT_MS = 60_000

export type ParsedSource = {
    type: 'github'
    owner: string
    repo: string
    url: string
    ref?: string
    subpath?: string
    skillFilter?: string
}

export type CloneResult = {
    tempDir: string
    cleanup: () => Promise<void>
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
    const normalized = subpath.replace(/\\/g, '/')
    for (const segment of normalized.split('/')) {
        if (segment === '..') {
            throw new Error(`Unsafe subpath: "${subpath}" contains path traversal segments.`)
        }
    }
    return normalized
}

export function parseSource(input: string): ParsedSource {
    const trimmed = input.trim()
    const githubTreeWithPathMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/)
    if (githubTreeWithPathMatch) {
        const [, owner, repo, ref, subpath] = githubTreeWithPathMatch
        const cleanRepo = repo.replace(/\.git$/, '')
        return {
            type: 'github',
            owner,
            repo: cleanRepo,
            url: `https://github.com/${owner}/${cleanRepo}.git`,
            ref,
            subpath: subpath ? sanitizeSubpath(subpath) : undefined,
        }
    }

    const githubTreeMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)$/)
    if (githubTreeMatch) {
        const [, owner, repo, ref] = githubTreeMatch
        const cleanRepo = repo.replace(/\.git$/, '')
        return {
            type: 'github',
            owner,
            repo: cleanRepo,
            url: `https://github.com/${owner}/${cleanRepo}.git`,
            ref,
        }
    }

    const githubRepoMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (githubRepoMatch) {
        const [, owner, repo] = githubRepoMatch
        const cleanRepo = repo.replace(/\.git$/, '')
        return {
            type: 'github',
            owner,
            repo: cleanRepo,
            url: `https://github.com/${owner}/${cleanRepo}.git`,
        }
    }

    const atSkillMatch = trimmed.match(/^([^/]+)\/([^/@]+)@(.+)$/)
    if (atSkillMatch && !trimmed.includes(':') && !trimmed.startsWith('.') && !trimmed.startsWith('/')) {
        const [, owner, repo, skillFilter] = atSkillMatch
        return {
            type: 'github',
            owner,
            repo,
            url: `https://github.com/${owner}/${repo}.git`,
            skillFilter,
        }
    }

    const shorthandMatch = trimmed.match(/^([^/]+)\/([^/]+)(?:\/(.+))?$/)
    if (shorthandMatch && !trimmed.includes(':') && !trimmed.startsWith('.') && !trimmed.startsWith('/')) {
        const [, owner, repo, subpath] = shorthandMatch
        return {
            type: 'github',
            owner,
            repo,
            url: `https://github.com/${owner}/${repo}.git`,
            subpath: subpath ? sanitizeSubpath(subpath) : undefined,
        }
    }

    throw new Error(`Cannot parse source: '${trimmed}'. Expected owner/repo, owner/repo@skill-name, owner/repo/subpath, or GitHub URL.`)
}

export function getOwnerRepo(url: string) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (!match) return null
    return `${match[1]}/${match[2].replace(/\.git$/, '')}`
}

export async function shallowClone(options: { url: string; ref?: string; timeoutMs?: number }): Promise<CloneResult> {
    const { url, ref, timeoutMs = DEFAULT_CLONE_TIMEOUT_MS } = options
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-clone-'))
    const args = ['clone', '--depth', '1', '--single-branch']
    if (ref && ref !== 'HEAD') {
        args.push('--branch', ref)
    }
    args.push(url, tempDir)

    try {
        await execFileAsync('git', args, { timeout: timeoutMs })
    } catch (error) {
        await cleanupTempDir(tempDir)
        const message = error instanceof Error ? error.message : String(error)
        const isTimeout = message.includes('timed out') || message.includes('ETIMEDOUT')
        const isAuth = message.includes('Authentication failed')
            || message.includes('could not read Username')
            || message.includes('Permission denied')
            || message.includes('Repository not found')
        if (isTimeout) {
            throw new Error(`Clone timed out after ${timeoutMs / 1000}s. Check repository access and network status.`)
        }
        if (isAuth) {
            throw new Error(`Authentication failed for ${url}. Ensure your GitHub credentials can access the repository.`)
        }
        throw new Error(`Failed to clone '${url}': ${message}`)
    }

    return {
        tempDir,
        cleanup: () => cleanupTempDir(tempDir),
    }
}

async function cleanupTempDir(dir: string) {
    const normalizedDir = path.normalize(path.resolve(dir))
    const normalizedTmp = path.normalize(path.resolve(os.tmpdir()))
    if (!normalizedDir.startsWith(`${normalizedTmp}${path.sep}`) && normalizedDir !== normalizedTmp) {
        throw new Error('Attempted to clean up directory outside of temp directory')
    }
    await fs.rm(dir, { recursive: true, force: true })
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
