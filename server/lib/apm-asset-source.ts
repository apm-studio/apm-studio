import { execFile } from 'child_process'
import crypto from 'crypto'
import fss from 'fs'
import fs from 'fs/promises'
import http from 'http'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import open from 'open'
import {
    getApmStudioDir,
    getGlobalStudioCwd,
} from './apm-studio-paths.js'
import {
    APM_ASSET_KINDS,
    isApmAssetKind,
    isRecord,
    nameFromUrn,
    ownerFromUrn,
    parseActAsset,
    parseDanceFromSkillMd,
    parseApmAsset,
    parseApmAssetUrn,
    parsePerformerAsset,
    slugFromUrn,
} from '../../shared/apm-asset-contracts.js'
import type {
    ActAsset,
    ActAssetPayloadV1,
    ActParticipantSubscriptionsV1,
    ActParticipantV1,
    ActRelationV1,
    AnyApmAssetV1,
    ApmAssetKind,
    PerformerAsset,
} from '../../shared/apm-asset-types.js'

const execFileAsync = promisify(execFile)

const ASSET_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const STAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const OWNER_RE = /^@[A-Za-z0-9_-]{1,64}$/
const DEFAULT_CLONE_TIMEOUT_MS = 60_000
const LOCK_FILE = 'skill-lock.json'
const SUPABASE_URL = process.env.APM_STUDIO_SUPABASE_URL
    || ''
const SUPABASE_ANON_KEY = process.env.APM_STUDIO_SUPABASE_ANON_KEY
    || ''
const AUTH_CALLBACK_PORT = 4242
const AUTH_REDIRECT_URI = `http://localhost:${AUTH_CALLBACK_PORT}/callback`
const LOGIN_TIMEOUT_MS = 180_000

const SOURCE_REFERENCE_REGISTRY_MESSAGE = 'APM Registry indexes GitHub source references only. Use Explore to import GitHub source listings.'

export type InstalledAsset = {
    urn: string
    filePath: string
    skipped: boolean
}

export type RegistryPackage = {
    urn: string
    kind: string
    name: string
    owner: string
    stage: string
    description: string
    tags: string[]
    installs?: number
    updatedAt?: string
    payload?: unknown
    resource?: unknown
}

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

type AuthUser = {
    token: string
    username: string
}

type SkillLock = {
    version: 1
    skills: Record<string, Record<string, unknown>>
}

type SkillLockEntry = {
    source: 'github'
    sourceUrl: string
    skillPath: string
    skillFolderHash?: string
    [key: string]: unknown
}

type PublishableKind = Exclude<ApmAssetKind, 'dance'>

function assertSafeAssetUrn(urn: string) {
    const parts = urn.split('/')
    if (parts.length !== 4) {
        throw new Error(`Invalid URN '${urn}'. Expected: <kind>/@<owner>/<stage>/<name>.`)
    }
    const [kind, owner, stage, name] = parts
    if (!isApmAssetKind(kind)) {
        throw new Error(`Invalid kind in URN '${urn}'.`)
    }
    if (!OWNER_RE.test(owner)) {
        throw new Error(`Invalid owner in URN '${urn}'. Expected '@<owner>'.`)
    }
    if (!STAGE_RE.test(stage)) {
        throw new Error(`Invalid stage in URN '${urn}'.`)
    }
    if (!ASSET_NAME_RE.test(name)) {
        throw new Error(`Invalid asset name in URN '${urn}'.`)
    }
}

function assertPathInside(basePath: string, candidatePath: string, label: string) {
    const base = path.resolve(basePath)
    const candidate = path.resolve(candidatePath)
    if (candidate === base) return
    if (!candidate.startsWith(`${base}${path.sep}`)) {
        throw new Error(`Unsafe ${label} path resolution attempted.`)
    }
}

function toRepoPath(value: string) {
    return value.replace(/\\/g, '/')
}

export function getApmAssetDir(cwd = process.cwd()) {
    return getApmStudioDir(cwd)
}

export function getGlobalCwd() {
    return getGlobalStudioCwd()
}

