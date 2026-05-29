/**
 * assistant-service.ts — projection boundary for the built-in APM Assistant.
 *
 * Produces:
 *   ~/.apm-studio/opencode/{agents,skills,tools}/apm-studio/...
 *
 * Builtin assistant skills are authored under:
 *   server/services/studio-assistant/skills/<skill-name>/SKILL.md
 *
 * Assistant tool files are projected alongside the agent so the runtime has a
 * stable mutation tool without relying on text-block parsing.
 *
 * Called eagerly at workspace save / project activate — NOT per-send.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseSkillMarkdown } from '../../../shared/skill-markdown.js'
import { STUDIO_DIR } from '../../lib/config.js'
import { getOpencode } from '../../lib/opencode.js'
import { syncSkillBundleSiblings } from '../opencode-projection/skill-bundle-sync.js'
import { ASSISTANT_TOOL_NAMES, getStaticAssistantTools } from './assistant-tools.js'

export const ASSISTANT_AGENT_ID = 'studio-assistant'
const AGENT_FILENAME = 'studio-assistant.md'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AGENT_PATH = path.join(__dirname, 'agent', 'studio-assistant.md')
const SKILLS_DIR = path.join(__dirname, 'skills')

function assistantProjectionRoot(executionDir: string) {
    void executionDir
    return path.join(STUDIO_DIR, 'opencode')
}

function workspaceAssistantProjectionRoot(executionDir: string) {
    return path.join(executionDir, '.opencode')
}

function agentFilePath(executionDir: string) {
    return path.join(assistantProjectionRoot(executionDir), 'agents', 'apm-studio', AGENT_FILENAME)
}

function skillDir(executionDir: string, skillName: string) {
    return path.join(assistantProjectionRoot(executionDir), 'skills', 'apm-studio', skillName)
}

function skillFilePath(executionDir: string, skillName: string) {
    return path.join(skillDir(executionDir, skillName), 'SKILL.md')
}

function toolFilePath(executionDir: string, toolName: string) {
    return path.join(assistantProjectionRoot(executionDir), 'tools', `${toolName}.ts`)
}

function assistantAgentPath(opencodeRoot: string) {
    return path.join(opencodeRoot, 'agents', 'apm-studio', AGENT_FILENAME)
}

function assistantSkillDir(opencodeRoot: string, skillName: string) {
    return path.join(opencodeRoot, 'skills', 'apm-studio', skillName)
}

function assistantToolPath(opencodeRoot: string, toolName: string) {
    return path.join(opencodeRoot, 'tools', `${toolName}.ts`)
}

async function readAssistantAgent(): Promise<string> {
    return fs.readFile(AGENT_PATH, 'utf-8')
}

interface BuiltinSkill {
    name: string
    description: string
    content: string
    sourceDir: string | null
}

async function readBuiltinSkills(): Promise<BuiltinSkill[]> {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true })
    const skills: BuiltinSkill[] = []

    for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md')
        const raw = await fs.readFile(skillPath, 'utf-8').catch(() => null)
        if (!raw) continue

        const parsed = parseSkillMarkdown(raw)
        const skillName = parsed.name?.trim() || entry.name
        if (skillName !== entry.name) {
            throw new Error(`Builtin assistant skill name mismatch for ${skillPath}: expected "${entry.name}", got "${skillName}"`)
        }

        skills.push({
            name: skillName,
            description: parsed.description?.trim() || entry.name.replace(/-/g, ' '),
            content: raw.trim(),
            sourceDir: path.join(SKILLS_DIR, entry.name),
        })
    }

    return skills.sort((left, right) => left.name.localeCompare(right.name))
}

async function removeStaleBuiltinSkills(
    executionDir: string,
    expectedSkillNames: string[],
): Promise<boolean> {
    const skillsRoot = path.join(assistantProjectionRoot(executionDir), 'skills', 'apm-studio')
    const expected = new Set(expectedSkillNames)
    let changed = false

    const entries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (expected.has(entry.name)) continue

        await fs.rm(path.join(skillsRoot, entry.name), { recursive: true, force: true })
        changed = true
    }

    return changed
}

async function removeStaleAssistantTools(
    executionDir: string,
    expectedToolNames: string[],
): Promise<boolean> {
    const toolsDir = path.join(assistantProjectionRoot(executionDir), 'tools')
    const expected = new Set(expectedToolNames)
    let changed = false

    const entries = await fs.readdir(toolsDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
        const toolName = entry.name.replace(/\.ts$/, '')
        if (!ASSISTANT_TOOL_NAMES.includes(toolName as typeof ASSISTANT_TOOL_NAMES[number])) continue
        if (expected.has(toolName)) continue

        await fs.rm(path.join(toolsDir, entry.name), { force: true })
        changed = true
    }

    return changed
}

async function removeAssistantProjectionAtRoot(
    opencodeRoot: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    let changed = false
    const targets = [
        assistantAgentPath(opencodeRoot),
        ...toolNames.map((toolName) => assistantToolPath(opencodeRoot, toolName)),
        ...skillNames.map((skillName) => assistantSkillDir(opencodeRoot, skillName)),
    ]

    for (const target of targets) {
        const existed = await fs.stat(target).then(() => true).catch(() => false)
        if (!existed) continue
        await fs.rm(target, { recursive: true, force: true })
        changed = true
    }

    const skillsRoot = path.join(opencodeRoot, 'skills', 'apm-studio')
    const remainingSkillEntries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => [])
    if (remainingSkillEntries.length === 0) {
        await fs.rm(skillsRoot, { recursive: true, force: true }).catch(() => {})
    }
    const agentDir = path.join(opencodeRoot, 'agents', 'apm-studio')
    const remainingAgentEntries = await fs.readdir(agentDir, { withFileTypes: true }).catch(() => [])
    if (remainingAgentEntries.length === 0) {
        await fs.rm(agentDir, { recursive: true, force: true }).catch(() => {})
    }

    return changed
}

async function removeDuplicateAssistantProjectionAncestors(
    executionDir: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    const currentDir = path.resolve(executionDir)
    let changed = false

    let cursor = path.dirname(currentDir)
    while (cursor !== currentDir) {
        changed = (await removeAssistantProjectionAtRoot(
            workspaceAssistantProjectionRoot(cursor),
            skillNames,
            toolNames,
        )) || changed

        const parent = path.dirname(cursor)
        if (parent === cursor) break
        cursor = parent
    }

    return changed
}

async function removeDuplicateAssistantProjectionDescendants(
    executionDir: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    const root = path.resolve(executionDir)
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    let changed = false

    async function pruneDirectory(dir: string): Promise<void> {
        const opencodeDir = workspaceAssistantProjectionRoot(dir)
        const hasProjection = await fs.stat(opencodeDir).then(() => true).catch(() => false)
        if (hasProjection) {
            changed = (await removeAssistantProjectionAtRoot(opencodeDir, skillNames, toolNames)) || changed
        }

        const children = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
        for (const entry of children) {
            if (!entry.isDirectory()) continue
            if (entry.name === '.opencode' || entry.name === 'node_modules') continue
            await pruneDirectory(path.join(dir, entry.name))
        }
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name === '.opencode' || entry.name === 'node_modules') continue
        await pruneDirectory(path.join(root, entry.name))
    }

    return changed
}

async function removeManagedWorkspaceAssistantProjection(
    executionDir: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    return removeAssistantProjectionAtRoot(
        workspaceAssistantProjectionRoot(executionDir),
        skillNames,
        toolNames,
    )
}

function buildFrontmatter(skillNames: string[], toolNames: string[]): string {
    const lines = ['---']
    lines.push('description: "APM Assistant"')
    lines.push('mode: primary')
    lines.push('permission:')
    lines.push('  skill:')
    lines.push('    "*": "deny"')
    for (const name of skillNames) {
        lines.push(`    ${JSON.stringify(name)}: "allow"`)
    }
    lines.push('tools:')
    lines.push('  "*": false')
    for (const toolName of toolNames) {
        lines.push(`  ${JSON.stringify(toolName)}: true`)
    }
    lines.push('  "bash": false')
    lines.push('  "edit": false')
    lines.push('  "write": false')
    lines.push('---')
    return lines.join('\n')
}

function buildAgentBody(agentContent: string): string {
    return agentContent.trim()
}

function buildSkillFile(skill: BuiltinSkill): string {
    return skill.content
}

async function writeIfChanged(filePath: string, content: string): Promise<boolean> {
    const current = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (current === content) return false
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return true
}

export async function ensureAssistantAgent(
    executionDir: string,
): Promise<string> {
    const agentContent = await readAssistantAgent()
    const skills = await readBuiltinSkills()
    const tools = getStaticAssistantTools()
    const skillNames = skills.map((skill) => skill.name)
    const toolNames = tools.map((tool) => tool.name)
    let changed = false

    changed = (await removeManagedWorkspaceAssistantProjection(executionDir, skillNames, toolNames)) || changed
    changed = (await removeDuplicateAssistantProjectionAncestors(
        executionDir,
        skillNames,
        toolNames,
    )) || changed
    changed = (await removeDuplicateAssistantProjectionDescendants(
        executionDir,
        skillNames,
        toolNames,
    )) || changed

    const frontmatter = buildFrontmatter(skills.map((skill) => skill.name), [...ASSISTANT_TOOL_NAMES])
    const body = buildAgentBody(agentContent)
    changed = (await writeIfChanged(agentFilePath(executionDir), `${frontmatter}\n\n${body}`)) || changed

    for (const tool of tools) {
        changed = (await writeIfChanged(toolFilePath(executionDir, tool.name), tool.content)) || changed
    }
    changed = (await removeStaleAssistantTools(executionDir, toolNames)) || changed

    for (const skill of skills) {
        changed = (await writeIfChanged(skillFilePath(executionDir, skill.name), buildSkillFile(skill))) || changed
        const bundleSync = await syncSkillBundleSiblings(skill.sourceDir, skillDir(executionDir, skill.name))
        changed = bundleSync.changed || changed
    }
    changed = (await removeStaleBuiltinSkills(executionDir, skillNames)) || changed

    if (changed) {
        const oc = await getOpencode()
        await oc.instance.dispose({ directory: executionDir }).catch(() => {})
    }

    return `apm-studio/${AGENT_FILENAME.replace(/\.md$/, '')}`
}
