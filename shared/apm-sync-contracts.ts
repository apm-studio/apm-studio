import type { ApmPackageSummary, ApmToolingStatus } from './apm-contracts.js'

export type ApmSyncUnit =
    | 'studio-agent'
    | 'agents'
    | 'instructions'
    | 'skills'
    | 'prompts'
    | 'commands'
    | 'hooks'
    | 'mcp'
export type ApmPrimitiveSyncUnit = Exclude<ApmSyncUnit, 'studio-agent'>

export type ApmSyncUnitDefinition = {
    id: ApmSyncUnit
    label: string
    description: string
}

export type ApmSyncPrimitiveCounts = Record<ApmPrimitiveSyncUnit, number>

export const DEFAULT_APM_SYNC_UNIT: ApmSyncUnit = 'studio-agent'

export const APM_SYNC_UNITS: ApmSyncUnitDefinition[] = [
    {
        id: 'studio-agent',
        label: 'Studio Agent',
        description: 'Export a Studio Agent as an agent-scoped composed artifact.',
    },
    {
        id: 'agents',
        label: 'APM Agents',
        description: 'Sync only APM agent primitives.',
    },
    {
        id: 'instructions',
        label: 'Instructions',
        description: 'Sync only APM instruction primitives.',
    },
    {
        id: 'skills',
        label: 'Skills',
        description: 'Sync only APM skill primitives.',
    },
    {
        id: 'prompts',
        label: 'Prompts',
        description: 'Sync APM prompt primitives to prompt-capable targets.',
    },
    {
        id: 'commands',
        label: 'Commands',
        description: 'Sync APM prompt source files as target command primitives.',
    },
    {
        id: 'hooks',
        label: 'Hooks',
        description: 'Sync only APM hook primitives.',
    },
    {
        id: 'mcp',
        label: 'MCP',
        description: 'Sync only MCP dependency configuration.',
    },
]

export function isApmSyncUnit(value: unknown): value is ApmSyncUnit {
    return APM_SYNC_UNITS.some((entry) => entry.id === value)
}

export function normalizeApmSyncUnit(value: unknown): ApmSyncUnit | null {
    return isApmSyncUnit(value) ? value : null
}

export function apmPackageSyncPrimitiveCounts(
    pkg: Pick<ApmPackageSummary, 'kind' | 'agentComponents' | 'microsoftApm'>,
): ApmSyncPrimitiveCounts {
    const counts = pkg.microsoftApm?.primitiveCounts
    return {
        agents: counts?.agents || 0,
        instructions: counts?.instructions || 0,
        skills: counts?.skills || 0,
        prompts: counts?.prompts || 0,
        commands: counts?.commands || 0,
        hooks: counts?.hooks || 0,
        mcp: counts?.mcp || (pkg.kind === 'mcp' ? 1 : pkg.agentComponents?.mcp || 0),
    }
}

export function sumApmPackageSyncPrimitiveCounts(
    packages: Array<Pick<ApmPackageSummary, 'kind' | 'agentComponents' | 'microsoftApm'>>,
): ApmSyncPrimitiveCounts {
    return packages.reduce<ApmSyncPrimitiveCounts>((total, pkg) => {
        const counts = apmPackageSyncPrimitiveCounts(pkg)
        total.agents += counts.agents
        total.instructions += counts.instructions
        total.skills += counts.skills
        total.prompts += counts.prompts
        total.commands += counts.commands
        total.hooks += counts.hooks
        total.mcp += counts.mcp
        return total
    }, { agents: 0, instructions: 0, skills: 0, prompts: 0, commands: 0, hooks: 0, mcp: 0 })
}

export function apmPackageSyncUnits(
    pkg: Pick<ApmPackageSummary, 'kind' | 'agentComponents' | 'microsoftApm'>,
): ApmPrimitiveSyncUnit[] {
    const counts = apmPackageSyncPrimitiveCounts(pkg)
    const units: ApmPrimitiveSyncUnit[] = []
    if (counts.agents > 0) units.push('agents')
    if (counts.instructions > 0) units.push('instructions')
    if (counts.skills > 0) units.push('skills')
    if (counts.prompts > 0) units.push('prompts')
    if (counts.commands > 0) units.push('commands')
    if (counts.hooks > 0) units.push('hooks')
    if (counts.mcp > 0) units.push('mcp')
    return units
}

export function apmPackageHasSyncUnit(
    pkg: Pick<ApmPackageSummary, 'kind' | 'agentComponents' | 'microsoftApm'>,
    syncUnit: ApmSyncUnit,
) {
    const units = apmPackageSyncUnits(pkg)
    return syncUnit === 'studio-agent'
        ? units.includes('agents') || pkg.kind === 'agent'
        : units.includes(syncUnit)
}

export type ApmSyncTargetId =
    | 'codex'
    | 'gemini'
    | 'claude'
    | 'opencode'
    | 'cursor'
    | 'windsurf'
    | 'copilot'
    | 'agent-skills'

export type ApmSyncStrategy = 'cli-first'

export type ApmSyncTargetDefinitionKind =
    | 'agent'
    | 'instruction'
    | 'skill'
    | 'prompt'
    | 'command'
    | 'hook'
    | 'mcp'
    | 'config'
    | 'unknown'

export interface ApmSyncTargetItemSummary {
    packageId: string
    target: ApmSyncTargetId
    syncUnit: ApmSyncUnit
    artifactCount: number
    artifacts: string[]
    updatedAt: string
}

export interface ApmSyncTargetDefinitionSummary {
    id: string
    target: ApmSyncTargetId
    name: string
    kind: ApmSyncTargetDefinitionKind
    path: string
    syncUnit?: ApmSyncUnit
    managed: boolean
    managedPackageId?: string
    managedSyncUnit?: ApmSyncUnit
    updatedAt?: string
}

export interface ApmSyncTargetSummary {
    id: ApmSyncTargetId
    label: string
    description: string
    outputHint: string
    commandPreview: string
    available: boolean
    supportedSyncUnits: ApmSyncUnit[]
    strategy: ApmSyncStrategy
    currentItems: ApmSyncTargetItemSummary[]
    definitions: ApmSyncTargetDefinitionSummary[]
    disabledReason?: string
}

export interface ApmSyncTargetsResponse {
    tooling: ApmToolingStatus
    targets: ApmSyncTargetSummary[]
}

export interface ApmSyncRunRequest {
    targets: ApmSyncTargetId[]
    syncUnit?: ApmSyncUnit
    packageIds?: string[]
}

export interface ApmSyncPackageResult {
    packageId: string
    name: string
    target: ApmSyncTargetId
    syncUnit?: ApmSyncUnit
    command: string
    status: 'synced' | 'failed' | 'skipped'
    projectedAs?: string
    artifacts?: string[]
    warnings?: string[]
    modelOmitted?: boolean
    stdout?: string
    stderr?: string
    error?: string
}

export interface ApmSyncRunResponse {
    ok: true
    targets: ApmSyncTargetId[]
    syncUnit: ApmSyncUnit
    startedAt: number
    finishedAt: number
    results: ApmSyncPackageResult[]
}
