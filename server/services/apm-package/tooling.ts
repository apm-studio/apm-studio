import { execFile } from 'child_process'
import { promisify } from 'util'
import type {
    ApmToolingRunnerStatus,
    ApmToolingStatus,
} from '../../../shared/apm-contracts.js'

const execFileAsync = promisify(execFile)

type Probe = {
    id: ApmToolingRunnerStatus['id']
    label: string
    command: string
    args: string[]
    role: ApmToolingRunnerStatus['role']
}

const PROBES: Probe[] = [
    {
        id: 'apm',
        label: 'APM CLI',
        command: 'apm',
        args: ['--version'],
        role: 'cli',
    },
    {
        id: 'uvx',
        label: 'uvx',
        command: 'uvx',
        args: ['--version'],
        role: 'runner',
    },
    {
        id: 'pipx',
        label: 'pipx',
        command: 'pipx',
        args: ['--version'],
        role: 'runner',
    },
    {
        id: 'python3',
        label: 'Python 3',
        command: 'python3',
        args: ['--version'],
        role: 'runtime',
    },
]

function configuredProbe(): Probe | null {
    const command = process.env.APM_STUDIO_APM_CLI?.trim()
    if (!command) return null
    const executable = command.split(/\s+/)[0]
    if (!executable) return null
    return {
        id: 'configured',
        label: 'Configured APM CLI',
        command: executable,
        args: ['--version'],
        role: 'cli',
    }
}

function normalizeVersion(output: string) {
    return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
}

async function probeTool(probe: Probe): Promise<ApmToolingRunnerStatus> {
    try {
        const result = await execFileAsync(probe.command, probe.args, {
            timeout: 2_000,
            windowsHide: true,
        })
        return {
            id: probe.id,
            label: probe.label,
            available: true,
            version: normalizeVersion(`${result.stdout}\n${result.stderr}`),
            command: probe.command,
            role: probe.role,
        }
    } catch {
        return {
            id: probe.id,
            label: probe.label,
            available: false,
            command: probe.command,
            role: probe.role,
        }
    }
}

export async function getApmToolingStatus(): Promise<ApmToolingStatus> {
    const configuredProbeValue = configuredProbe()
    const probes = [
        ...(configuredProbeValue ? [configuredProbeValue] : []),
        ...PROBES,
    ]
    const runners = await Promise.all(probes.map(probeTool))
    const configured = runners.find((runner) => runner.id === 'configured')
    const apm = runners.find((runner) => runner.id === 'apm')
    const uvx = runners.find((runner) => runner.id === 'uvx')
    const pipx = runners.find((runner) => runner.id === 'pipx')

    const available = configured?.available === true || apm?.available === true || uvx?.available === true
    const recommendedCommand = configured?.available
        ? process.env.APM_STUDIO_APM_CLI?.trim() || configured.command
        : apm?.available
        ? 'apm'
        : uvx?.available
            ? 'uvx --from git+https://github.com/microsoft/apm.git apm'
            : null

    return {
        available,
        recommendedCommand,
        version: apm?.version,
        runners,
        installHints: [
            ...(uvx?.available ? ['Run Microsoft APM from GitHub without bundling Python into Studio: uvx --from git+https://github.com/microsoft/apm.git apm --version'] : []),
            ...(pipx?.available ? ['Install the CLI outside Studio: pipx install apm-cli'] : []),
            'Studio can still fall back for supported agent and skill projections when the CLI path is unavailable.',
        ],
        deploymentNote: 'APM Studio does not bundle microsoft/apm or require Python at npm install time; target management prefers the external APM CLI and falls back to Studio projections where supported.',
    }
}
