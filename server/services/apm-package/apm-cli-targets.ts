import type {
    ApmSyncTargetId,
} from '../../../shared/apm-sync-contracts.js'
import {
    runApmCliCommand,
    selectApmCliRunner,
} from './apm-cli-runner.js'

export type ApmCliTargetStatus = {
    target: ApmSyncTargetId
    status: 'active' | 'inactive' | 'unknown'
    source?: string | null
    deployDir?: string
    needs?: string | null
}

type ApmCliTargetRow = {
    target?: unknown
    status?: unknown
    source?: unknown
    deploy_dir?: unknown
    deployDir?: unknown
    needs?: unknown
}

const TARGET_IDS: ReadonlySet<ApmSyncTargetId> = new Set([
    'codex',
    'gemini',
    'claude',
    'opencode',
    'cursor',
    'windsurf',
    'copilot',
    'agent-skills',
])

function isTargetId(value: unknown): value is ApmSyncTargetId {
    return typeof value === 'string' && TARGET_IDS.has(value as ApmSyncTargetId)
}

function statusValue(value: unknown): ApmCliTargetStatus['status'] {
    return value === 'active' || value === 'inactive' ? value : 'unknown'
}

function optionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null
}

function parseJsonArray(output: string): unknown[] {
    const start = output.indexOf('[')
    const end = output.lastIndexOf(']')
    if (start < 0 || end < start) return []
    try {
        const parsed = JSON.parse(output.slice(start, end + 1))
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

export function parseApmCliTargets(output: string): Map<ApmSyncTargetId, ApmCliTargetStatus> {
    const result = new Map<ApmSyncTargetId, ApmCliTargetStatus>()
    for (const row of parseJsonArray(output)) {
        if (!row || typeof row !== 'object') continue
        const entry = row as ApmCliTargetRow
        if (!isTargetId(entry.target)) continue
        const deployDir = optionalString(entry.deploy_dir) || optionalString(entry.deployDir) || undefined
        result.set(entry.target, {
            target: entry.target,
            status: statusValue(entry.status),
            source: optionalString(entry.source),
            deployDir,
            needs: optionalString(entry.needs),
        })
    }
    return result
}

export async function getApmCliTargets(workingDir: string): Promise<Map<ApmSyncTargetId, ApmCliTargetStatus>> {
    const runner = await selectApmCliRunner()
    if (!runner) return new Map()
    try {
        const result = await runApmCliCommand(runner, ['targets', '--json', '--all'], {
            cwd: workingDir,
            timeout: 30_000,
        })
        return parseApmCliTargets(`${result.stdout}\n${result.stderr}`)
    } catch {
        return new Map()
    }
}
