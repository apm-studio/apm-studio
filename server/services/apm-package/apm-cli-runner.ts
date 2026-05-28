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

function shellWords(value: string) {
    const matches = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
    return matches.map((part) => part.replace(/^['"]|['"]$/g, ''))
}

function commandDisplay(command: string, args: string[]) {
    return [command, ...args].join(' ')
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

export async function runApmCliInstall(
    runner: ApmCliRunner,
    packageRoot: string,
    target: string,
    options: {
        cwd: string
        env?: NodeJS.ProcessEnv
        frozen?: boolean
    },
): Promise<ApmCliRunResult> {
    const installArgs = [
        ...runner.args,
        'install',
        packageRoot,
        '--target',
        target,
        ...(options.frozen ? ['--frozen'] : []),
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
        stdout: result.stdout,
        stderr: result.stderr,
        command: commandDisplay(runner.command, installArgs),
    }
}

