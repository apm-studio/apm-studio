#!/usr/bin/env node
// Agent Roster CLI — agent-roster [path] [options]

import fs from 'fs/promises'
import { resolve, basename, dirname, join } from 'path'
import net from 'net'
import os from 'os'
import { fileURLToPath } from 'url'
import { spawn, spawnSync } from 'child_process'
import readline from 'readline/promises'
import { parseRosterAssetUrn } from './server/lib/roster-source.js'
import { resolvePackageBin } from './server/lib/package-bin.js'
import {
    ensureOpenProjectDir,
    validateExistingProjectDir,
} from './server/lib/cli-utils.js'
import { STUDIO_RELEASE_APP_PORT, STUDIO_RELEASE_OPENCODE_PORT } from './shared/default-ports.js'
import type { ProviderAuthMethod, ProviderAuthMethodMap, ProviderAuthPrompt } from './shared/provider-auth.js'

type StudioPackageMeta = {
    name: string
    version: string
    engines?: {
        node?: string
    }
}

type OpenCommand = {
    kind: 'open'
    openaiOauth: boolean
    openBrowser: boolean
    projectDir: string
    port: number | null
    startupAssetTarget: StartupAssetTarget | null
    verbose: boolean
}

type DoctorCommand = {
    kind: 'doctor'
    projectDir: string
    port: number
    verbose: boolean
}

type HelpCommand = {
    kind: 'help'
}

type VersionCommand = {
    kind: 'version'
}

type CliCommand = OpenCommand | DoctorCommand | HelpCommand | VersionCommand

type StartupAssetTarget = {
    kind: 'performer' | 'act'
    urn: string
}

type DoctorCheck = {
    label: string
    status: 'ok' | 'warn' | 'fail' | 'info'
    detail: string
}

class CliUsageError extends Error {}

const DEFAULT_PORT = STUDIO_RELEASE_APP_PORT
const MAX_PORT_SCAN = 20
const MIN_PORT = 1
const MAX_PORT = 65535
const STUDIO_READY_TIMEOUT_MS = 30_000
const STUDIO_READY_POLL_MS = 250
const OPENAI_PROVIDER_ID = 'openai'
const STATUS_PREFIX: Record<DoctorCheck['status'], string> = {
    ok: 'OK',
    warn: 'WARN',
    fail: 'FAIL',
    info: 'INFO',
}

function printUsage(packageMeta?: StudioPackageMeta) {
    const header = packageMeta ? `${packageMeta.name} ${packageMeta.version}` : 'agent-roster'
    console.log(`${header}

Usage:
  agent-roster [path] [options]
  agent-roster open [path] [options]
  agent-roster doctor [path] [options]
  agent-roster --help
  agent-roster --version

Commands:
  open                  Open an agent package workspace. This is the default command.
  doctor                Check workspace, port, Node.js, and coding assistant readiness.

Arguments:
  path                  Workspace path to open or inspect. Defaults to the current directory.

Options:
  -p, --port <port>     Port for the Studio server. Defaults to 43100.
      --openai-oauth    Connect OpenAI through browser OAuth before Agent Roster opens.
      --performer <urn>
                        Prepare and focus an agent package, installing/importing it when needed.
      --act <urn>
                        Prepare and focus a canvas act, installing/importing it when needed.
      --no-open         Do not open the Agent Roster browser window.
      --open            Explicitly open the Agent Roster browser window after startup.
      --verbose         Print extra startup details.
  -h, --help            Show this help message.
  -v, --version         Show the installed Agent Roster version.

Examples:
  agent-roster
  agent-roster .
  agent-roster --openai-oauth
  agent-roster --openai-oauth --act act/@acme/workflows/review-flow
  agent-roster ~/projects/my-app
  agent-roster ~/projects/my-app --performer performer/@acme/workflows/reviewer
  agent-roster open ~/projects/my-app --port 3010
  agent-roster open ~/projects/my-app --act act/@acme/workflows/review-flow
  agent-roster doctor
  agent-roster doctor ~/projects/my-app`)
}

function failUsage(message: string): never {
    throw new CliUsageError(`${message}\nRun agent-roster --help for usage.`)
}