export function getGlobalApmAssetDir() {
    return getApmAssetDir(getGlobalCwd())
}

export async function ensureApmAssetDir(cwd: string) {
    const apmAssetDir = getApmAssetDir(cwd)
    if (!fss.existsSync(apmAssetDir)) {
        await initRegistry(cwd)
    }
}

export function assetFilePath(cwd: string, urn: string) {
    return assetFilePathForApmDir(getApmAssetDir(cwd), urn)
}

function assetFilePathForApmDir(apmAssetDirInput: string, urn: string) {
    assertSafeAssetUrn(urn)
    const [kind, owner, stage, name] = urn.split('/')
    const apmAssetDir = path.resolve(apmAssetDirInput)
    const filePath = kind === 'dance'
        ? path.resolve(apmAssetDir, 'assets', kind, owner, stage, name, 'SKILL.md')
        : path.resolve(apmAssetDir, 'assets', kind, owner, stage, `${name}.json`)
    assertPathInside(apmAssetDir, filePath, 'asset')
    return filePath
}

export function danceAssetDir(cwd: string, urn: string) {
    assertSafeAssetUrn(urn)
    const [kind, owner, stage, name] = urn.split('/')
    if (kind !== 'dance') {
        throw new Error(`danceAssetDir only works with dance URNs, got '${kind}'`)
    }
    const apmAssetDir = path.resolve(getApmAssetDir(cwd))
    const dirPath = path.resolve(apmAssetDir, 'assets', kind, owner, stage, name)
    assertPathInside(apmAssetDir, dirPath, 'dance asset')
    return dirPath
}

async function readAssetFile(filePath: string, urn: string): Promise<AnyApmAssetV1 | null> {
    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const [kind] = urn.split('/')
        if (kind === 'dance') {
            const meta = parseDanceFromSkillMd(raw)
            return {
                kind: 'dance',
                urn,
                description: meta.description,
                tags: meta.tags,
                payload: {
                    name: meta.name,
                    description: meta.description,
                    content: meta.content,
                    tags: meta.tags,
                    ...(meta.license ? { license: meta.license } : {}),
                    ...(meta.compatibility ? { compatibility: meta.compatibility } : {}),
                    ...(meta.metadata ? { metadata: meta.metadata } : {}),
                    ...(meta.allowedTools ? { allowedTools: meta.allowedTools } : {}),
                },
            }
        }
        return parseApmAsset(JSON.parse(raw))
    } catch (error) {
        if (isNodeError(error, 'ENOENT')) return null
        throw error
    }
}

async function readAssetFrom(cwd: string, urn: string): Promise<AnyApmAssetV1 | null> {
    return readAssetFile(assetFilePath(cwd, urn), urn)
}

export async function readAsset(cwd: string, urn: string): Promise<AnyApmAssetV1 | null> {
    const result = await readAssetFrom(cwd, urn)
    if (result) return result
    const globalCwd = getGlobalCwd()
    if (path.resolve(globalCwd) !== path.resolve(cwd)) {
        return readAssetFrom(globalCwd, urn)
    }
    return null
}

export async function getAssetPayload(cwd: string, urn: string): Promise<string | null> {
    const asset = await readAsset(cwd, urn)
    if (!asset) return null
    if (asset.kind === 'dance') {
        return asset.payload.content
    }
    return typeof asset.payload === 'object'
        && asset.payload !== null
        && 'content' in asset.payload
        && typeof asset.payload.content === 'string'
        ? asset.payload.content
        : null
}

export async function initRegistry(cwd = process.cwd()) {
    const apmAssetDir = getApmAssetDir(cwd)
    await fs.mkdir(apmAssetDir, { recursive: true })
    await fs.writeFile(
        path.join(apmAssetDir, 'apm.json'),
        JSON.stringify({ schema: 'apm-studio.workspace/v1', version: 1 }, null, 2),
        'utf-8',
    ).catch(() => undefined)
    for (const kind of APM_ASSET_KINDS) {
        await fs.mkdir(path.join(apmAssetDir, 'assets', kind), { recursive: true })
        await fs.mkdir(path.join(apmAssetDir, 'drafts', kind), { recursive: true })
    }
}

