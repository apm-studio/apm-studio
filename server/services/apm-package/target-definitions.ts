import fs from 'fs/promises'
import path from 'path'
import type {
    ApmSyncTargetDefinitionKind,
    ApmSyncTargetDefinitionSummary,
    ApmSyncTargetId,
    ApmSyncUnit,
} from '../../../shared/apm-sync-contracts.js'
import { toPosixPath } from './paths.js'
import type { SyncOwnershipManifest } from './sync-ownership.js'

type TargetDefinitionRule = {
    dir?: string
    files?: string[]
    kind: ApmSyncTargetDefinitionKind
    syncUnit?: ApmSyncUnit
    maxDepth?: number
    extensions?: string[]
    basenames?: string[]
}

const TARGET_DEFINITION_RULES: Record<ApmSyncTargetId, TargetDefinitionRule[]> = {
    codex: [
        { dir: '.codex/agents', kind: 'agent', syncUnit: 'agents', maxDepth: 1, extensions: ['.toml', '.md'] },
        { dir: '.codex/skills', kind: 'skill', syncUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { dir: '.agents/skills', kind: 'skill', syncUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { dir: '.codex/hooks', kind: 'hook', syncUnit: 'hooks', maxDepth: 3, extensions: ['.json', '.sh', '.js', '.ts', '.py', ''] },
        { files: ['.codex/hooks.json'], kind: 'hook', syncUnit: 'hooks' },
        { files: ['.codex/config.toml', '.codex/mcp.json'], kind: 'mcp', syncUnit: 'mcp' },
    ],
    claude: [
        { dir: '.claude/agents', kind: 'agent', syncUnit: 'agents', maxDepth: 1, extensions: ['.md'] },
        { dir: '.claude/skills', kind: 'skill', syncUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { dir: '.claude/rules', kind: 'instruction', syncUnit: 'instructions', maxDepth: 2, extensions: ['.md'] },
        { dir: '.claude/commands', kind: 'command', syncUnit: 'commands', maxDepth: 3, extensions: ['.md'] },
        { dir: '.claude/hooks', kind: 'hook', syncUnit: 'hooks', maxDepth: 3, extensions: ['.json', '.sh', '.js', '.ts', '.py', ''] },
        { files: ['CLAUDE.md', '.claude/CLAUDE.md'], kind: 'instruction', syncUnit: 'instructions' },
        { files: ['.claude/settings.json', '.claude/apm-hooks.json'], kind: 'hook', syncUnit: 'hooks' },
        { files: ['.mcp.json', '.claude/mcp.json'], kind: 'mcp', syncUnit: 'mcp' },
    ],
    opencode: [
        { dir: '.opencode/agents', kind: 'agent', syncUnit: 'agents', maxDepth: 2, extensions: ['.md', '.json', '.yaml', '.yml', '.toml', ''] },
        { dir: '.opencode/commands', kind: 'command', syncUnit: 'commands', maxDepth: 3, extensions: ['.md'] },
        { dir: '.opencode/skills', kind: 'skill', syncUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { dir: '.agents/skills', kind: 'skill', syncUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { files: ['opencode.json', '.opencode/opencode.json'], kind: 'mcp', syncUnit: 'mcp' },
    ],
    cursor: [
        { dir: '.cursor/agents', kind: 'agent', syncUnit: 'agents', maxDepth: 2, extensions: ['.md', '.json', '.yaml', '.yml', '.toml'] },
        { dir: '.cursor/rules', kind: 'instruction', syncUnit: 'instructions', maxDepth: 2, extensions: ['.md', '.mdc'] },
        { dir: '.cursor/commands', kind: 'command', syncUnit: 'commands', maxDepth: 3, extensions: ['.md'] },
        { dir: '.cursor/hooks', kind: 'hook', syncUnit: 'hooks', maxDepth: 3, extensions: ['.json', '.sh', '.js', '.ts', '.py', ''] },
        { dir: '.agents/skills', kind: 'skill', syncUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { files: ['.cursor/hooks.json'], kind: 'hook', syncUnit: 'hooks' },
        { files: ['.cursor/mcp.json'], kind: 'mcp', syncUnit: 'mcp' },
    ],
    windsurf: [
        { dir: '.windsurf/rules', kind: 'instruction', syncUnit: 'instructions', maxDepth: 2, extensions: ['.md'] },
        { dir: '.windsurf/skills', kind: 'skill', syncUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { dir: '.windsurf/workflows', kind: 'command', syncUnit: 'commands', maxDepth: 3, extensions: ['.md'] },
        { dir: '.windsurf/hooks', kind: 'hook', syncUnit: 'hooks', maxDepth: 3, extensions: ['.json', '.sh', '.js', '.ts', '.py', ''] },
        { files: ['.windsurf/hooks.json'], kind: 'hook', syncUnit: 'hooks' },
        { files: ['.windsurf/mcp_config.json'], kind: 'mcp', syncUnit: 'mcp' },
    ],
    copilot: [
        { dir: '.github/agents', kind: 'agent', syncUnit: 'agents', maxDepth: 2, extensions: ['.md', '.yaml', '.yml'] },
        { dir: '.github/instructions', kind: 'instruction', syncUnit: 'instructions', maxDepth: 2, extensions: ['.md'] },
        { dir: '.github/prompts', kind: 'prompt', syncUnit: 'prompts', maxDepth: 2, extensions: ['.md'] },
        { dir: '.github/hooks', kind: 'hook', syncUnit: 'hooks', maxDepth: 3, extensions: ['.json', '.sh', '.js', '.ts', '.py', ''] },
        { files: ['.github/copilot-instructions.md'], kind: 'instruction', syncUnit: 'instructions' },
        { dir: '.agents/skills', kind: 'skill', syncUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { files: ['.github/mcp.json', '.vscode/mcp.json'], kind: 'mcp', syncUnit: 'mcp' },
    ],
    gemini: [
        { dir: '.gemini/commands', kind: 'command', syncUnit: 'commands', maxDepth: 3, extensions: ['.toml'] },
        { dir: '.gemini/hooks', kind: 'hook', syncUnit: 'hooks', maxDepth: 3, extensions: ['.json', '.sh', '.js', '.ts', '.py', ''] },
        { dir: '.gemini/skills', kind: 'skill', syncUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { dir: '.agents/skills', kind: 'skill', syncUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
        { files: ['.gemini/GEMINI.md'], kind: 'config' },
        { files: ['.gemini/settings.json'], kind: 'config' },
        { files: ['.gemini/mcp.json'], kind: 'mcp', syncUnit: 'mcp' },
    ],
    'agent-skills': [
        { dir: '.agents/skills', kind: 'skill', syncUnit: 'skills', maxDepth: 3, basenames: ['SKILL.md'], extensions: ['.md'] },
    ],
}

function definitionName(relativePath: string) {
    const parts = relativePath.split('/')
    const basename = parts.at(-1) || relativePath
    if (basename.toLowerCase() === 'skill.md' && parts.length > 1) {
        return parts.at(-2) || basename
    }
    return basename
        .replace(/\.(agent|instructions|prompt)\.md$/i, '')
        .replace(/\.(toml|md|mdc|json|ya?ml)$/i, '')
}

function ruleIncludes(relativePath: string, rule: TargetDefinitionRule) {
    const basename = relativePath.split('/').at(-1) || relativePath
    if (rule.basenames?.includes(basename)) return true
    const ext = path.extname(basename)
    return rule.extensions?.includes(ext) || (ext === '' && rule.extensions?.includes('')) || false
}

async function walkDefinitionFiles(rootDir: string, maxDepth: number): Promise<string[]> {
    const files: string[] = []
    async function walk(current: string, depth: number) {
        if (depth > maxDepth) return
        const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue
            const next = path.join(current, entry.name)
            if (entry.isDirectory()) {
                await walk(next, depth + 1)
            } else if (entry.isFile()) {
                files.push(next)
            }
        }
    }
    await walk(rootDir, 1)
    return files
}

export async function collectTargetDefinitions(
    workingDir: string,
    target: ApmSyncTargetId,
    ownership: SyncOwnershipManifest,
): Promise<ApmSyncTargetDefinitionSummary[]> {
    const definitions = new Map<string, ApmSyncTargetDefinitionSummary>()
    const addDefinition = async (relativePath: string, rule: TargetDefinitionRule) => {
        const normalizedPath = toPosixPath(relativePath).replace(/^\/+/, '')
        const stat = await fs.stat(path.join(workingDir, normalizedPath)).catch(() => null)
        if (!stat?.isFile()) return
        const managedEntry = ownership.files[normalizedPath]
        definitions.set(`${target}:${normalizedPath}`, {
            id: `${target}:${normalizedPath}`,
            target,
            name: definitionName(normalizedPath),
            kind: rule.kind,
            path: normalizedPath,
            ...(rule.syncUnit ? { syncUnit: rule.syncUnit } : {}),
            managed: Boolean(managedEntry),
            ...(managedEntry ? {
                managedPackageId: managedEntry.packageId,
                managedSyncUnit: managedEntry.syncUnit,
                updatedAt: managedEntry.updatedAt,
            } : {}),
        })
    }

    for (const rule of TARGET_DEFINITION_RULES[target]) {
        for (const file of rule.files || []) {
            await addDefinition(file, rule)
        }
        if (!rule.dir) continue
        const rootDir = path.join(workingDir, rule.dir)
        const files = await walkDefinitionFiles(rootDir, rule.maxDepth || 1)
        for (const filePath of files) {
            const relativePath = toPosixPath(path.relative(workingDir, filePath))
            if (ruleIncludes(relativePath, rule)) {
                await addDefinition(relativePath, rule)
            }
        }
    }

    return Array.from(definitions.values())
        .sort((left, right) => (
            left.kind.localeCompare(right.kind)
            || left.name.localeCompare(right.name)
            || left.path.localeCompare(right.path)
        ))
}
