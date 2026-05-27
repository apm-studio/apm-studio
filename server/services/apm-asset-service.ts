import fs from 'fs/promises'
import path from 'path'
import {
    assetFilePath,
    copySkillDir,
    danceAssetDir,
    ensureApmAssetDir,
    fetchRegistryPackageRaw,
    getApmAssetDir,
    getGlobalCwd,
    getGlobalApmAssetDir,
    initRegistry,
    parseActAsset,
    parseApmAsset,
    parsePerformerAsset,
    readAsset,
    searchRegistry,
    shallowClone,
    startLogin,
} from '../lib/apm-asset-source.js'
import type { PerformerAsset } from '../lib/apm-asset-source.js'
import type { AssetListItem } from '../../shared/asset-contracts.js'
import { clearApmAuthUser, readApmAuthUser, saveLocalStudioAsset, uninstallStudioAsset, type StudioAssetKind } from '../lib/apm-asset-authoring.js'
import { invalidate } from '../lib/cache.js'
import { findInstalledDependents, getRegistryAssetDetail } from './asset-service.js'

type RegistrySearchResult = {
    urn: string
    kind: 'tal' | 'dance' | 'performer' | 'act'
    name: string
    owner: string
    stage: string
    description: string
    tags: string[]
    updatedAt?: string
}

type InstalledAsset = {
    urn: string
    filePath: string
    skipped: boolean
}

function normalizeRepoResourcePath(value: unknown) {
    return typeof value === 'string'
        ? value.replace(/\\/g, '/').split('/').filter(Boolean).join('/')
        : ''
}

function splitRegistryUrn(urn: string) {
    const parts = urn.split('/')
    if (parts.length !== 4 || !parts[1].startsWith('@')) {
        throw new Error(`Invalid URN format: '${urn}'. Expected: <kind>/@<owner>/<stage>/<name>`)
    }
    const [kind, owner, stage, name] = parts
    if (kind !== 'tal' && kind !== 'dance' && kind !== 'act' && kind !== 'performer') {
        throw new Error(`Invalid kind: '${kind}'. Allowed: tal, dance, act, performer`)
    }
    return { kind, owner, stage, name }
}

async function installRegistryAssetNormalized(cwd: string, urn: string, force = false): Promise<InstalledAsset> {
    const { kind, owner, stage, name } = splitRegistryUrn(urn)
    await ensureApmAssetDir(cwd)

    if (kind === 'dance') {
        return installRegistryDanceNormalized(cwd, urn, owner.replace(/^@/, ''), stage, name, force)
    }

    const filePath = assetFilePath(cwd, urn)
    if (!force && await fs.access(filePath).then(() => true).catch(() => false)) {
        return { urn, filePath, skipped: true }
    }

    const pkgData = await fetchRegistryPackageRaw(kind, owner.replace(/^@/, ''), stage, name)
    const asset = parseApmAsset(pkgData.payload)
    if (asset.kind !== kind) {
        throw new Error(`Registry payload kind mismatch. Expected '${kind}', received '${asset.kind}'.`)
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(asset, null, 2), 'utf-8')
    return { urn, filePath, skipped: false }
}

async function installRegistryDanceNormalized(
    cwd: string,
    urn: string,
    owner: string,
    stage: string,
    name: string,
    force: boolean,
): Promise<InstalledAsset> {
    const targetDir = danceAssetDir(cwd, urn)
    const skillMdPath = path.join(targetDir, 'SKILL.md')
    if (!force && await fs.access(skillMdPath).then(() => true).catch(() => false)) {
        return { urn, filePath: skillMdPath, skipped: true }
    }

    const pkgData = await fetchRegistryPackageRaw('dance', owner, stage, name)
    const resource = pkgData.resource as { type?: unknown; repo?: unknown; path?: unknown; ref?: unknown } | undefined
    if (!resource || resource.type !== 'github' || typeof resource.repo !== 'string' || !resource.repo.trim()) {
        throw new Error(`Skill '${urn}' has no GitHub resource pointer. Use APM Studio GitHub import to install it directly.`)
    }

    const repoPath = normalizeRepoResourcePath(resource.path)
    const repoUrl = `https://github.com/${resource.repo}.git`
    const ref = typeof resource.ref === 'string' && resource.ref.trim() ? resource.ref.trim() : 'main'
    const { tempDir, cleanup } = await shallowClone({ url: repoUrl, ref })

    try {
        const srcDir = repoPath ? path.join(tempDir, ...repoPath.split('/')) : tempDir
        if (!await fs.access(srcDir).then(() => true).catch(() => false)) {
            throw new Error(`Skill directory '${repoPath || resource.path}' not found in repo '${resource.repo}'.`)
        }
        copySkillDir(srcDir, targetDir, { repoRoot: tempDir })
    } finally {
        await cleanup()
    }

    return { urn, filePath: skillMdPath, skipped: false }
}

