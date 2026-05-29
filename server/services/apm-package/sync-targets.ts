import type {
    ApmSyncUnit,
    ApmSyncStrategy,
    ApmSyncTargetId,
} from '../../../shared/apm-sync-contracts.js'

export type SyncTargetProfile = {
    id: ApmSyncTargetId
    label: string
    description: string
    outputHint: string
    supportedSyncUnits: ApmSyncUnit[]
    strategy: ApmSyncStrategy
    artifactRoots: string[]
    projectArtifactFiles?: string[]
}

const TARGET_PROFILES: SyncTargetProfile[] = [
    {
        id: 'codex',
        label: 'Codex',
        description: 'Sync to Codex subagents, shared skills, hooks, and MCP config where supported.',
        outputHint: '.codex/ + .agents/',
        supportedSyncUnits: ['agent-packages', 'agents', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.codex', '.agents'],
    },
    {
        id: 'claude',
        label: 'Claude',
        description: 'Sync to Claude agents, rules, skills, hooks, and project MCP files.',
        outputHint: '.claude/ + .mcp.json',
        supportedSyncUnits: ['agent-packages', 'agents', 'instructions', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.claude'],
        projectArtifactFiles: ['.mcp.json'],
    },
    {
        id: 'opencode',
        label: 'OpenCode',
        description: 'Sync to OpenCode agents, commands, shared skills, and project MCP config.',
        outputHint: '.opencode/ + .agents/ + opencode.json',
        supportedSyncUnits: ['agent-packages', 'agents', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.opencode', '.agents'],
        projectArtifactFiles: ['opencode.json'],
    },
    {
        id: 'cursor',
        label: 'Cursor',
        description: 'Sync to Cursor agents, rules, commands, shared skills, hooks, and MCP config.',
        outputHint: '.cursor/ + .agents/',
        supportedSyncUnits: ['agent-packages', 'agents', 'instructions', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.cursor', '.agents'],
    },
    {
        id: 'windsurf',
        label: 'Windsurf',
        description: 'Sync Windsurf rules, skills, workflows, hooks, and MCP config.',
        outputHint: '.windsurf/',
        supportedSyncUnits: ['agent-packages', 'instructions', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.windsurf'],
    },
    {
        id: 'copilot',
        label: 'Copilot',
        description: 'Sync to GitHub Copilot agents, instructions, prompts, shared skills, hooks, and MCP config.',
        outputHint: '.github/ + .agents/',
        supportedSyncUnits: ['agent-packages', 'agents', 'instructions', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.github', '.agents'],
    },
    {
        id: 'gemini',
        label: 'Gemini',
        description: 'Sync Gemini skills, hooks, commands, and MCP config. Native agents are not supported.',
        outputHint: '.gemini/ + .agents/',
        supportedSyncUnits: ['agent-packages', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.gemini', '.agents'],
    },
    {
        id: 'agent-skills',
        label: 'Agent Skills',
        description: 'Sync only shared cross-client APM skills.',
        outputHint: '.agents/skills/',
        supportedSyncUnits: ['skills'],
        strategy: 'cli-first',
        artifactRoots: ['.agents'],
    },
]

export function listSyncTargetProfiles() {
    return TARGET_PROFILES
}

export function syncTargetProfile(target: ApmSyncTargetId) {
    const profile = TARGET_PROFILES.find((entry) => entry.id === target)
    if (!profile) {
        throw new Error(`Unsupported APM sync target: ${target}`)
    }
    return profile
}

export function targetSupportsSyncUnit(target: ApmSyncTargetId, syncUnit: ApmSyncUnit) {
    return syncTargetProfile(target).supportedSyncUnits.includes(syncUnit)
}
