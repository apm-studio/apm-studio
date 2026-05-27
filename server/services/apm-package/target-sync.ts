import { execFile } from 'child_process'
import { promisify } from 'util'
import type {
    ApmSyncRunRequest,
    ApmSyncRunResponse,
    ApmSyncTargetId,
    ApmSyncTargetsResponse,
    ApmToolingStatus,
} from '../../../shared/apm-contracts.js'
import { getApmToolingStatus } from './tooling.js'
import { packageDir } from './paths.js'
import { listApmPackages } from './repository.js'

const execFileAsync = promisify(execFile)

const TARGETS: Array<{
    id: ApmSyncTargetId
    label: string
    description: string
}> = [
    { id: 'codex', label: 'Codex', description: 'Materialize selected APM packages into Codex-compatible assistant files.' },
    { id: 'gemini', label: 'Gemini', description: 'Materialize selected APM packages into Gemini-compatible assistant files.' },
    { id: 'claude', label: 'Claude', description: 'Materialize selected APM packages into Claude-compatible assistant files.' },
    { id: 'opencode', label: 'OpenCode', description: 'Materialize selected APM packages into OpenCode-compatible runtime files.' },
    { id: 'cursor', label: 'Cursor', description: 'Materialize selected APM packages into Cursor-compatible assistant files.' },
    { id: 'windsurf', label: 'Windsurf', description: 'Materialize selected APM packages into Windsurf-compatible assistant files.' },
    { id: 'copilot', label: 'Copilot', description: 'Materialize selected APM packages into GitHub Copilot-compatible assistant files.' },
]

function assertTarget(value: string): asserts value is ApmSyncTargetId {
    if (!TARGETS.some((target) => target.id === value)) {
        throw new Error(`Unsupported APM sync target: ${value}`)
    }
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

function quote(value: string) {
    return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value)
        ? value
        : `'${value.replace(/'/g, "'\\''")}'`
}

function resolveApmCommand(tooling: ApmToolingStatus) {
    if (tooling.runners.some((runner) => runner.id === 'apm' && runner.available)) {
        return { command: 'apm', argsPrefix: [] as string[], display: 'apm' }
    }
    if (tooling.runners.some((runner) => runner.id === 'uvx' && runner.available)) {
        return {
            command: 'uvx',
            argsPrefix: ['--from', 'apm-cli', 'apm'] as string[],
            display: 'uvx --from apm-cli apm',
        }
    }
    return null
}

export async function getApmSyncTargets(): Promise<ApmSyncTargetsResponse> {
    const tooling = await getApmToolingStatus()
    const apmCommand = resolveApmCommand(tooling)
    const available = apmCommand !== null
    return {
        tooling,
        targets: TARGETS.map((target) => ({
            ...target,
            available,
            commandPreview: `${apmCommand?.display || 'apm'} install <package-root> --target ${target.id}`,
            ...(available ? {} : { disabledReason: 'Install the Microsoft APM CLI or make uvx available.' }),
        })),
    }
}

export async function runApmTargetSync(
    workingDir: string,
    request: ApmSyncRunRequest,
): Promise<ApmSyncRunResponse> {
    const targets = normalizeTargets(request)
    const tooling = await getApmToolingStatus()
    const apmCommand = resolveApmCommand(tooling)
    if (!apmCommand) {
        throw new Error('Microsoft APM CLI tooling is not available. Install apm or run: uvx --from apm-cli apm --version')
    }

    const startedAt = Date.now()
    const selected = new Set((request.packageIds || []).filter(Boolean))
    const packages = (await listApmPackages(workingDir))
        .filter((pkg) => selected.size === 0 || selected.has(pkg.packageId))

    const results: ApmSyncRunResponse['results'] = []
    for (const pkg of packages) {
        const root = packageDir(workingDir, pkg.packageId)
        for (const target of targets) {
            const command = `${apmCommand.display} install ${quote(root)} --target ${target}`
            try {
                const output = await execFileAsync(apmCommand.command, [...apmCommand.argsPrefix, 'install', root, '--target', target], {
                    cwd: workingDir,
                    maxBuffer: 1024 * 1024 * 8,
                })
                results.push({
                    packageId: pkg.packageId,
                    name: pkg.agentName || pkg.name,
                    target,
                    command,
                    status: 'synced',
                    stdout: output.stdout,
                    stderr: output.stderr,
                })
            } catch (error) {
                const execError = error as { stdout?: string; stderr?: string; message?: string }
                results.push({
                    packageId: pkg.packageId,
                    name: pkg.agentName || pkg.name,
                    target,
                    command,
                    status: 'failed',
                    stdout: execError.stdout,
                    stderr: execError.stderr,
                    error: execError.message || 'APM target sync failed.',
                })
            }
        }
    }

    return {
        ok: true,
        ...(targets.length === 1 ? { target: targets[0] } : {}),
        targets,
        startedAt,
        finishedAt: Date.now(),
        results,
    }
}