export async function fetchRegistryPackageRaw(kind: string, owner: string, stage: string, name: string): Promise<Record<string, unknown>> {
    void kind
    void owner
    void stage
    void name
    throw new Error(SOURCE_REFERENCE_REGISTRY_MESSAGE)
}

export async function getRegistryPackage(kind: string, owner: string, stage: string, name: string): Promise<RegistryPackage> {
    if (!isApmAssetKind(kind)) {
        throw new Error(`Invalid kind: '${kind}'. Allowed: tal, dance, act, performer`)
    }
    const normalizedOwner = owner.replace(/^@/, '')
    const pkgData = await fetchRegistryPackageRaw(kind, normalizedOwner, stage, name)
    if (typeof pkgData.urn !== 'string' || !pkgData.urn) {
        throw new Error(`Registry response missing 'urn' for ${kind}/@${normalizedOwner}/${stage}/${name}`)
    }
    return {
        urn: pkgData.urn,
        kind: typeof pkgData.kind === 'string' ? pkgData.kind : kind,
        name: typeof pkgData.name === 'string' ? pkgData.name : nameFromUrn(pkgData.urn),
        owner: typeof pkgData.owner === 'string' ? pkgData.owner : normalizedOwner,
        stage: typeof pkgData.stage === 'string' ? pkgData.stage : stage,
        description: typeof pkgData.description === 'string' ? pkgData.description : '',
        tags: Array.isArray(pkgData.tags) ? pkgData.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        ...(typeof pkgData.installs === 'number' ? { installs: pkgData.installs } : {}),
        ...(typeof pkgData.updatedAt === 'string' ? { updatedAt: pkgData.updatedAt } : {}),
        ...(pkgData.payload !== undefined ? { payload: pkgData.payload } : {}),
        ...(pkgData.resource !== undefined ? { resource: pkgData.resource } : {}),
    }
}

export async function searchRegistry(
    query: string,
    options?: { kind?: string; tag?: string; limit?: number },
): Promise<RegistryPackage[]> {
    void query
    void options
    return []
}

function splitRegistryUrn(urn: string) {
    const parsed = parseApmAssetUrn(urn)
    return {
        kind: parsed.kind,
        owner: `@${parsed.owner}`,
        stage: parsed.stage,
        name: parsed.name,
    }
}

function parseRegistryAsset(kind: ApmAssetKind, raw: unknown) {
    const parsed = parseApmAsset(raw)
    if (parsed.kind !== kind) {
        throw new Error(`Registry payload kind mismatch. Expected '${kind}', received '${parsed.kind}'.`)
    }
    return parsed
}

function normalizeRepoResourcePath(value: unknown) {
    return typeof value === 'string'
        ? value.replace(/\\/g, '/').split('/').filter(Boolean).join('/')
        : ''
}

export async function installAsset(cwd: string, urn: string, force = false): Promise<InstalledAsset> {
    const { kind, owner, stage, name } = splitRegistryUrn(urn)
    await ensureApmAssetDir(cwd)
    if (kind === 'dance') {
        return installDanceAsset(cwd, urn, owner.replace(/^@/, ''), stage, name, force)
    }

    const filePath = assetFilePath(cwd, urn)
    if (!force && fss.existsSync(filePath)) {
        return { urn, filePath, skipped: true }
    }

    const pkgData = await fetchRegistryPackageRaw(kind, owner.replace(/^@/, ''), stage, name)
    const asset = parseRegistryAsset(kind, pkgData.payload)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(asset, null, 2), 'utf-8')
    return { urn, filePath, skipped: false }
}

