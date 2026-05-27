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
    const runners = await Promise.all(PROBES.map(probeTool))
    const apm = runners.find((runner) => runner.id === 'apm')
    const uvx = runners.find((runner) => runner.id === 'uvx')
    const pipx = runners.find((runner) => runner.id === 'pipx')

    const available = apm?.available === true || uvx?.available === true
    const recommendedCommand = apm?.available
        ? 'apm'
        : uvx?.available
            ? 'uvx --from apm-cli apm'
            : null

    return {
        available,
        recommendedCommand,
        version: apm?.version,
        runners,
        installHints: [
            ...(uvx?.available ? ['Check the Microsoft APM CLI without adding a Python dependency to APM Studio: uvx --from apm-cli apm --version'] : []),
            ...(pipx?.available ? ['Install the CLI outside Studio: pipx install apm-cli'] : []),
            'Studio can still generate APM package sources without the Python CLI installed.',
        ],
        deploymentNote: 'APM Studio does not bundle microsoft/apm or require Python at npm install time; target export can use an external apm command or uvx runner.',
    }
}