async function installRegistryPerformerWithDepsNormalized(cwd: string, performerUrn: string, force = false) {
    const installed: InstalledAsset[] = []
    const performerAsset = await installRegistryAssetNormalized(cwd, performerUrn, force)
    installed.push(performerAsset)

    const performer = parsePerformerAsset(JSON.parse(await fs.readFile(assetFilePath(cwd, performerUrn), 'utf-8')))
    if (performer.payload.tal) {
        installed.push(await installRegistryAssetNormalized(cwd, performer.payload.tal, force))
    }
    for (const danceUrn of performer.payload.dances || []) {
        installed.push(await installRegistryAssetNormalized(cwd, danceUrn, force))
    }

    return { performerUrn, installedAssets: installed }
}

async function installRegistryActWithDependenciesNormalized(cwd: string, actUrn: string, force = false) {
    const installed: InstalledAsset[] = []
    const seen = new Set<string>()
    const markInstalled = (asset: InstalledAsset) => {
        if (seen.has(asset.urn)) return
        seen.add(asset.urn)
        installed.push(asset)
    }

    const actAsset = await installRegistryAssetNormalized(cwd, actUrn, force)
    markInstalled(actAsset)
    const act = parseActAsset(JSON.parse(await fs.readFile(assetFilePath(cwd, actUrn), 'utf-8')))

    for (const participant of act.payload.participants || []) {
        const performerUrn = participant.performer
        if (!performerUrn || seen.has(performerUrn)) continue
        const result = await installRegistryPerformerWithDepsNormalized(cwd, performerUrn, force)
        result.installedAssets.forEach(markInstalled)
    }

    return { actUrn, actAsset, installedAssets: installed }
}

function toRegistrySearchAsset(result: RegistrySearchResult): AssetListItem {
    return {
        kind: result.kind,
        urn: result.urn,
        slug: result.name,
        name: result.name,
        author: `@${result.owner.replace(/^@/, '')}`,
        source: 'registry',
        description: result.description || '',
        tags: Array.isArray(result.tags) ? result.tags : [],
        ...(result.updatedAt ? { updatedAt: result.updatedAt } : {}),
    } as AssetListItem
}

export function resolveApmAssetCwd(cwd: string, scope?: string) {
    if (scope === 'global') {
        return getGlobalCwd()
    }
    return cwd
}

export async function getApmAssetStatus(cwd: string) {
    const apmAssetDir = getApmAssetDir(cwd)
    const globalApmAssetDir = getGlobalApmAssetDir()
    const [stageExists, globalExists] = await Promise.all([
        fs.access(apmAssetDir).then(() => true).catch(() => false),
        fs.access(globalApmAssetDir).then(() => true).catch(() => false),
    ])

    return {
        initialized: stageExists || globalExists,
        stageInitialized: stageExists,
        globalInitialized: globalExists,
        apmAssetDir,
        globalApmAssetDir,
        projectDir: cwd,
    }
}

export async function getApmAssetStatusSnapshot(cwd: string) {
    try {
        return await getApmAssetStatus(cwd)
    } catch {
        return {
            initialized: false,
            stageInitialized: false,
            globalInitialized: false,
            apmAssetDir: '',
            globalApmAssetDir: '',
            projectDir: cwd,
        }
    }
}

export async function getApmAssetPerformer(cwd: string, urn: string): Promise<PerformerAsset | null> {
    const raw = await readAsset(cwd, urn)
    if (!raw) return null
    try {
        return parsePerformerAsset(raw)
    } catch {
        return null
    }
}

export async function searchApmAssetRegistry(query: string, options: { kind?: string | null; limit: number }) {
    const results = await searchRegistry(query, {
        kind: options.kind || undefined,
        limit: options.limit,
    })

    return Promise.all(results.map(async (result) => {
        const typedResult = result as RegistrySearchResult
        const fallback = toRegistrySearchAsset(typedResult)

        if (typedResult.kind !== 'performer' && typedResult.kind !== 'act') {
            return fallback
        }

        try {
            return await getRegistryAssetDetail(
                '',
                typedResult.kind,
                typedResult.owner,
                `${typedResult.stage}/${typedResult.name}`,
            )
        } catch {
            return fallback
        }
    }))
}

const SKILLS_SH_API = 'https://skills.sh/api/search'