function parsePort(value: string | undefined, arg: string): number {
    if (!value) {
        failUsage(`Missing value for ${arg}`)
    }

    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) {
        failUsage(`Invalid port for ${arg}: ${value}. Expected an integer from ${MIN_PORT} to ${MAX_PORT}.`)
    }

    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
        failUsage(`Invalid port for ${arg}: ${value}. Expected an integer from ${MIN_PORT} to ${MAX_PORT}.`)
    }

    return parsed
}

function parseOptionalEnvPort(name: 'PORT' | 'OPENCODE_PORT'): number | null {
    const value = process.env[name]?.trim()
    if (!value) {
        return null
    }
    return parsePort(value, name)
}

function resolveSidecarPort() {
    return parseOptionalEnvPort('OPENCODE_PORT') || STUDIO_RELEASE_OPENCODE_PORT
}

function sleep(ms: number) {
    return new Promise<void>((resolvePromise) => {
        setTimeout(resolvePromise, ms)
    })
}

function isInteractiveTerminal() {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function parseAssetTargetUrn(value: string | undefined, kind: StartupAssetTarget['kind'], arg: string): StartupAssetTarget {
    const urn = (value || '').trim()
    if (!urn) {
        failUsage(`Missing value for ${arg}`)
    }

    try {
        parseRosterAssetUrn(urn, kind)
    } catch {
        failUsage(`Invalid ${arg} URN: ${urn}. Expected ${kind}/@<owner>/<stage>/<name>.`)
    }

    return { kind, urn }
}

function parseCliArgs(argv: string[]): CliCommand {
    let command: CliCommand['kind'] = 'open'
    let commandExplicit = false
    let openBrowser = true
    let openaiOauth = false
    let projectDir: string | null = null
    let port: number | null = null
    let startupAssetTarget: StartupAssetTarget | null = null
    let verbose = false

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]

        if (arg === '--help' || arg === '-h' || arg === 'help') {
            return { kind: 'help' }
        }

        if (arg === '--version' || arg === '-v' || arg === 'version') {
            return { kind: 'version' }
        }

        if (!commandExplicit && (arg === 'open' || arg === 'doctor')) {
            command = arg
            commandExplicit = true
            continue
        }

        if (arg === '--no-open') {
            openBrowser = false
            continue
        }

        if (arg === '--open') {
            openBrowser = true
            continue
        }

        if (arg === '--verbose') {
            verbose = true
            continue
        }

        if (arg === '--openai-oauth') {
            openaiOauth = true
            continue
        }

        if (arg === '--port' || arg === '-p') {
            port = parsePort(argv[index + 1], arg)
            index += 1
            continue
        }

        if (arg === '--performer') {
            if (startupAssetTarget) {
                failUsage('Use only one of --performer or --act')
            }
            startupAssetTarget = parseAssetTargetUrn(argv[index + 1], 'performer', arg)
            index += 1
            continue
        }

        if (arg === '--act') {
            if (startupAssetTarget) {
                failUsage('Use only one of --performer or --act')
            }
            startupAssetTarget = parseAssetTargetUrn(argv[index + 1], 'act', arg)
            index += 1
            continue
        }

        if (arg.startsWith('-')) {
            failUsage(`Unknown option: ${arg}`)
        }

        if (projectDir) {
            failUsage(`Unexpected extra argument: ${arg}`)
        }

        projectDir = arg
    }

    const resolvedProjectDir = resolve(projectDir || process.cwd())
    const envStudioPort = parseOptionalEnvPort('PORT')
    resolveSidecarPort()

    if (command === 'doctor') {
        if (startupAssetTarget) {
            failUsage('--performer and --act can only be used with the open command')
        }
        if (openaiOauth) {
            failUsage('--openai-oauth can only be used with the open command')
        }
        return {
            kind: 'doctor',
            projectDir: resolvedProjectDir,
            port: port ?? envStudioPort ?? DEFAULT_PORT,
            verbose,
        }
    }

    return {
        kind: 'open',
        openaiOauth,
        openBrowser,
        projectDir: resolvedProjectDir,
        port,
        startupAssetTarget,
        verbose,
    }
}

function canListenOnPort(port: number) {
    return new Promise<boolean>((resolvePromise) => {
        if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
            resolvePromise(false)
            return
        }

        const server = net.createServer()
        server.once('error', () => {
            resolvePromise(false)
        })
        server.once('listening', () => {
            server.close(() => resolvePromise(true))
        })
        try {
            server.listen({
                port,
                host: '::',
                exclusive: true,
            })
        } catch {
            resolvePromise(false)
        }
    })
}