async function installDanceAsset(
    cwd: string,
    urn: string,
    owner: string,
    stage: string,
    name: string,
    force: boolean,
): Promise<InstalledAsset> {
    const targetDir = danceAssetDir(cwd, urn)
    const skillMdPath = path.join(targetDir, 'SKILL.md')
    if (!force && fss.existsSync(skillMdPath)) {
        return { urn, filePath: skillMdPath, skipped: true }
    }

    const pkgData = await fetchRegistryPackageRaw('dance', owner, stage, name)
    const resource = isRecord(pkgData.resource) ? pkgData.resource : null
    if (
        !resource
        || resource.type !== 'github'
        || typeof resource.repo !== 'string'
        || !resource.repo.trim()
    ) {
        throw new Error(`Skill '${urn}' has no GitHub resource pointer. Import it from GitHub directly.`)
    }

    const repoUrl = `https://github.com/${resource.repo}.git`
    const repoPath = normalizeRepoResourcePath(resource.path)
    const ref = typeof resource.ref === 'string' && resource.ref.trim() ? resource.ref.trim() : 'main'
    const { tempDir, cleanup } = await shallowClone({ url: repoUrl, ref })
    try {
        const srcDir = repoPath ? path.join(tempDir, ...repoPath.split('/')) : tempDir
        if (!fss.existsSync(srcDir)) {
            throw new Error(`Skill directory '${repoPath || resource.path}' not found in repo '${resource.repo}'.`)
        }
        copySkillDir(srcDir, targetDir, { repoRoot: tempDir })
    } finally {
        await cleanup()
    }
    return { urn, filePath: skillMdPath, skipped: false }
}

export async function installPerformerWithDeps(cwd: string, performerUrn: string, force = false) {
    parseApmAssetUrn(performerUrn, 'performer')
    const installed: InstalledAsset[] = []
    const performerAsset = await installAsset(cwd, performerUrn, force)
    installed.push(performerAsset)

    const performer = parsePerformerAsset(JSON.parse(await fs.readFile(assetFilePath(cwd, performerUrn), 'utf-8')))
    if (performer.payload.tal) {
        installed.push(await installAsset(cwd, performer.payload.tal, force))
    }
    for (const danceUrn of performer.payload.dances || []) {
        installed.push(await installAsset(cwd, danceUrn, force))
    }

    return { performerUrn, installedAssets: installed }
}

export async function installActWithDependencies(cwd: string, actUrn: string, force = false) {
    parseApmAssetUrn(actUrn, 'act')
    const installed: InstalledAsset[] = []
    const seen = new Set<string>()
    const markInstalled = (asset: InstalledAsset) => {
        if (seen.has(asset.urn)) return
        seen.add(asset.urn)
        installed.push(asset)
    }

    const actAsset = await installAsset(cwd, actUrn, force)
    markInstalled(actAsset)
    const act = parseActAsset(JSON.parse(await fs.readFile(assetFilePath(cwd, actUrn), 'utf-8')))
    for (const participant of act.payload.participants) {
        if (!participant.performer || seen.has(participant.performer)) continue
        const result = await installPerformerWithDeps(cwd, participant.performer, force)
        result.installedAssets.forEach(markInstalled)
    }

    return { actUrn, actAsset, installedAssets: installed }
}

function getAuthFilePath() {
    return path.join(getGlobalApmAssetDir(), 'auth.json')
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    try {
        const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as unknown
        return isRecord(parsed) ? parsed : null
    } catch {
        return null
    }
}

function resolveTokenExpiry(payload: Record<string, unknown>) {
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null
}

function isExpiredEpochSeconds(expiresAt: number) {
    return expiresAt <= Math.floor(Date.now() / 1000)
}

export async function readAuthUser(): Promise<AuthUser | null> {
    try {
        const parsed = JSON.parse(await fs.readFile(getAuthFilePath(), 'utf-8')) as unknown
        if (!isRecord(parsed) || !parsed.token || !parsed.username) return null
        const token = String(parsed.token)
        const username = String(parsed.username)
        const expiresAt = typeof parsed.expiresAt === 'number' && Number.isFinite(parsed.expiresAt)
            ? parsed.expiresAt
            : resolveTokenExpiry(decodeJwtPayload(token) || {})
        if (typeof expiresAt === 'number' && isExpiredEpochSeconds(expiresAt)) {
            await clearAuthUser()
            return null
        }
        return { token, username }
    } catch {
        return null
    }
}

