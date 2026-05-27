import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { DEFAULT_PROJECT_DIR, OPENCODE_PORT, OPENCODE_URL, STUDIO_OPENCODE_CONFIG_DIR } from './config.js'
import { resolvePackageBinCommand } from './package-bin.js'

const STARTUP_TIMEOUT_MS = 15_000
const HEALTHCHECK_INTERVAL_MS = 250
const REACHABILITY_CACHE_MS = 1_000

let child: ChildProcess | null = null
let startupPromise: Promise<void> | null = null
let reachabilityCache: { ok: boolean; checkedAt: number } | null = null

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolvePort(): number {
    try {
        const url = new URL(OPENCODE_URL)
        if (url.port) {
            return Number(url.port)
        }
        return url.protocol === 'https:' ? 443 : 80
    } catch {
        return OPENCODE_PORT
    }
}

function resolveCommand(): { command: string; args: string[] } {
    if (process.env.OPENCODE_BIN) {
        return { command: process.env.OPENCODE_BIN, args: [] }
    }

    const packageCommand = resolvePackageBinCommand('opencode-ai', 'opencode')
    if (packageCommand) {
        return packageCommand
    }

    return {
        command: process.platform === 'win32' ? 'opencode.cmd' : 'opencode',
        args: [],
    }
}

export function canRestartOpencodeSidecar(): boolean {
    return !!child
}

export async function isOpencodeReachable(): Promise<boolean> {
    try {
        const url = new URL('/global/health', OPENCODE_URL)
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 1_500)
        try {
            const response = await fetch(url.toString(), { signal: controller.signal })
            return response.ok
        } finally {
            clearTimeout(timeout)
        }
    } catch {
        return false
    }
}

async function getReachability(force = false) {
    if (!force && reachabilityCache && Date.now() - reachabilityCache.checkedAt < REACHABILITY_CACHE_MS) {
        return reachabilityCache.ok
    }

    const ok = await isOpencodeReachable()
    reachabilityCache = { ok, checkedAt: Date.now() }
    return ok
}

async function waitForReady() {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    while (Date.now() < deadline) {
        if (await isOpencodeReachable()) {
            return
        }
        if (child && child.exitCode !== null) {
            break
        }
        await sleep(HEALTHCHECK_INTERVAL_MS)
    }

    throw new Error('OpenCode sidecar did not become ready in time.')
}

async function waitForShutdown() {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    while (Date.now() < deadline) {
        if (!(await isOpencodeReachable())) {
            return
        }
        await sleep(HEALTHCHECK_INTERVAL_MS)
    }

    throw new Error('OpenCode sidecar did not stop in time.')
}

function stopChildProcess(target: ChildProcess, force = false) {
    if (process.platform === 'win32' && target.pid) {
        spawn('taskkill.exe', [
            '/PID',
            String(target.pid),
            '/T',
            ...(force ? ['/F'] : []),
        ], {
            stdio: 'ignore',
        }).once('error', () => {
            target.kill(force ? 'SIGKILL' : 'SIGTERM')
        })
        return
    }

    target.kill(force ? 'SIGKILL' : 'SIGTERM')
}

export async function stopOpencodeSidecar(): Promise<void> {
    if (!child) {
        reachabilityCache = null
        return
    }

    const currentChild = child
    stopChildProcess(currentChild)
    await waitForShutdown().catch(async () => {
        stopChildProcess(currentChild, true)
        await waitForShutdown()
    }).finally(() => {
        if (child === currentChild) {
            child = null
        }
        reachabilityCache = null
    })
}

export async function ensureOpencodeSidecar(): Promise<void> {
    if (startupPromise) {
        return startupPromise
    }

    if (child && child.exitCode === null) {
        if (reachabilityCache?.ok) {
            return
        }
        if (await getReachability()) {
            return
        }
        await waitForReady()
        reachabilityCache = { ok: true, checkedAt: Date.now() }
        return
    }

    if (await getReachability(true)) {
        // A previous Studio process can leave a healthy OpenCode sidecar on the
        // managed port. Reuse it for readiness instead of blocking dev startup.
        reachabilityCache = { ok: true, checkedAt: Date.now() }
        return
    }

    startupPromise = (async () => {
        const resolvedCommand = resolveCommand()
        const opencode = spawn(
            resolvedCommand.command,
            [...resolvedCommand.args, 'serve', '--port', String(resolvePort())],
            {
                cwd: path.resolve(DEFAULT_PROJECT_DIR),
                env: {
                    ...process.env,
                    OPENCODE_CONFIG_DIR: STUDIO_OPENCODE_CONFIG_DIR,
                    OPENCODE_ENABLE_EXA: process.env.OPENCODE_ENABLE_EXA || '1',
                },
                stdio: 'ignore',
            },
        )

        child = opencode
        const spawnError = new Promise<never>((_, reject) => {
            opencode.once('error', (error) => {
                if (child === opencode) {
                    child = null
                }
                reachabilityCache = null
                reject(error)
            })
        })
        spawnError.catch(() => {})
        opencode.once('exit', () => {
            if (child === opencode) {
                child = null
            }
            reachabilityCache = null
        })

        await Promise.race([waitForReady(), spawnError])
        reachabilityCache = { ok: true, checkedAt: Date.now() }
    })().finally(() => {
        startupPromise = null
    })

    return startupPromise
}

export async function restartOpencodeSidecar(): Promise<void> {
    if (!child) {
        if (await getReachability(true)) {
            throw new Error('Managed OpenCode restart is unavailable because the current sidecar process was not started by this Studio instance.')
        }
        return ensureOpencodeSidecar()
    }

    const currentChild = child
    stopChildProcess(currentChild)
    await waitForShutdown().catch(async () => {
        stopChildProcess(currentChild, true)
        await waitForShutdown()
    })
    child = null
    reachabilityCache = null
    return ensureOpencodeSidecar()
}