function compareSemver(left: string, right: string) {
    const normalize = (value: string) =>
        value
            .replace(/^v/, '')
            .split('-')[0]
            .split('.')
            .map((part) => Number.parseInt(part, 10) || 0)

    const leftParts = normalize(left)
    const rightParts = normalize(right)
    const length = Math.max(leftParts.length, rightParts.length)

    for (let index = 0; index < length; index += 1) {
        const leftValue = leftParts[index] || 0
        const rightValue = rightParts[index] || 0
        if (leftValue === rightValue) {
            continue
        }
        return leftValue - rightValue
    }

    return 0
}

function isNodeVersionSupported(range: string | undefined, version: string) {
    if (!range) {
        return true
    }

    const match = range.match(/^>=\s*([0-9][^ ]*)$/)
    if (!match) {
        return true
    }

    return compareSemver(version, match[1]) >= 0
}

async function readStudioPackageMeta(): Promise<StudioPackageMeta> {
    const currentFile = fileURLToPath(import.meta.url)
    const currentDir = dirname(currentFile)
    const searchRoots = basename(currentDir) === 'dist'
        ? [dirname(currentDir), currentDir]
        : [currentDir]

    for (const initialDir of searchRoots) {
        let searchDir = initialDir

        while (true) {
            const packageJsonPath = join(searchDir, 'package.json')

            try {
                const raw = await fs.readFile(packageJsonPath, 'utf-8')
                const parsed = JSON.parse(raw) as Partial<StudioPackageMeta>
                if (typeof parsed.name === 'string' && typeof parsed.version === 'string') {
                    return parsed as StudioPackageMeta
                }
            } catch {
                // Walk upward until we find the published package root.
            }

            const parentDir = dirname(searchDir)
            if (parentDir === searchDir) {
                break
            }
            searchDir = parentDir
        }
    }

    throw new Error('Could not locate package.json for Agent Roster.')
}

