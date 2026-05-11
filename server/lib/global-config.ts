import fs from 'fs/promises'
import path from 'path'
import stripJsonComments from 'strip-json-comments'
import { STUDIO_OPENCODE_CONFIG_DIR } from './config.js'

const DEFAULT_PLUGIN_SPECS = [
    '@cortexkit/opencode-anthropic-auth@1.0.0',
] as const
const LEGACY_DEFAULT_PLUGIN_NAMES = new Set([
    'opencode-anthropic-auth',
])

function packageNameFromSpec(spec: string) {
    const trimmed = spec.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('@')) {
        const slash = trimmed.indexOf('/')
        if (slash === -1) return trimmed
        const versionAt = trimmed.indexOf('@', slash)
        return versionAt === -1 ? trimmed : trimmed.slice(0, versionAt)
    }
    const versionAt = trimmed.indexOf('@')
    return versionAt === -1 ? trimmed : trimmed.slice(0, versionAt)
}

function mergeDefaultPlugins(plugin: unknown) {
    const raw = Array.isArray(plugin)
        ? plugin.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : []
    const current = raw.filter((entry) => !LEGACY_DEFAULT_PLUGIN_NAMES.has(packageNameFromSpec(entry)))
    const existingNames = new Set(current.map(packageNameFromSpec))
    const missing = DEFAULT_PLUGIN_SPECS.filter((spec) => !existingNames.has(packageNameFromSpec(spec)))

    return {
        changed: missing.length > 0 || current.length !== raw.length || !Array.isArray(plugin),
        plugin: [...current, ...missing],
    }
}

export function resolveGlobalConfigDir(): string {
    return STUDIO_OPENCODE_CONFIG_DIR
}

export function resolveGlobalConfigPath(): string {
    return path.join(resolveGlobalConfigDir(), 'opencode.json')
}

export async function readGlobalConfigFile(): Promise<Record<string, unknown>> {
    const filePath = resolveGlobalConfigPath()
    try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const parsed = JSON.parse(stripJsonComments(raw))
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export async function readGlobalConfigSnapshot() {
    const path = resolveGlobalConfigPath()
    const exists = await fs.access(path).then(() => true).catch(() => false)
    return {
        exists,
        path,
        config: await readGlobalConfigFile(),
    }
}

export async function ensureGlobalConfigDefaults() {
    const current = await readGlobalConfigFile()
    const nextPlugins = mergeDefaultPlugins(current.plugin)
    if (!nextPlugins.changed) {
        return current
    }

    const next = mergeOpenCodeConfig(current, {
        plugin: nextPlugins.plugin,
    })
    const filePath = resolveGlobalConfigPath()
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8')
    return next
}

export function mergeOpenCodeConfig(
    current: Record<string, unknown>,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...(Object.keys(current).length === 0 ? { $schema: 'https://opencode.ai/config.json' } : {}),
        ...current,
        ...patch,
        ...(patch.mcp && typeof patch.mcp === 'object' ? { mcp: patch.mcp } : {}),
        ...(patch.tools && typeof patch.tools === 'object' ? { tools: patch.tools } : {}),
    }
}

export async function writeGlobalConfigFile(
    config: Record<string, unknown>,
    options?: {
        dispose?: boolean
    },
) {
    const filePath = resolveGlobalConfigPath()
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
    if (options?.dispose !== false) {
        const { getOpencode } = await import('./opencode.js')
        const oc = await getOpencode()
        await oc.global.dispose()
    }
    return config
}
