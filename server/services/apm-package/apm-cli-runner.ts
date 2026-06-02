import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export type ApmCliRunner = {
    id: 'configured' | 'apm' | 'uvx'
    label: string
    command: string
    args: string[]
    displayCommand: string
}

export type ApmCliRunResult = {
    runner: ApmCliRunner
    stdout: string
    stderr: string
    command: string
}

export type ApmCliRunOutcome = ApmCliRunResult & {
    exitCode: number
    failed: boolean
    error?: string
}

function shellWords(value: string) {
    const matches = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
    return matches.map((part) => part.replace(/^['"]|['"]$/g, ''))
}

function commandDisplay(command: string, args: string[]) {
    return [command, ...args].join(' ')
}

function execText(result: unknown, key: 'stdout' | 'stderr') {
    if (result && typeof result === 'object' && key in result) {
        const value = (result as Record<string, unknown>)[key]
        return typeof value === 'string' ? value : String(value || '')
    }
    return key === 'stdout' ? String(result || '') : ''
}

function execErrorCode(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as Record<string, unknown>).code
        return typeof code === 'number' ? code : 1
    }
    return 1
}

function execErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'APM CLI command failed.'
}

async function commandAvailable(command: string, args: string[] = ['--version']) {
    try {
        await execFileAsync(command, args, {
            timeout: 3_000,
            windowsHide: true,
        })
        return true
    } catch {
        return false
    }
}

export async function selectApmCliRunner(): Promise<ApmCliRunner | null> {
    const configured = process.env.APM_STUDIO_APM_CLI?.trim()
    if (configured) {
        const [command, ...args] = shellWords(configured)
        if (command) {
            return {
                id: 'configured',
                label: 'Configured APM CLI',
                command,
                args,
                displayCommand: commandDisplay(command, args),
            }
        }
    }

    if (await commandAvailable('apm')) {
        return {
            id: 'apm',
            label: 'APM CLI',
            command: 'apm',
            args: [],
            displayCommand: 'apm',
        }
    }

    if (await commandAvailable('uvx')) {
        const args = ['--from', 'git+https://github.com/microsoft/apm.git', 'apm']
        return {
            id: 'uvx',
            label: 'uvx microsoft/apm',
            command: 'uvx',
            args,
            displayCommand: commandDisplay('uvx', args),
        }
    }

    return null
}

export async function runApmCliCommand(
    runner: ApmCliRunner,
    args: string[],
    options: {
        cwd: string
        env?: NodeJS.ProcessEnv
        timeout?: number
    },
): Promise<ApmCliRunResult> {
    const result = await execFileAsync(runner.command, [...runner.args, ...args], {
        cwd: options.cwd,
        env: {
            ...process.env,
            ...options.env,
        },
        timeout: options.timeout || 30_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4,
    })
    return {
        runner,
        stdout: execText(result, 'stdout'),
        stderr: execText(result, 'stderr'),
        command: commandDisplay(runner.displayCommand, args),
    }
}

export async function runApmCliCommandCapture(
    runner: ApmCliRunner,
    args: string[],
    options: {
        cwd: string
        env?: NodeJS.ProcessEnv
        timeout?: number
    },
): Promise<ApmCliRunOutcome> {
    try {
        const result = await runApmCliCommand(runner, args, options)
        return {
            ...result,
            exitCode: 0,
            failed: false,
        }
    } catch (error) {
        return {
            runner,
            stdout: execText(error, 'stdout'),
            stderr: execText(error, 'stderr'),
            command: commandDisplay(runner.displayCommand, args),
            exitCode: execErrorCode(error),
            failed: true,
            error: execErrorMessage(error),
        }
    }
}

export async function runApmCliInstall(
    runner: ApmCliRunner,
    packageRoot: string,
    target: string,
    options: {
        cwd: string
        env?: NodeJS.ProcessEnv
    },
): Promise<ApmCliRunResult> {
    const installArgs = [
        ...runner.args,
        'install',
        packageRoot,
        '--target',
        target,
    ]
    const result = await execFileAsync(runner.command, installArgs, {
        cwd: options.cwd,
        env: {
            ...process.env,
            ...options.env,
        },
        timeout: 120_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4,
    })
    return {
        runner,
        stdout: execText(result, 'stdout'),
        stderr: execText(result, 'stderr'),
        command: commandDisplay(runner.command, installArgs),
    }
}
