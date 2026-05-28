import crypto from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type {
    ApmExportUnit,
    ApmPackageManifest,
    ApmPackageSummary,
    ApmSyncRunRequest,
    ApmSyncRunResponse,
    ApmSyncTargetDefinitionKind,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetItemSummary,
    ApmSyncTargetId,
    ApmSyncTargetsResponse,
} from '../../../shared/apm-contracts.js'
import {
    projectAgentPackageToTarget,
} from '../agent-projection/index.js'
import {
    runApmCliInstall,
    selectApmCliRunner,
} from './apm-cli-runner.js'
import {
    DEFAULT_EXPORT_UNIT,
    exportTargetProfile,
    listExportTargetProfiles,
    normalizeExportUnit,
    targetSupportsExportUnit,
} from './export-targets.js'
import { readManifestFile } from './package-files.js'
import {
    manifestPathForRead,
    packageDirForRead,
    sourceDirForRead,
    toPosixPath,
} from './paths.js'
import { getApmToolingStatus } from './tooling.js'
import { listApmPackages } from './repository.js'
import { isRecord, yamlString } from './yaml-io.js'

type ExportOwnershipManifest = {
    version: 1
    files: Record<string, {
        hash: string
        packageId: string
        target: ApmSyncTargetId
        exportUnit: ApmExportUnit
        updatedAt: string
        source: 'apm-cli'
    }>
}

type TempPackage = {
    rootDir: string
    workspaceDir: string
    homeDir: string
    packageRoot: string
}

type ManagedWriteContext = {
    workingDir: string
    packageId: string
    target: ApmSyncTargetId
    exportUnit: ApmExportUnit
    ownership: ExportOwnershipManifest
}

const EXPORT_OWNERSHIP_RELATIVE_PATH = '.apm-studio/projections/apm-export.json'

type TargetDefinitionRule = {
    dir?: string
    files?: string[]
    kind: ApmSyncTargetDefinitionKind
    exportUnit?: ApmExportUnit
    maxDepth?: number
    extensions?: string[]
    basenames?: string[]
}

