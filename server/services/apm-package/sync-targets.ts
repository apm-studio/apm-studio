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
        description: 'Export Studio Agents as Codex subagents or sync supported APM primitives.',
        outputHint: '.codex/ + .agents/',
        supportedSyncUnits: ['studio-agent', 'agents', 'skills', 'hooks', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.codex', '.agents'],
    },
    {
        id: 'claude',
        label: 'Claude',
        description: 'Export Studio Agents as Claude agents or sync supported APM primitives.',
        outputHint: '.claude/ + .mcp.json',
        supportedSyncUnits: ['studio-agent', 'agents', 'instructions', 'commands', 'skills', 'hooks', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.claude'],
        projectArtifactFiles: ['.mcp.json'],
    },
    {
        id: 'opencode',
        label: 'OpenCode',
        description: 'Sync to OpenCode agents, commands, shared skills, and project MCP config.',
        outputHint: '.opencode/ + .agents/ + opencode.json',
        supportedSyncUnits: ['agents', 'commands', 'skills', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.opencode', '.agents'],
        projectArtifactFiles: ['opencode.json'],
    },
    {
        id: 'cursor',
        label: 'Cursor',
        description: 'Sync to Cursor agents, rules, commands, shared skills, hooks, and MCP config.',
        outputHint: '.cursor/ + .agents/',
        supportedSyncUnits: ['agents', 'instructions', 'commands', 'skills', 'hooks', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.cursor', '.agents'],
    },
    {
        id: 'windsurf',
        label: 'Windsurf',
        description: 'Sync Windsurf rules, skills, workflows, hooks, and MCP config.',
        outputHint: '.windsurf/',
        supportedSyncUnits: ['instructions', 'commands', 'skills', 'hooks', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.windsurf'],
    },
    {
        id: 'copilot',
        label: 'Copilot',
        description: 'Sync to GitHub Copilot agents, instructions, prompts, shared skills, hooks, and MCP config.',
        outputHint: '.github/ + .agents/ + .vscode/mcp.json',
        supportedSyncUnits: ['agents', 'instructions', 'prompts', 'skills', 'hooks', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.github', '.agents'],
        projectArtifactFiles: ['.vscode/mcp.json'],
    },
    {
        id: 'gemini',
        label: 'Gemini',
        description: 'Sync Gemini skills, hooks, commands, and MCP config. Native agents are not supported.',
        outputHint: '.gemini/ + .agents/',
        supportedSyncUnits: ['commands', 'skills', 'hooks', 'mcp'],
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
