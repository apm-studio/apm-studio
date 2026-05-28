import type {
    ApmExportUnit,
    ApmSyncStrategy,
    ApmSyncTargetId,
} from '../../../shared/apm-contracts.js'

export type ExportTargetProfile = {
    id: ApmSyncTargetId
    label: string
    description: string
    outputHint: string
    supportedExportUnits: ApmExportUnit[]
    strategy: ApmSyncStrategy
    artifactRoots: string[]
    projectArtifactFiles?: string[]
}

export const DEFAULT_EXPORT_UNIT: ApmExportUnit = 'agent-packages'

export const EXPORT_UNITS: Array<{ id: ApmExportUnit; label: string; description: string }> = [
    {
        id: 'agent-packages',
        label: 'Agent Packages',
        description: 'Export Studio agent packages as composite APM packages.',
    },
    {
        id: 'agents',
        label: 'Agents',
        description: 'Export only APM agent primitives.',
    },
    {
        id: 'instructions',
        label: 'Instructions',
        description: 'Export only APM instruction primitives.',
    },
    {
        id: 'skills',
        label: 'Skills',
        description: 'Export only APM skill primitives.',
    },
    {
        id: 'mcp',
        label: 'MCP',
        description: 'Export only MCP dependency configuration.',
    },
]

const TARGET_PROFILES: ExportTargetProfile[] = [
    {
        id: 'codex',
        label: 'Codex',
        description: 'Export to Codex subagents, shared skills, hooks, and MCP config where supported.',
        outputHint: '.codex/ + .agents/',
        supportedExportUnits: ['agent-packages', 'agents', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.codex', '.agents'],
    },
    {
        id: 'claude',
        label: 'Claude',
        description: 'Export to Claude agents, rules, skills, hooks, and project MCP files.',
        outputHint: '.claude/ + .mcp.json',
        supportedExportUnits: ['agent-packages', 'agents', 'instructions', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.claude'],
        projectArtifactFiles: ['.mcp.json'],
    },
    {
        id: 'opencode',
        label: 'OpenCode',
        description: 'Export to OpenCode agents, commands, shared skills, and project MCP config.',
        outputHint: '.opencode/ + .agents/ + opencode.json',
        supportedExportUnits: ['agent-packages', 'agents', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.opencode', '.agents'],
        projectArtifactFiles: ['opencode.json'],
    },
    {
        id: 'cursor',
        label: 'Cursor',
        description: 'Export to Cursor agents, rules, commands, shared skills, hooks, and MCP config.',
        outputHint: '.cursor/ + .agents/',
        supportedExportUnits: ['agent-packages', 'agents', 'instructions', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.cursor', '.agents'],
    },
    {
        id: 'windsurf',
        label: 'Windsurf',
        description: 'Export Windsurf rules, skills, workflows, hooks, and MCP config.',
        outputHint: '.windsurf/',
        supportedExportUnits: ['agent-packages', 'instructions', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.windsurf'],
    },
    {
        id: 'copilot',
        label: 'Copilot',
        description: 'Export to GitHub Copilot agents, instructions, prompts, shared skills, hooks, and MCP config.',
        outputHint: '.github/ + .agents/',
        supportedExportUnits: ['agent-packages', 'agents', 'instructions', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.github', '.agents'],
    },
    {
        id: 'gemini',
        label: 'Gemini',
        description: 'Export Gemini skills, hooks, commands, and MCP config. Native agents are not supported.',
        outputHint: '.gemini/ + .agents/',
        supportedExportUnits: ['agent-packages', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.gemini', '.agents'],
    },
    {
        id: 'agent-skills',
        label: 'Agent Skills',
        description: 'Export only shared cross-client APM skills.',
        outputHint: '.agents/skills/',
        supportedExportUnits: ['skills'],
        strategy: 'cli-first',
        artifactRoots: ['.agents'],
    },
]

export function listExportTargetProfiles() {
    return TARGET_PROFILES
}

export function exportTargetProfile(target: ApmSyncTargetId) {
    const profile = TARGET_PROFILES.find((entry) => entry.id === target)
    if (!profile) {
        throw new Error(`Unsupported APM export target: ${target}`)
    }
    return profile
}

export function normalizeExportUnit(value: unknown): ApmExportUnit {
    return EXPORT_UNITS.some((entry) => entry.id === value)
        ? value as ApmExportUnit
        : DEFAULT_EXPORT_UNIT
}

export function targetSupportsExportUnit(target: ApmSyncTargetId, exportUnit: ApmExportUnit) {
    return exportTargetProfile(target).supportedExportUnits.includes(exportUnit)
}