export async function saveAuthToken(token: string, username: string, expiresAt?: number) {
    const authFile = getAuthFilePath()
    await fs.mkdir(path.dirname(authFile), { recursive: true })
    await fs.writeFile(
        authFile,
        JSON.stringify({
            token,
            username,
            ...(typeof expiresAt === 'number' && Number.isFinite(expiresAt) ? { expiresAt } : {}),
        }, null, 2),
        'utf-8',
    )
}

export async function clearAuthUser() {
    try {
        await fs.unlink(getAuthFilePath())
    } catch (error) {
        if (!isNodeError(error, 'ENOENT')) throw error
    }
}

function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string) {
    return crypto.createHash('sha256').update(verifier).digest('base64url')
}

type LoginState = {
    server: http.Server
    authUrl: string
    timeout: NodeJS.Timeout
}

let loginState: LoginState | null = null

function clearLoginState() {
    if (!loginState) return
    clearTimeout(loginState.timeout)
    loginState.server.close()
    loginState = null
}

async function releaseStaleLoginPort() {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    try {
        await fetch(AUTH_REDIRECT_URI, { method: 'GET', signal: controller.signal }).catch(() => undefined)
        await new Promise((resolve) => setTimeout(resolve, 250))
    } finally {
        clearTimeout(timer)
    }
}

async function listenOnLoginPort(server: http.Server) {
    const tryListen = () => new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
            server.off('listening', onListening)
            reject(error)
        }
        const onListening = () => {
            server.off('error', onError)
            resolve()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(AUTH_CALLBACK_PORT)
    })

    try {
        await tryListen()
    } catch (error) {
        if (!isNodeError(error, 'EADDRINUSE')) throw error
        await releaseStaleLoginPort()
        try {
            await tryListen()
        } catch (retryError) {
            if (isNodeError(retryError, 'EADDRINUSE')) {
                throw new Error(`Port ${AUTH_CALLBACK_PORT} is already in use by another login flow.`)
            }
            throw retryError
        }
    }
}

export async function startLogin() {
    const existing = await readAuthUser()
    if (existing) {
        return { started: false, alreadyRunning: false, alreadyAuthenticated: true, username: existing.username }
    }
    if (loginState) {
        return {
            started: false,
            alreadyRunning: true,
            alreadyAuthenticated: false,
            authUrl: loginState.authUrl,
            browserOpened: false,
        }
    }

    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(AUTH_REDIRECT_URI)}&code_challenge=${codeChallenge}&code_challenge_method=s256`
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url || '/', `http://localhost:${AUTH_CALLBACK_PORT}`)
            if (url.pathname !== '/callback') {
                res.writeHead(404).end('Not Found')
                return
            }
            const code = url.searchParams.get('code')
            if (!code) {
                res.writeHead(400, { 'Content-Type': 'text/html' })
                res.end("<h2 style='color:red;text-align:center;font-family:sans-serif;margin-top:50px'>Authentication failed: No code received. You can close this window.</h2>")
                clearLoginState()
                return
            }
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.write("<h2 style='font-family:sans-serif;text-align:center;margin-top:50px'>Completing authentication... Please wait.</h2>")
            try {
                const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
                    body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
                })
                const data = await tokenRes.json() as {
                    access_token?: unknown
                    expires_at?: unknown
                    user?: { user_metadata?: Record<string, unknown> }
                    error_description?: unknown
                    msg?: unknown
                }
                if (!tokenRes.ok || typeof data.access_token !== 'string') {
                    throw new Error(String(data.error_description || data.msg || 'Failed to exchange token'))
                }
                const username = data.user?.user_metadata?.preferred_username || data.user?.user_metadata?.user_name
                if (typeof username !== 'string' || !username) {
                    throw new Error('Could not determine GitHub username from token.')
                }
                const expiresAt = typeof data.expires_at === 'number' && Number.isFinite(data.expires_at)
                    ? data.expires_at
                    : undefined
                await saveAuthToken(data.access_token, username, expiresAt)
                res.end("<script>document.body.innerHTML=\"<h2 style='color:green;font-family:sans-serif;text-align:center;margin-top:50px'>Authentication Successful! You can safely close this window.</h2>\";setTimeout(()=>window.close(),3000);</script>")
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                res.end(`<script>document.body.innerHTML="<h2 style='color:red;font-family:sans-serif;text-align:center;margin-top:50px'>Authentication Failed. ${escapeHtml(message)}</h2>";</script>`)
            } finally {
                clearLoginState()
            }
        } catch {
            try {
                res.writeHead(500).end('Server Error')
            } catch {
                // Ignore response failures during shutdown.
            }
            clearLoginState()
        }
    })

    await listenOnLoginPort(server)
    loginState = {
        server,
        authUrl,
        timeout: setTimeout(() => clearLoginState(), LOGIN_TIMEOUT_MS),
    }

    let browserOpened = true
    try {
        await open(authUrl)
    } catch {
        browserOpened = false
    }
    return { started: true, alreadyRunning: false, alreadyAuthenticated: false, authUrl, browserOpened }
}

