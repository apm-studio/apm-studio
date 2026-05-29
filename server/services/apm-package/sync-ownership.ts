import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import type {
    ApmSyncTargetId,
    ApmSyncTargetItemSummary,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts.js'
import { toPosixPath } from './paths.js'
import { isRecord } from './yaml-io.js'

export type SyncOwnershipSource = 'apm-cli' | 'studio-fallback'

export type SyncOwnershipManifest = {
    version: 1
    files: Record<string, {
        hash: string
        packageId: string
        target: ApmSyncTargetId
        syncUnit: ApmSyncUnit
        updatedAt: string
        source: SyncOwnershipSource
    }>
}

export type ManagedSyncWriteContext = {
    workingDir: string
    packageId: string
    target: ApmSyncTargetId
    syncUnit: ApmSyncUnit
    source: SyncOwnershipSource
    ownership: SyncOwnershipManifest
}

const SYNC_OWNERSHIP_RELATIVE_PATH = '.apm-studio/projections/apm-sync.json'

export function emptySyncOwnershipManifest(): SyncOwnershipManifest {
    return { version: 1, files: {} }
}

function hashBuffer(content: Buffer | string) {
    return crypto.createHash('sha256').update(content).digest('hex')
}

export async function readSyncOwnershipManifest(workingDir: string): Promise<SyncOwnershipManifest> {
    const filePath = path.join(workingDir, SYNC_OWNERSHIP_RELATIVE_PATH)
    const raw = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (!raw) return emptySyncOwnershipManifest()
    try {
        const parsed = JSON.parse(raw) as SyncOwnershipManifest
        return parsed.version === 1 && isRecord(parsed.files)
            ? parsed
            : emptySyncOwnershipManifest()
    } catch {
        return emptySyncOwnershipManifest()
    }
}

export async function writeSyncOwnershipManifest(workingDir: string, manifest: SyncOwnershipManifest) {
    const filePath = path.join(workingDir, SYNC_OWNERSHIP_RELATIVE_PATH)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
}

export function summarizeSyncTargetItems(
    ownership: SyncOwnershipManifest,
    target: ApmSyncTargetId,
): ApmSyncTargetItemSummary[] {
    const groups = new Map<string, ApmSyncTargetItemSummary>()
    for (const [artifact, entry] of Object.entries(ownership.files)) {
        if (entry.target !== target) continue
        const key = `${entry.packageId}:${entry.syncUnit}`
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
            syncUnit: entry.syncUnit,
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
            || left.syncUnit.localeCompare(right.syncUnit)
        ))
}

export async function writeManagedSyncFile(
    relativePath: string,
    content: Buffer,
    context: ManagedSyncWriteContext,
) {
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
        syncUnit: context.syncUnit,
        updatedAt: new Date().toISOString(),
        source: context.source,
    }
    return normalizedRelativePath
}