async function fetchLatestVersion(packageName: string) {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
        headers: {
            accept: 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch npm metadata for ${packageName}.`)
    }

    const payload = await response.json() as { version?: string }
    return payload.version || null
}

const UPDATE_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000

function getUpdateSnoozePath(packageName: string) {
    const safeName = packageName.replace(/[^a-z0-9-]/gi, '_')
    return join(os.tmpdir(), `.${safeName}-update-snooze`)
}

async function isUpdateSnoozed(packageName: string): Promise<boolean> {
    try {
        const raw = await fs.readFile(getUpdateSnoozePath(packageName), 'utf-8')
        const snoozedAt = Number.parseInt(raw.trim(), 10)
        return Number.isFinite(snoozedAt) && Date.now() - snoozedAt < UPDATE_SNOOZE_DURATION_MS
    } catch {
        return false
    }
}

async function snoozeUpdate(packageName: string) {
    try {
        await fs.writeFile(getUpdateSnoozePath(packageName), String(Date.now()), 'utf-8')
    } catch {
        // ignore write errors
    }
}

async function promptForNpmUpdate(packageMeta: StudioPackageMeta) {
    if (await isUpdateSnoozed(packageMeta.name)) {
        return false
    }

    let latestVersion: string | null = null

    try {
        latestVersion = await fetchLatestVersion(packageMeta.name)
    } catch {
        return false
    }

    if (!latestVersion || compareSemver(latestVersion, packageMeta.version) <= 0) {
        return false
    }

    const message = `A newer ${packageMeta.name} version is available on npm (${packageMeta.version} -> ${latestVersion}). Update now? [Y/n] `
    const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

    if (!isInteractive) {
        console.log(`${message.trim()} Run npm install -g ${packageMeta.name}@latest to update.`)
        return false
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    try {
        const answer = (await rl.question(message)).trim().toLowerCase()
        if (answer && answer !== 'y' && answer !== 'yes') {
            await snoozeUpdate(packageMeta.name)
            return false
        }
    } finally {
        rl.close()
    }

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

    await new Promise<void>((resolvePromise, reject) => {
        const child = spawn(npmCommand, ['install', '-g', `${packageMeta.name}@latest`], {
            stdio: 'inherit',
        })

        child.on('exit', (code) => {
            if (code === 0) {
                resolvePromise()
                return
            }
            reject(new Error(`npm install exited with code ${code ?? 1}.`))
        })
        child.on('error', reject)
    })

    console.log(`Updated ${packageMeta.name} to ${latestVersion}. Run agent-roster again to start the new version.`)
    return true
}

async function resolveOpenPort(requestedPort: number | null) {
    const sidecarPort = resolveSidecarPort()
    const basePort = requestedPort ?? parseOptionalEnvPort('PORT') ?? DEFAULT_PORT
    let resolvedPort = basePort

    if (requestedPort) {
        if (requestedPort === sidecarPort) {
            throw new Error(`Port ${requestedPort} is reserved for the managed OpenCode sidecar. Try a different port with --port.`)
        }
        if (!(await canListenOnPort(requestedPort))) {
            throw new Error(`Port ${requestedPort} is already in use. Try a different port with --port.`)
        }
        return requestedPort
    }

    if (resolvedPort === sidecarPort) {
        resolvedPort += 1
    }
    while (!(await canListenOnPort(resolvedPort))) {
        resolvedPort += 1
        if (resolvedPort === sidecarPort) {
            resolvedPort += 1
        }
        if (resolvedPort - basePort > MAX_PORT_SCAN) {
            throw new Error(`Could not find an open port starting from ${basePort}. Try --port with a free port.`)
        }
    }

    return resolvedPort
}

function findCommandInPath(command: string) {
    const lookupCommand = process.platform === 'win32' ? 'where' : 'which'
    const result = spawnSync(lookupCommand, [command], { encoding: 'utf-8' })
    if (result.status !== 0) {
        return null
    }

    const output = result.stdout.trim().split(/\r?\n/).find(Boolean)
    return output || null
}

function resolveOpencodeExecutable() {
    return resolvePackageBin('opencode-ai', 'opencode') || findCommandInPath('opencode')
}

async function runDoctor(command: DoctorCommand, packageMeta: StudioPackageMeta) {
    const checks: DoctorCheck[] = []
    const nodeRange = packageMeta.engines?.node
    const nodeSupported = isNodeVersionSupported(nodeRange, process.version)
    checks.push({
        label: 'CLI',
        status: 'ok',
        detail: `${packageMeta.name} ${packageMeta.version}`,
    })
    checks.push({
        label: 'Node.js',
        status: nodeSupported ? 'ok' : 'fail',
        detail: nodeRange ? `${process.version} (requires ${nodeRange})` : process.version,
    })

    try {
        const validatedProjectDir = await validateExistingProjectDir(command.projectDir)
        checks.push({
            label: 'Workspace path',
            status: 'ok',
            detail: validatedProjectDir,
        })
        checks.push({
            label: 'Workspace init',
            status: 'info',
            detail: 'Workspace metadata will be initialized automatically when you open it.',
        })
    } catch (error) {
        checks.push({
            label: 'Workspace path',
            status: 'fail',
            detail: error instanceof Error ? error.message : `Directory not found: ${command.projectDir}`,
        })
    }

    const sidecarPort = resolveSidecarPort()
    const portReserved = command.port === sidecarPort
    const portAvailable = !portReserved && await canListenOnPort(command.port)
    checks.push({
        label: 'Studio port',
        status: portReserved ? 'fail' : portAvailable ? 'ok' : 'warn',
        detail: portReserved
            ? `Port ${command.port} is reserved for the managed OpenCode sidecar`
            : portAvailable
            ? `Port ${command.port} is available`
            : `Port ${command.port} is in use. Agent Roster can use another port unless you force --port.`,
    })

    const executable = resolveOpencodeExecutable()
    checks.push({
        label: 'OpenCode',
        status: executable ? 'ok' : 'fail',
        detail: executable
            ? `Managed sidecar can start OpenCode via ${executable}`
            : 'Could not find an OpenCode executable. Install opencode-ai.',
    })

    console.log('Agent Roster doctor\n')
    for (const check of checks) {
        console.log(`${STATUS_PREFIX[check.status].padEnd(4)} ${check.label}: ${check.detail}`)
    }

    if (command.verbose) {
        console.log('\nEnvironment:')
        console.log(`  cwd: ${process.cwd()}`)
        console.log(`  platform: ${process.platform}`)
        console.log(`  arch: ${process.arch}`)
    }

    const hasFailure = checks.some((check) => check.status === 'fail')
    process.exit(hasFailure ? 1 : 0)
}

function buildStudioLaunchUrl(baseUrl: string, startupAssetTarget: StartupAssetTarget | null) {
    if (!startupAssetTarget) {
        return baseUrl
    }

    const url = new URL(baseUrl)
    url.searchParams.set(startupAssetTarget.kind, startupAssetTarget.urn)
    return url.toString()
}

async function waitForStudioReady(healthUrl: string) {
    const deadline = Date.now() + STUDIO_READY_TIMEOUT_MS
    let lastFailure = 'no response'

    while (Date.now() < deadline) {
        try {
            const response = await fetch(healthUrl)
            if (response.ok) {
                return
            }
            lastFailure = `HTTP ${response.status}`
        } catch (error) {
            lastFailure = error instanceof Error ? error.message : String(error)
        }

        await sleep(STUDIO_READY_POLL_MS)
    }

    throw new Error(`Agent Roster did not become ready in time (${lastFailure}).`)
}

function isPromptVisible(prompt: ProviderAuthPrompt, values: Record<string, string>) {
    if (!prompt.when) {
        return true
    }

    const actual = values[prompt.when.key] || ''
    return prompt.when.op === 'eq'
        ? actual === prompt.when.value
        : actual !== prompt.when.value
}

async function promptLine(message: string) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    try {
        return (await rl.question(message)).trim()
    } finally {
        rl.close()
    }
}

async function collectOauthPromptInputs(providerName: string, method: ProviderAuthMethod) {
    const prompts = method.prompts || []
    if (prompts.length === 0) {
        return undefined
    }

    const values: Record<string, string> = {}
    const interactive = isInteractiveTerminal()

    console.log(`OpenAI OAuth needs a little setup for ${providerName}.`)
    for (const prompt of prompts) {
        if (!isPromptVisible(prompt, values)) {
            continue
        }

        if (prompt.type === 'select') {
            const defaultOption = prompt.options[0]
            if (!defaultOption) {
                continue
            }

            if (!interactive) {
                values[prompt.key] = defaultOption.value
                continue
            }

            console.log(prompt.message)
            prompt.options.forEach((option, index) => {
                const suffix = option.hint ? ` - ${option.hint}` : ''
                console.log(`  ${index + 1}. ${option.label}${suffix}`)
            })

            const answer = await promptLine(`Select [1]: `)
            const numericChoice = answer ? Number.parseInt(answer, 10) : 1
            const selected = Number.isInteger(numericChoice)
                ? prompt.options[numericChoice - 1]
                : prompt.options.find((option) => option.value === answer)
            if (!selected) {
                failUsage(`Invalid OAuth prompt selection for ${prompt.key}.`)
            }
            values[prompt.key] = selected.value
            continue
        }

        if (!interactive) {
            throw new Error(`OpenAI OAuth requires interactive input for: ${prompt.message}`)
        }

        values[prompt.key] = await promptLine(`${prompt.message}${prompt.placeholder ? ` (${prompt.placeholder})` : ''}: `)
    }

    const entries = Object.entries(values)
        .map(([key, value]) => [key, value.trim()] as const)
        .filter(([, value]) => value.length > 0)

    return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

async function promptForOauthCode(providerName: string) {
    if (!isInteractiveTerminal()) {
        throw new Error(`${providerName} OAuth requires an authorization code, but this terminal is not interactive.`)
    }

    const code = await promptLine(`Paste ${providerName} authorization code: `)
    if (!code) {
        throw new Error(`${providerName} OAuth authorization code is required.`)
    }
    return code
}

async function isProviderAlreadyConnected(directory: string, providerId: string) {
    const { listProviderSummaries } = await import('./server/lib/model-catalog.js')
    const providers = await listProviderSummaries(directory).catch(() => [])
    const provider = providers.find((entry) => entry.id === providerId)
    return provider?.connected === true
}

async function findOpenAiOauthMethod(directory: string) {
    const { getProviderAuthMethods } = await import('./server/services/opencode-service.js')
    const authMethods = await getProviderAuthMethods(directory) as ProviderAuthMethodMap
    const methods = authMethods[OPENAI_PROVIDER_ID] || []
    const browserOauthIndex = methods.findIndex((method) => (
        method.type === 'oauth'
        && /browser|oauth/i.test(method.label)
    ))
    const methodIndex = browserOauthIndex >= 0
        ? browserOauthIndex
        : methods.findIndex((method) => method.type === 'oauth')
    const method = methods[methodIndex]

    if (methodIndex < 0 || !method || method.type !== 'oauth') {
        throw new Error('OpenAI OAuth is not available from the current OpenCode provider auth methods.')
    }

    return { methodIndex, method }
}

async function runOpenAiOauthSetup(directory: string) {
    if (await isProviderAlreadyConnected(directory, OPENAI_PROVIDER_ID)) {
        console.log('OpenAI provider is already connected.')
        return
    }

    const { authorizeProviderOauth, completeProviderOauth } = await import('./server/services/opencode-service.js')
    const { methodIndex, method } = await findOpenAiOauthMethod(directory)
    const inputs = await collectOauthPromptInputs('OpenAI', method)
    const authorization = await authorizeProviderOauth(directory, OPENAI_PROVIDER_ID, methodIndex, inputs)

    if (authorization.instructions) {
        console.log(authorization.instructions)
    }

    if (authorization.url) {
        console.log(`Opening OpenAI OAuth: ${authorization.url}`)
        const open = await import('open')
        await open.default(authorization.url)
    }

    if (authorization.method === 'code') {
        const code = await promptForOauthCode('OpenAI')
        await completeProviderOauth(directory, OPENAI_PROVIDER_ID, methodIndex, code)
    } else {
        console.log('Waiting for OpenAI OAuth to complete...')
        await completeProviderOauth(directory, OPENAI_PROVIDER_ID, methodIndex)
    }

    console.log('OpenAI provider connected.')
}

async function runOpen(command: OpenCommand, packageMeta: StudioPackageMeta) {
    const updated = await promptForNpmUpdate(packageMeta)
    if (updated) {
        process.exit(0)
    }

    const resolvedProjectDir = await ensureOpenProjectDir(command.projectDir)
    const resolvedPort = await resolveOpenPort(command.port)

    process.env.PROJECT_DIR = resolvedProjectDir
    process.env.AGENT_ROSTER_PRODUCTION = '1'
    process.env.PORT = String(resolvedPort)
    delete process.env.OPENCODE_URL

    const { initializeStudioProject } = await import('./server/services/studio-service.js')
    await initializeStudioProject(resolvedProjectDir)

    const studioUrl = `http://localhost:${resolvedPort}`
    const launchUrl = buildStudioLaunchUrl(studioUrl, command.startupAssetTarget)
    const healthUrl = `http://127.0.0.1:${resolvedPort}/api/health`

    if (command.verbose) {
        console.log(`Opening Agent Roster for ${resolvedProjectDir}`)
        console.log('Using managed OpenCode sidecar')
        if (command.startupAssetTarget) {
            console.log(`Startup target: ${command.startupAssetTarget.kind} ${command.startupAssetTarget.urn}`)
        }
    }

    await import('./server/index.js')
    await waitForStudioReady(healthUrl)

    if (command.openaiOauth) {
        await runOpenAiOauthSetup(resolvedProjectDir)
    }

    if (command.startupAssetTarget) {
        const { prepareStartupAssetTarget } = await import('./server/services/startup-asset-service.js')
        const prepared = await prepareStartupAssetTarget(resolvedProjectDir, command.startupAssetTarget)
        if (command.verbose) {
            console.log(`${prepared.created ? 'Prepared' : 'Found'} startup ${prepared.kind}: ${prepared.urn}`)
        }
    }

    console.log(`Agent Roster running at ${studioUrl}`)
    console.log(`Workspace: ${resolvedProjectDir}`)
    if (command.startupAssetTarget) {
        console.log(`Launch URL: ${launchUrl}`)
    }
    if (command.openBrowser) {
        const open = await import('open')
        await open.default(launchUrl)
    }
}

const main = async () => {
    try {
        const parsed = parseCliArgs(process.argv.slice(2))
        const packageMeta = await readStudioPackageMeta()

        if (parsed.kind === 'help') {
            printUsage(packageMeta)
            return
        }

        if (parsed.kind === 'version') {
            console.log(packageMeta.version)
            return
        }

        if (parsed.kind === 'doctor') {
            await runDoctor(parsed, packageMeta)
            return
        }

        await runOpen(parsed, packageMeta)
    } catch (error) {
        if (error instanceof CliUsageError) {
            console.error(error.message)
            process.exit(1)
        }

        console.error('Failed to start Agent Roster:', error)
        process.exit(1)
    }
}

void main()