export function parseUrn(urn: string): { kind: PublishableKind; owner: string; stage: string; name: string } | null {
    try {
        const parsed = parseApmAssetUrn(urn)
        if (parsed.kind === 'dance') return null
        return {
            kind: parsed.kind,
            owner: parsed.owner,
            stage: parsed.stage,
            name: parsed.name,
        }
    } catch {
        return null
    }
}

export async function existsInRegistry(urn: string) {
    const parsed = parseUrn(urn)
    if (!parsed) return false
    try {
        await getRegistryPackage(parsed.kind, parsed.owner, parsed.stage, parsed.name)
        return true
    } catch {
        return false
    }
}

export async function loadLocalAssetByUrn(cwd: string, urn: string): Promise<Record<string, unknown> | null> {
    try {
        return JSON.parse(await fs.readFile(assetFilePath(cwd, urn), 'utf-8')) as Record<string, unknown>
    } catch (error) {
        if (isNodeError(error, 'ENOENT')) return null
        throw error
    }
}

export function extractDependencyUrns(kind: PublishableKind, payload: unknown) {
    const urns: string[] = []
    if (kind === 'performer') {
        const performer = parsePerformerAsset(payload)
        if (typeof performer.payload.tal === 'string') {
            urns.push(performer.payload.tal)
        }
        urns.push(...(performer.payload.dances || []))
    } else if (kind === 'act') {
        const act = parseActAsset(payload)
        for (const participant of act.payload.participants) {
            urns.push(participant.performer)
        }
    }
    return Array.from(new Set(urns))
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
        return {
            type: 'github',
            owner,
            repo: repo.replace(/\.git$/, ''),
            url: `https://github.com/${owner}/${repo.replace(/\.git$/, '')}.git`,
            ref,
            subpath: subpath ? sanitizeSubpath(subpath) : undefined,
        }
    }

    const githubTreeMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)$/)
    if (githubTreeMatch) {
        const [, owner, repo, ref] = githubTreeMatch
        return {
            type: 'github',
            owner,
            repo: repo.replace(/\.git$/, ''),
            url: `https://github.com/${owner}/${repo.replace(/\.git$/, '')}.git`,
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
    return fss.realpathSync.native?.(configuredRoot) || fss.realpathSync(configuredRoot)
}

function copyFile(sourcePath: string, destinationPath: string) {
    fss.mkdirSync(path.dirname(destinationPath), { recursive: true })
    fss.copyFileSync(sourcePath, destinationPath)
}

function copyEntry(sourcePath: string, destinationPath: string, repoRoot: string, activeRealDirs: Set<string>) {
    const name = path.basename(sourcePath)
    if (name.startsWith('.')) return
    const sourceStat = fss.lstatSync(sourcePath)
    if (sourceStat.isSymbolicLink()) {
        const resolvedPath = fss.realpathSync(sourcePath)
        if (!isWithinDirectory(repoRoot, resolvedPath)) {
            throw new Error(`Skill contains a symlink outside the repository root: ${describeRepoPath(repoRoot, sourcePath)}`)
        }
        const resolvedStat = fss.statSync(resolvedPath)
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
    const realSourceDir = fss.realpathSync(sourceDir)
    if (!isWithinDirectory(repoRoot, realSourceDir)) {
        throw new Error(`Skill resolves outside the repository root: ${describeRepoPath(repoRoot, sourceDir)}`)
    }
    if (activeRealDirs.has(realSourceDir)) {
        throw new Error(`Skill contains a cyclic symlinked directory: ${describeRepoPath(repoRoot, sourceDir)}`)
    }
    activeRealDirs.add(realSourceDir)
    try {
        fss.mkdirSync(destinationDir, { recursive: true })
        for (const entry of fss.readdirSync(sourceDir, { withFileTypes: true })) {
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
    if (fss.existsSync(destDir)) {
        fss.rmSync(destDir, { recursive: true, force: true })
    }
    const repoRoot = resolveRepoRoot(srcDir, options)
    copyDirectory(srcDir, destDir, repoRoot, new Set())
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

async function discoverRecursive(dir: string, rootDir: string, seen: Set<string>, depth: number, maxDepth: number): Promise<DiscoveredSkill[]> {
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
        const meta = parseDanceFromSkillMd(rawContent)
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

export async function readPluginManifest(repoDir: string): Promise<{ skills: Array<{ name: string; path: string }> } | null> {
    const manifestPath = path.join(repoDir, '.claude-plugin', 'marketplace.json')
    const raw = await fs.readFile(manifestPath, 'utf-8').catch(() => null)
    if (!raw) return null
    try {
        const data = JSON.parse(raw) as unknown
        if (!isRecord(data)) return null
        const skills: Array<{ name: string; path: string }> = []
        if (Array.isArray(data.skills)) {
            for (const entry of data.skills) {
                if (isRecord(entry) && typeof entry.name === 'string' && typeof entry.path === 'string') {
                    skills.push({ name: entry.name, path: entry.path })
                }
            }
        }
        if (Array.isArray(data.plugins)) {
            for (const plugin of data.plugins) {
                if (!isRecord(plugin)) continue
                const pluginSource = typeof plugin.source === 'string' ? plugin.source : ''
                if (!Array.isArray(plugin.skills)) continue
                for (const skillPath of plugin.skills) {
                    if (typeof skillPath !== 'string') continue
                    const resolvedPath = pluginSource ? path.join(pluginSource, skillPath) : skillPath
                    skills.push({ name: path.basename(skillPath), path: resolvedPath })
                }
            }
        }
        return skills.length > 0 ? { skills } : null
    } catch {
        return null
    }
}

function lockFilePath(cwd: string) {
    return path.join(getApmAssetDir(cwd), LOCK_FILE)
}

export async function readSkillLock(cwd: string): Promise<SkillLock> {
    try {
        const data = JSON.parse(await fs.readFile(lockFilePath(cwd), 'utf-8')) as unknown
        if (
            isRecord(data)
            && data.version === 1
            && isRecord(data.skills)
        ) {
            return { version: 1, skills: data.skills as Record<string, Record<string, unknown>> }
        }
    } catch {
        // Treat missing or invalid lock files as an empty lock.
    }
    return { version: 1, skills: {} }
}

async function writeSkillLock(cwd: string, lock: SkillLock) {
    const filePath = lockFilePath(cwd)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(lock, null, 2), 'utf-8')
}

export async function upsertSkillLockEntry(cwd: string, urn: string, entry: SkillLockEntry) {
    const lock = await readSkillLock(cwd)
    const now = new Date().toISOString()
    const existing = lock.skills[urn]
    lock.skills[urn] = {
        ...entry,
        installedAt: typeof existing?.installedAt === 'string' ? existing.installedAt : now,
        updatedAt: now,
    }
    await writeSkillLock(cwd, lock)
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

export {
    ownerFromUrn,
    parseActAsset,
    parseApmAsset,
    parseApmAssetUrn,
    parsePerformerAsset,
    slugFromUrn,
}

export type {
    ActAsset,
    ActAssetPayloadV1,
    ActParticipantSubscriptionsV1,
    ActParticipantV1,
    ActRelationV1,
    PerformerAsset,
}
