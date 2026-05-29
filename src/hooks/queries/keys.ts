import type { ApmPackageScope } from '../../../shared/apm-contracts'

export const queryKeys = {
    models: (workingDir: string) => ['models', workingDir] as const,
    agents: ['agents'] as const,
    mcpServers: ['mcp-servers'] as const,
    runtimeTools: (workingDir: string, modelKey: string, serverKey: string) => ['runtime-tools', workingDir, modelKey, serverKey] as const,
    serverHealth: ['server-health'] as const,
    apmPackages: (workingDir: string, scope?: ApmPackageScope) => ['apm-packages', workingDir, scope || 'workspace'] as const,
} as const