export async function searchSkillsCatalog(query: string, limit = 10) {
    if (!query.trim()) return []
    const url = `${SKILLS_SH_API}?q=${encodeURIComponent(query)}&limit=${limit}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = (await res.json()) as {
        skills: Array<{ id: string; name: string; installs: number; source: string }>
    }
    return (data.skills || []).map((skill) => ({
        urn: `dance/@${skill.source || 'skills.sh'}/${skill.name}`,
        kind: 'dance',
        name: skill.name,
        owner: skill.source || 'skills.sh',
        stage: skill.source?.split('/')[1] || '',
        description: `${formatInstalls(skill.installs)} · from ${skill.source || 'skills.sh'}`,
        tags: ['skills.sh'] as string[],
        installs: skill.installs,
    }))
}

function formatInstalls(count: number): string {
    if (!count || count <= 0) return '0 installs'
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M installs`
    if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K installs`
    return `${count} install${count === 1 ? '' : 's'}`
}

/** Validates canonical performer assets after parsing. */
export function validateApmAssetPerformer(performer: PerformerAsset): void {
    // Canonical assets are already validated by parsePerformerAsset,
    // but we can add extra runtime checks if needed.
    if (!performer.payload.tal && (!performer.payload.dances || performer.payload.dances.length === 0)) {
        throw new Error("Invalid agent: at least one Instruction or Skill must be present.")
    }
}

export async function initApmAssetRegistry(cwd: string, scope?: string) {
    const targetCwd = resolveApmAssetCwd(cwd, scope)
    await initRegistry(targetCwd)
    return {
        ok: true,
        apmAssetDir: getApmAssetDir(targetCwd),
        scope: scope || 'stage',
    }
}

export async function installApmAsset(cwd: string, input: {
    urn: string
    force?: boolean
    scope?: 'global' | 'stage'
}) {
    const targetCwd = resolveApmAssetCwd(cwd, input.scope)
    await ensureApmAssetDir(targetCwd)

    if (input.urn.startsWith('performer/')) {
        const result = await installRegistryPerformerWithDepsNormalized(targetCwd, input.urn, input.force)
        invalidate('assets')
        return { ...result, scope: input.scope || 'stage' }
    }

    if (input.urn.startsWith('act/')) {
        const result = await installRegistryActWithDependenciesNormalized(targetCwd, input.urn, input.force)
        invalidate('assets')
        return { ...result, scope: input.scope || 'stage' }
    }

    const result = await installRegistryAssetNormalized(targetCwd, input.urn, input.force)
    invalidate('assets')
    return { ...result, scope: input.scope || 'stage' }
}

export async function getApmAuthUser() {
    const auth = await readApmAuthUser()
    return {
        authenticated: !!auth,
        username: auth?.username || null,
    }
}

export async function loginToApm() {
    const result = await startLogin()
    return { ok: true, ...result }
}

export async function logoutFromApm() {
    await clearApmAuthUser()
    return { ok: true }
}

export async function saveApmLocalAsset(cwd: string, input: {
    kind: StudioAssetKind
    slug: string
    stage?: string
    author?: string
    payload: unknown
}) {
    const auth = await readApmAuthUser()
    const author = input.author || auth?.username
    if (!author) {
        throw new Error('No author available. Sign in to APM Studio first.')
    }

    const saved = await saveLocalStudioAsset({
        cwd,
        kind: input.kind,
        author,
        slug: input.slug,
        stage: input.stage,
        payload: input.payload,
    })
    invalidate('assets')
    return { ok: true, ...saved }
}

export async function uninstallApmAsset(cwd: string, input: {
    kind: StudioAssetKind
    urn: string
    cascade?: boolean
}) {
    const deletedUrns: string[] = []

    if (input.cascade) {
        const plan = await findInstalledDependents(cwd, input.urn)
        // Delete dependents first (bottom-up: acts before performers)
        const sortedDependents = [...plan.dependents].sort((a, b) => {
            const order: Record<string, number> = { act: 0, performer: 1, dance: 2, tal: 3 }
            return (order[a.kind] ?? 9) - (order[b.kind] ?? 9)
        })
        for (const dep of sortedDependents) {
            try {
                await uninstallStudioAsset(cwd, dep.urn)
                deletedUrns.push(dep.urn)
            } catch { /* skip already-deleted */ }
        }
    }

    const result = await uninstallStudioAsset(cwd, input.urn)
    deletedUrns.push(input.urn)
    invalidate('assets')
    return { ok: true, ...result, deletedUrns }
}

export async function previewUninstallApmAsset(cwd: string, input: {
    kind: StudioAssetKind
    urn: string
}) {
    return findInstalledDependents(cwd, input.urn)
}
