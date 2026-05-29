import { invalidate } from '../../lib/cache.js'
import {
    readProjectConfigFile,
    resolveProjectConfigPath,
    writeProjectConfigFile,
} from '../../lib/project-config.js'
import { mergeOpenCodeConfig, readGlobalConfigFile, writeGlobalConfigFile } from '../../lib/global-config.js'
import type {
    OpenCodeConfig,
    OpenCodeConfigUpdateResponse,
    OpenCodeProjectConfigResponse,
} from '../../../shared/opencode-contracts.js'

export async function getGlobalOpenCodeConfig(): Promise<OpenCodeConfig> {
    return readGlobalConfigFile()
}

export async function updateGlobalOpenCodeConfig(patch: unknown): Promise<OpenCodeConfigUpdateResponse> {
    const current = await readGlobalConfigFile()
    const nextConfig = mergeOpenCodeConfig(current, patch && typeof patch === 'object' ? patch as Record<string, unknown> : {})
    await writeGlobalConfigFile(nextConfig)
    invalidate('mcp-servers')
    return nextConfig
}

export async function updateProjectOpenCodeConfig(directory: string, patch: unknown): Promise<OpenCodeConfigUpdateResponse> {
    const current = await readProjectConfigFile(directory)
    const nextConfig = mergeProjectConfig(current, patch && typeof patch === 'object' ? patch as Record<string, unknown> : {})
    await writeProjectConfigFile(directory, nextConfig)
    invalidate('mcp-servers')
    return nextConfig
}

export async function readProjectConfigFromOpencode(directory: string) {
    return {
        cwd: directory,
        config: await readProjectConfigFile(directory),
    }
}

export async function readProjectConfigSnapshot(directory: string): Promise<OpenCodeProjectConfigResponse> {
    try {
        const { cwd, config } = await readProjectConfigFromOpencode(directory)
        const configPath = await resolveProjectConfigPath(cwd)
        return {
            exists: true as const,
            path: configPath,
            config,
        }
    } catch {
        const configPath = await resolveProjectConfigPath(directory)
        return {
            exists: false as const,
            path: configPath,
            config: {},
        }
    }
}

export function mergeProjectConfig(
    current: Record<string, unknown>,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...current,
        ...patch,
        ...(patch.mcp && typeof patch.mcp === 'object' ? { mcp: patch.mcp } : {}),
    }
}