const TARGET_DEFINITION_RULES: Record<ApmSyncTargetId, TargetDefinitionRule[]> = {
    codex: [
        { dir: '.codex/agents', kind: 'agent', exportUnit: 'agents', maxDepth: 1, extensions: ['.toml', '.md'] },
        { dir: '.codex/skills', kind: 'skill', exportUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { dir: '.agents/skills', kind: 'skill', exportUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { files: ['.codex/config.toml', '.codex/mcp.json'], kind: 'mcp', exportUnit: 'mcp' },
    ],
    claude: [
        { dir: '.claude/agents', kind: 'agent', exportUnit: 'agents', maxDepth: 1, extensions: ['.md'] },
        { dir: '.claude/skills', kind: 'skill', exportUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { dir: '.claude/instructions', kind: 'instruction', exportUnit: 'instructions', maxDepth: 2, extensions: ['.md'] },
        { files: ['.claude/CLAUDE.md'], kind: 'instruction', exportUnit: 'instructions' },
        { files: ['.mcp.json', '.claude/mcp.json'], kind: 'mcp', exportUnit: 'mcp' },
    ],
    opencode: [
        { dir: '.opencode/agents', kind: 'agent', exportUnit: 'agents', maxDepth: 2, extensions: ['.md', '.json', '.yaml', '.yml', '.toml', ''] },
        { dir: '.opencode/skills', kind: 'skill', exportUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { dir: '.agents/skills', kind: 'skill', exportUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { files: ['opencode.json', '.opencode/opencode.json'], kind: 'mcp', exportUnit: 'mcp' },
    ],
    cursor: [
        { dir: '.cursor/agents', kind: 'agent', exportUnit: 'agents', maxDepth: 2, extensions: ['.md', '.json', '.yaml', '.yml', '.toml'] },
        { dir: '.cursor/rules', kind: 'instruction', exportUnit: 'instructions', maxDepth: 2, extensions: ['.md', '.mdc'] },
        { dir: '.agents/skills', kind: 'skill', exportUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { files: ['.cursor/mcp.json'], kind: 'mcp', exportUnit: 'mcp' },
    ],
    windsurf: [
        { dir: '.windsurf/rules', kind: 'instruction', exportUnit: 'instructions', maxDepth: 2, extensions: ['.md'] },
        { dir: '.windsurf/skills', kind: 'skill', exportUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { files: ['.windsurf/mcp_config.json'], kind: 'mcp', exportUnit: 'mcp' },
    ],
    copilot: [
        { dir: '.github/agents', kind: 'agent', exportUnit: 'agents', maxDepth: 2, extensions: ['.md', '.yaml', '.yml'] },
        { dir: '.github/instructions', kind: 'instruction', exportUnit: 'instructions', maxDepth: 2, extensions: ['.md'] },
        { files: ['.github/copilot-instructions.md'], kind: 'instruction', exportUnit: 'instructions' },
        { dir: '.agents/skills', kind: 'skill', exportUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { files: ['.github/mcp.json'], kind: 'mcp', exportUnit: 'mcp' },
    ],
    gemini: [
        { dir: '.gemini/skills', kind: 'skill', exportUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { dir: '.agents/skills', kind: 'skill', exportUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { files: ['.gemini/GEMINI.md'], kind: 'config' },
        { files: ['.gemini/settings.json', '.gemini/mcp.json'], kind: 'mcp', exportUnit: 'mcp' },
    ],
    'agent-skills': [
        { dir: '.agents/skills', kind: 'skill', exportUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
    ],
}

function assertTarget(value: string): asserts value is ApmSyncTargetId {
    exportTargetProfile(value as ApmSyncTargetId)
}

function normalizeTargets(request: ApmSyncRunRequest) {
    const values = [
        ...(request.targets || []),
        ...(request.target ? [request.target] : []),
    ]
    const targets: ApmSyncTargetId[] = []
    const seen = new Set<string>()
    for (const value of values) {
        assertTarget(value)
        if (seen.has(value)) continue
        seen.add(value)
        targets.push(value)
    }
    if (targets.length === 0) {
        throw new Error('At least one APM sync target is required.')
    }
    return targets
}

function mcpCount(pkg: ApmPackageSummary) {
    return pkg.kind === 'mcp' ? 1 : pkg.agentComponents?.mcp || 0
}

function packagePrimitiveUnits(pkg: ApmPackageSummary): ApmExportUnit[] {
    const counts = pkg.microsoftApm?.primitiveCounts
    const units: ApmExportUnit[] = []
    if ((counts?.agents || 0) > 0) units.push('agents')
    if ((counts?.instructions || 0) > 0) units.push('instructions')
    if ((counts?.skills || 0) > 0) units.push('skills')
    if (mcpCount(pkg) > 0) units.push('mcp')
    return units
}

function packageHasExportUnit(pkg: ApmPackageSummary, exportUnit: ApmExportUnit) {
    if (exportUnit === 'agent-packages') {
        return packagePrimitiveUnits(pkg).length > 0
    }
    return packagePrimitiveUnits(pkg).includes(exportUnit)
}

function targetSupportsPackage(target: ApmSyncTargetId, pkg: ApmPackageSummary, exportUnit: ApmExportUnit) {
    if (exportUnit !== 'agent-packages') {
        return targetSupportsExportUnit(target, exportUnit)
    }
    const primitiveUnits = packagePrimitiveUnits(pkg)
    return primitiveUnits.length > 0
        && primitiveUnits.every((unit) => targetSupportsExportUnit(target, unit))
}

function hashBuffer(content: Buffer | string) {
    return crypto.createHash('sha256').update(content).digest('hex')
}

async function readOwnershipManifest(workingDir: string): Promise<ExportOwnershipManifest> {
    const filePath = path.join(workingDir, EXPORT_OWNERSHIP_RELATIVE_PATH)
    const raw = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (!raw) return { version: 1, files: {} }
    try {
        const parsed = JSON.parse(raw) as ExportOwnershipManifest
        return parsed.version === 1 && isRecord(parsed.files)
            ? parsed
            : { version: 1, files: {} }
    } catch {
        return { version: 1, files: {} }
    }
}

async function writeOwnershipManifest(workingDir: string, manifest: ExportOwnershipManifest) {
    const filePath = path.join(workingDir, EXPORT_OWNERSHIP_RELATIVE_PATH)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
}

function summarizeTargetItems(ownership: ExportOwnershipManifest, target: ApmSyncTargetId): ApmSyncTargetItemSummary[] {
    const groups = new Map<string, ApmSyncTargetItemSummary>()
    for (const [artifact, entry] of Object.entries(ownership.files)) {
        if (entry.target !== target) continue
        const key = `${entry.packageId}:${entry.exportUnit}`
        const current = groups.get(key)
        if (current) {
            current.artifacts.push(artifact)
            current.artifactCount = current.artifacts.length
            if (entry.updatedAt > current.updatedAt) current.updatedAt = entry.updatedAt
            continue
        }
        groups.set(key, {
            packageId: entry.packageId,
            target,
            exportUnit: entry.exportUnit,
            artifactCount: 1,
            artifacts: [artifact],
            updatedAt: entry.updatedAt,
        })
    }

    return Array.from(groups.values())
        .map((item) => ({
            ...item,
            artifacts: item.artifacts.sort((left, right) => left.localeCompare(right)),
        }))
        .sort((left, right) => (
            right.updatedAt.localeCompare(left.updatedAt)
            || left.packageId.localeCompare(right.packageId)
            || left.exportUnit.localeCompare(right.exportUnit)
        ))
}

function definitionName(relativePath: string) {
    const parts = relativePath.split('/')
    const basename = parts.at(-1) || relativePath
    if (basename.toLowerCase() === 'skill.md' && parts.length > 1) {
        return parts.at(-2) || basename
    }
    return basename
        .replace(/\.(agent|instructions|prompt)\.md$/i, '')
        .replace(/\.(toml|md|mdc|json|ya?ml)$/i, '')
}

function ruleIncludes(relativePath: string, rule: TargetDefinitionRule) {
    const basename = relativePath.split('/').at(-1) || relativePath
    if (rule.basenames?.includes(basename)) return true
    const ext = path.extname(basename)
    return rule.extensions?.includes(ext) || (ext === '' && rule.extensions?.includes('')) || false
}

async function walkDefinitionFiles(rootDir: string, maxDepth: number): Promise<string[]> {
    const files: string[] = []
    async function walk(current: string, depth: number) {
        if (depth > maxDepth) return
        const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue
            const next = path.join(current, entry.name)
            if (entry.isDirectory()) {
                await walk(next, depth + 1)
            } else if (entry.isFile()) {
                files.push(next)
            }
        }
    }
    await walk(rootDir, 1)
    return files
}

async function collectTargetDefinitions(
    workingDir: string,
    target: ApmSyncTargetId,
    ownership: ExportOwnershipManifest,
): Promise<ApmSyncTargetDefinitionSummary[]> {
    const definitions = new Map<string, ApmSyncTargetDefinitionSummary>()
    const addDefinition = async (relativePath: string, rule: TargetDefinitionRule) => {
        const normalizedPath = toPosixPath(relativePath).replace(/^\/+/, '')
        const stat = await fs.stat(path.join(workingDir, normalizedPath)).catch(() => null)
        if (!stat?.isFile()) return
        const managedEntry = ownership.files[normalizedPath]
        definitions.set(`${target}:${normalizedPath}`, {
            id: `${target}:${normalizedPath}`,
            target,
            name: definitionName(normalizedPath),
            kind: rule.kind,
            path: normalizedPath,
            ...(rule.exportUnit ? { exportUnit: rule.exportUnit } : {}),
            managed: Boolean(managedEntry),
            ...(managedEntry ? {
                managedPackageId: managedEntry.packageId,
                managedExportUnit: managedEntry.exportUnit,
                updatedAt: managedEntry.updatedAt,
            } : {}),
        })
    }

    for (const rule of TARGET_DEFINITION_RULES[target]) {
        for (const file of rule.files || []) {
            await addDefinition(file, rule)
        }
        if (!rule.dir) continue
        const rootDir = path.join(workingDir, rule.dir)
        const files = await walkDefinitionFiles(rootDir, rule.maxDepth || 1)
        for (const filePath of files) {
            const relativePath = toPosixPath(path.relative(workingDir, filePath))
            if (ruleIncludes(relativePath, rule)) {
                await addDefinition(relativePath, rule)
            }
        }
    }

    return Array.from(definitions.values())
        .sort((left, right) => (
            left.kind.localeCompare(right.kind)
            || left.name.localeCompare(right.name)
            || left.path.localeCompare(right.path)
        ))
}

async function writeManagedFile(relativePath: string, content: Buffer, context: ManagedWriteContext) {
    const normalizedRelativePath = toPosixPath(relativePath).replace(/^\/+/, '')
    const filePath = path.join(context.workingDir, normalizedRelativePath)
    const nextHash = hashBuffer(content)
    const currentContent = await fs.readFile(filePath).catch(() => null)
    const currentHash = currentContent === null ? null : hashBuffer(currentContent)
    const previous = context.ownership.files[normalizedRelativePath]

    if (currentHash && currentHash !== nextHash && previous?.hash !== currentHash) {
        throw new Error(`Refusing to overwrite unmanaged target file: ${normalizedRelativePath}`)
    }

    if (currentHash !== nextHash) {
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, content)
    }

    context.ownership.files[normalizedRelativePath] = {
        hash: nextHash,
        packageId: context.packageId,
        target: context.target,
        exportUnit: context.exportUnit,
        updatedAt: new Date().toISOString(),
        source: 'apm-cli',
    }
    return normalizedRelativePath
}

async function walkFiles(dir: string): Promise<string[]> {
    const files: string[] = []
    async function walk(current: string) {
        const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
            const next = path.join(current, entry.name)
            if (entry.isDirectory()) {
                await walk(next)
            } else if (entry.isFile()) {
                files.push(next)
            }
        }
    }
    await walk(dir)
    return files.sort((left, right) => left.localeCompare(right))
}

async function collectCliArtifacts(tempWorkspace: string, target: ApmSyncTargetId) {
    const profile = exportTargetProfile(target)
    const artifacts: string[] = []
    for (const root of profile.artifactRoots) {
        const absoluteRoot = path.join(tempWorkspace, root)
        const files = await walkFiles(absoluteRoot)
        artifacts.push(...files.map((filePath) => toPosixPath(path.relative(tempWorkspace, filePath))))
    }
    for (const file of profile.projectArtifactFiles || []) {
        const absolutePath = path.join(tempWorkspace, file)
        const stat = await fs.stat(absolutePath).catch(() => null)
        if (stat?.isFile()) artifacts.push(toPosixPath(file))
    }
    return Array.from(new Set(artifacts)).sort((left, right) => left.localeCompare(right))
}

async function applyCliArtifacts(tempPackage: TempPackage, workingDir: string, packageId: string, target: ApmSyncTargetId, exportUnit: ApmExportUnit) {
    const relativeArtifacts = await collectCliArtifacts(tempPackage.workspaceDir, target)
    const ownership = await readOwnershipManifest(workingDir)
    const context: ManagedWriteContext = {
        workingDir,
        packageId,
        target,
        exportUnit,
        ownership,
    }
    const written: string[] = []
    for (const artifact of relativeArtifacts) {
        const content = await fs.readFile(path.join(tempPackage.workspaceDir, artifact))
        written.push(await writeManagedFile(artifact, content, context))
    }
    await writeOwnershipManifest(workingDir, ownership)
    return written
}

function filteredManifest(manifest: ApmPackageManifest, exportUnit: ApmExportUnit): ApmPackageManifest {
    const includeMcp = exportUnit === 'agent-packages' || exportUnit === 'mcp'
    return {
        name: manifest.name,
        version: manifest.version || '0.1.0',
        ...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
        type: manifest.type || 'hybrid',
        includes: 'auto',
        dependencies: {
            apm: [],
            mcp: includeMcp && Array.isArray(manifest.dependencies?.mcp)
                ? manifest.dependencies.mcp
                : [],
        },
        scripts: {},
    }
}

function primitiveDirName(exportUnit: ApmExportUnit) {
    switch (exportUnit) {
        case 'agents':
            return 'agents'
        case 'instructions':
            return 'instructions'
        case 'skills':
            return 'skills'
        default:
            return null
    }
}

async function copyIfExists(source: string, target: string) {
    const stat = await fs.stat(source).catch(() => null)
    if (!stat) return false
    await fs.cp(source, target, { recursive: true, force: true })
    return true
}

async function createTempPackage(
    workingDir: string,
    packageId: string,
    exportUnit: ApmExportUnit,
): Promise<TempPackage> {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-export-'))
    const workspaceDir = path.join(rootDir, 'workspace')
    const homeDir = path.join(rootDir, 'home')
    const packageRoot = path.join(rootDir, 'package')
    await Promise.all([
        fs.mkdir(workspaceDir, { recursive: true }),
        fs.mkdir(homeDir, { recursive: true }),
    ])

    if (exportUnit === 'agent-packages') {
        await fs.cp(await packageDirForRead(workingDir, packageId), packageRoot, {
            recursive: true,
            force: true,
        })
        return { rootDir, workspaceDir, homeDir, packageRoot }
    }

    const manifest = await readManifestFile(await manifestPathForRead(workingDir, packageId))
    if (!manifest) {
        throw new Error(`Unable to read APM package manifest for ${packageId}.`)
    }
    await fs.mkdir(packageRoot, { recursive: true })
    await fs.writeFile(path.join(packageRoot, 'apm.yml'), yamlString(filteredManifest(manifest, exportUnit)), 'utf-8')

    const dirName = primitiveDirName(exportUnit)
    if (dirName) {
        await copyIfExists(
            path.join(await sourceDirForRead(workingDir, packageId), dirName),
            path.join(packageRoot, '.apm', dirName),
        )
    }
    return { rootDir, workspaceDir, homeDir, packageRoot }
}

async function runCliFirstExport(
    workingDir: string,
    pkg: ApmPackageSummary,
    target: ApmSyncTargetId,
    exportUnit: ApmExportUnit,
    frozen: boolean | undefined,
) {
    const runner = await selectApmCliRunner()
    if (!runner) {
        throw new Error('No APM CLI runner is available.')
    }

    const tempPackage = await createTempPackage(workingDir, pkg.packageId, exportUnit)
    try {
        const result = await runApmCliInstall(runner, tempPackage.packageRoot, target, {
            cwd: tempPackage.workspaceDir,
            frozen,
            env: {
                HOME: tempPackage.homeDir,
                APM_CACHE_DIR: path.join(tempPackage.rootDir, 'cache'),
            },
        })
        const artifacts = await applyCliArtifacts(tempPackage, workingDir, pkg.packageId, target, exportUnit)
        return {
            packageId: pkg.packageId,
            name: pkg.agentName || pkg.name,
            target,
            exportUnit,
            command: result.command,
            status: artifacts.length > 0 ? 'synced' as const : 'skipped' as const,
            projectedAs: `${exportTargetProfile(target).label} ${exportUnit}`,
            artifacts,
            warnings: artifacts.length > 0
                ? []
                : ['APM CLI completed but produced no project-scoped artifacts for this target.'],
            stdout: result.stdout || artifacts.join('\n'),
            stderr: result.stderr || undefined,
            modelOmitted: true,
        }
    } finally {
        await fs.rm(tempPackage.rootDir, { recursive: true, force: true }).catch(() => {})
    }
}

async function runStudioFallback(
    workingDir: string,
    pkg: ApmPackageSummary,
    target: ApmSyncTargetId,
    exportUnit: ApmExportUnit,
    reason: string,
) {
    if (exportUnit === 'instructions' || exportUnit === 'mcp') {
        return {
            packageId: pkg.packageId,
            name: pkg.agentName || pkg.name,
            target,
            exportUnit,
            command: `apm-studio fallback ${pkg.packageId} --target ${target} --unit ${exportUnit}`,
            status: 'skipped' as const,
            projectedAs: `${exportTargetProfile(target).label} ${exportUnit}`,
            warnings: [reason, `Studio fallback does not export ${exportUnit} yet.`],
        }
    }

    const fallbackUnit = exportUnit === 'agent-packages' ? 'agent-packages' : exportUnit
    const result = await projectAgentPackageToTarget(workingDir, pkg.packageId, target, fallbackUnit)
    return {
        ...result,
        exportUnit,
        warnings: [
            reason,
            ...(result.warnings || []),
        ],
    }
}

export async function getApmSyncTargets(workingDir?: string): Promise<ApmSyncTargetsResponse> {
    const tooling = await getApmToolingStatus()
    const ownership = workingDir ? await readOwnershipManifest(workingDir) : { version: 1, files: {} } satisfies ExportOwnershipManifest
    const profiles = listExportTargetProfiles()
    const definitionsByTarget = new Map<ApmSyncTargetId, ApmSyncTargetDefinitionSummary[]>()
    if (workingDir) {
        await Promise.all(profiles.map(async (target) => {
            definitionsByTarget.set(target.id, await collectTargetDefinitions(workingDir, target.id, ownership))
        }))
    }
    return {
        tooling: {
            ...tooling,
            deploymentNote: 'APM Studio exports Studio agent packages and APM primitives with an APM CLI-first pipeline. Studio fallback handles supported agent and skill projections when the CLI path is unavailable.',
        },
        targets: profiles.map((target) => ({
            id: target.id,
            label: target.label,
            description: target.description,
            outputHint: target.outputHint,
            available: true,
            commandPreview: `${tooling.recommendedCommand || 'Studio fallback'} install <package> --target ${target.id}`,
            supportedExportUnits: target.supportedExportUnits,
            strategy: target.strategy,
            currentItems: summarizeTargetItems(ownership, target.id),
            definitions: definitionsByTarget.get(target.id) || [],
        })),
    }
}

export async function runApmTargetSync(
    workingDir: string,
    request: ApmSyncRunRequest,
): Promise<ApmSyncRunResponse> {
    const targets = normalizeTargets(request)
    const exportUnit = normalizeExportUnit(request.exportUnit || DEFAULT_EXPORT_UNIT)
    const startedAt = Date.now()
    const selected = new Set((request.packageIds || []).filter(Boolean))
    const packages = (await listApmPackages(workingDir))
        .filter((pkg) => selected.size === 0 || selected.has(pkg.packageId))

    const results: ApmSyncRunResponse['results'] = []
    for (const pkg of packages) {
        for (const target of targets) {
            if (!packageHasExportUnit(pkg, exportUnit)) {
                results.push({
                    packageId: pkg.packageId,
                    name: pkg.agentName || pkg.name,
                    target,
                    exportUnit,
                    command: `apm-studio export ${pkg.packageId} --target ${target} --unit ${exportUnit}`,
                    status: 'skipped',
                    projectedAs: `${exportTargetProfile(target).label} ${exportUnit}`,
                    warnings: [`Package does not contain ${exportUnit === 'agent-packages' ? 'exportable primitives' : exportUnit}.`],
                })
                continue
            }
            if (!targetSupportsPackage(target, pkg, exportUnit)) {
                results.push({
                    packageId: pkg.packageId,
                    name: pkg.agentName || pkg.name,
                    target,
                    exportUnit,
                    command: `apm-studio export ${pkg.packageId} --target ${target} --unit ${exportUnit}`,
                    status: 'skipped',
                    projectedAs: `${exportTargetProfile(target).label} ${exportUnit}`,
                    warnings: [`${exportTargetProfile(target).label} does not support all selected export units for this package.`],
                })
                continue
            }

            try {
                results.push(await runCliFirstExport(workingDir, pkg, target, exportUnit, request.frozen))
            } catch (error) {
                const reason = error instanceof Error ? error.message : 'APM CLI export failed.'
                try {
                    results.push(await runStudioFallback(workingDir, pkg, target, exportUnit, reason))
                } catch (fallbackError) {
                    results.push({
                        packageId: pkg.packageId,
                        name: pkg.agentName || pkg.name,
                        target,
                        exportUnit,
                        command: `apm-studio fallback ${pkg.packageId} --target ${target} --unit ${exportUnit}`,
                        status: 'failed',
                        error: fallbackError instanceof Error ? fallbackError.message : 'Studio fallback failed.',
                        warnings: [reason],
                    })
                }
            }
        }
    }

    return {
        ok: true,
        ...(targets.length === 1 ? { target: targets[0] } : {}),
        targets,
        exportUnit,
        startedAt,
        finishedAt: Date.now(),
        results,
    }
}
