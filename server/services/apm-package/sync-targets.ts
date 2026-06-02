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
    outputHints: Partial<Record<ApmSyncUnit, string>>
    supportedSyncUnits: ApmSyncUnit[]
    strategy: ApmSyncStrategy
    artifactRoots: string[]
    projectArtifactFiles?: string[]
}

const TARGET_PROFILES: SyncTargetProfile[] = [
    {
        id: 'codex',
        label: 'Codex',
        description: 'Sync supported APM primitives into Codex project files.',
        outputHint: '.codex/ + .agents/',
        outputHints: {
            agents: '.codex/agents/',
            skills: '.codex/skills/ + .agents/skills/',
            hooks: '.codex/hooks/ + .codex/hooks.json',
            mcp: '.codex/config.toml + .codex/mcp.json',
        },
        supportedSyncUnits: ['agents', 'skills', 'hooks', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.codex', '.agents'],
    },
    {
        id: 'claude',
        label: 'Claude',
        description: 'Sync supported APM primitives into Claude project files.',
        outputHint: '.claude/ + .mcp.json',
        outputHints: {
            agents: '.claude/agents/',
            instructions: '.claude/rules/ + CLAUDE.md',
            commands: '.claude/commands/',
            skills: '.claude/skills/',
            hooks: '.claude/hooks/ + .claude/settings.json',
            mcp: '.mcp.json + .claude/mcp.json',
        },
        supportedSyncUnits: ['agents', 'instructions', 'commands', 'skills', 'hooks', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.claude'],
        projectArtifactFiles: ['.mcp.json'],
    },
    {
        id: 'opencode',
        label: 'OpenCode',
        description: 'Sync to OpenCode agents, commands, shared skills, and project MCP config.',
        outputHint: '.opencode/ + .agents/ + opencode.json',
        outputHints: {
            agents: '.opencode/agents/',
            commands: '.opencode/commands/',
            skills: '.opencode/skills/ + .agents/skills/',
            mcp: 'opencode.json + .opencode/opencode.json',
        },
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
        outputHints: {
            agents: '.cursor/agents/',
            instructions: '.cursor/rules/',
            commands: '.cursor/commands/',
            skills: '.agents/skills/',
            hooks: '.cursor/hooks/ + .cursor/hooks.json',
            mcp: '.cursor/mcp.json',
        },
        supportedSyncUnits: ['agents', 'instructions', 'commands', 'skills', 'hooks', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.cursor', '.agents'],
    },
    {
        id: 'windsurf',
        label: 'Windsurf',
        description: 'Sync Windsurf rules, skills, workflows, hooks, and MCP config.',
        outputHint: '.windsurf/',
        outputHints: {
            instructions: '.windsurf/rules/',
            commands: '.windsurf/workflows/',
            skills: '.windsurf/skills/',
            hooks: '.windsurf/hooks/ + .windsurf/hooks.json',
            mcp: '.windsurf/mcp_config.json',
        },
        supportedSyncUnits: ['instructions', 'commands', 'skills', 'hooks', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.windsurf'],
    },
    {
        id: 'copilot',
        label: 'Copilot',
        description: 'Sync to GitHub Copilot agents, instructions, prompts, shared skills, hooks, and MCP config.',
        outputHint: '.github/ + .agents/ + .vscode/mcp.json',
        outputHints: {
            agents: '.github/agents/',
            instructions: '.github/instructions/ + .github/copilot-instructions.md',
            prompts: '.github/prompts/',
            skills: '.agents/skills/',
            hooks: '.github/hooks/',
            mcp: '.github/mcp.json + .vscode/mcp.json',
        },
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
        outputHints: {
            commands: '.gemini/commands/',
            skills: '.gemini/skills/ + .agents/skills/',
            hooks: '.gemini/hooks/',
            mcp: '.gemini/mcp.json',
        },
        supportedSyncUnits: ['commands', 'skills', 'hooks', 'mcp'],
        strategy: 'cli-first',
        artifactRoots: ['.gemini', '.agents'],
    },
    {
        id: 'agent-skills',
        label: 'Agent Skills',
        description: 'Sync only shared cross-client APM skills.',
        outputHint: '.agents/skills/',
        outputHints: {
            skills: '.agents/skills/',
        },
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
