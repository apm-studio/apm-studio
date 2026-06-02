import path from 'path'
import type { ApmGitHubImportFormat, ApmPackageManifest } from '../../../../shared/apm-contracts.js'
import type { ImportCandidate } from '../github-import-candidate-types.js'
import { ALL_TARGET_IDS, ALL_TARGET_LABELS } from '../github-import-constants.js'
import { candidateId, githubSource, packageIdForSource } from '../github-import-candidate-ids.js'
import { slugify } from '../github-import-utils.js'

export type TargetImportPrimitiveKind = NonNullable<ApmPackageManifest['x-apm']>['kind']

const TARGET_LABELS: Record<string, string> = {
    codex: 'Codex',
    gemini: 'Gemini',
    claude: 'Claude',
    opencode: 'OpenCode',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    copilot: 'Copilot',
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function parseJsonRecord(raw: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(raw)
        return isPlainRecord(parsed) ? parsed : null
    } catch {
        return null
    }
}

export function targetLabels(targetIds: string[]) {
    return targetIds.map((targetId) => TARGET_LABELS[targetId] || targetId)
}

export function targetIdsForManifest(targetIds: string[]) {
    return targetIds.length > 0 ? targetIds : ALL_TARGET_IDS
}

export function sourceRootForTargetPath(sourcePath: string, markerDir: string) {
    const marker = `/${markerDir}/`
    const index = `/${sourcePath}`.indexOf(marker)
    if (index < 0) return ''
    return sourcePath.slice(0, Math.max(0, index))
}

export function sourceLabel(repo: string, sourcePath: string, markerDir: string) {
    const root = sourceRootForTargetPath(sourcePath, markerDir)
    return root ? path.posix.basename(root) : repo.split('/')[1]
}

export function basenameSlug(sourcePath: string, fallback: string) {
    const basename = path.posix.basename(sourcePath)
    const lower = basename.toLowerCase()
    for (const suffix of ['.prompt.md', '.instructions.md', '.instruction.md', '.agent.md']) {
        if (lower.endsWith(suffix)) {
            return slugify(basename.slice(0, -suffix.length), fallback)
        }
    }
    return slugify(path.posix.basename(sourcePath, path.posix.extname(sourcePath)), fallback)
}

function microsoftApmPackageType(manifestKind: TargetImportPrimitiveKind, manifestType: string): ApmPackageManifest['type'] {
    if (manifestType === 'instructions' || manifestType === 'skill' || manifestType === 'hybrid' || manifestType === 'prompts') {
        return manifestType
    }
    if (manifestKind === 'prompt' || manifestKind === 'command') {
        return 'prompts'
    }
    return 'hybrid'
}

export function packageCandidate(input: {
    repo: string
    ref: string
    sourcePath: string
    adapterId: string
    format: Exclude<ApmGitHubImportFormat, 'auto'>
    name: string
    description: string
    manifestKind: TargetImportPrimitiveKind
    manifestType: string
    targetIds: string[]
    primitiveCounts: ImportCandidate['primitiveCounts']
    copyFiles: ImportCandidate['copyFiles']
}): ImportCandidate {
    const packageId = packageIdForSource(input.repo, input.ref, input.sourcePath, input.name, input.adapterId)
    const targetIds = targetIdsForManifest(input.targetIds)
    const targets = input.targetIds.length > 0 ? targetLabels(input.targetIds) : ALL_TARGET_LABELS
    const manifest: ApmPackageManifest = {
        name: input.name,
        version: '0.1.0',
        type: microsoftApmPackageType(input.manifestKind, input.manifestType),
        includes: 'auto',
        target: targetIds,
        description: input.description,
        marketplace: { source: githubSource(input.repo, input.ref, input.sourcePath, input.adapterId) },
        dependencies: { apm: [], mcp: [] },
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: input.manifestKind,
        },
    }
    return {
        id: candidateId(input.repo, input.ref, input.sourcePath, input.adapterId),
        name: input.name,
        description: input.description,
        kind: 'package',
        format: input.format,
        sourcePath: input.sourcePath,
        packageId,
        targets,
        primitiveCounts: input.primitiveCounts,
        manifest,
        copyFiles: input.copyFiles,
    }
}
