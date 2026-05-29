import fs from 'fs/promises'
import path from 'path'
import { COLLABORATION_TOOL_NAMES } from '../team-runtime/team-tools.js'
import type { CompiledAgent } from './agent-compiler.js'
import type { AgentProjectionInput } from './agent-projection-types.js'
import {
    cleanGroupFiles,
    markProjectionRuntimePending,
    readManifest,
    toRelativePath,
    updateGitExclude,
    updateManifestGroup,
    writeManifest,
} from './projection-manifest.js'
import type { CompiledSkill } from './skill-compiler.js'

type ExtraTool = NonNullable<AgentProjectionInput['extraTools']>[number]

export function agentProjectionGroupKey(agentId: string) {
    return `agent:${agentId}`
}

async function writeIfChanged(filePath: string, content: string) {
    const current = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (current === content) {
        return false
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return true
}

async function cleanExtraToolFiles(workingDir: string, extraTools: ExtraTool[]) {
    const currentToolNames = new Set<string>(extraTools.map((tool) => tool.name))
    const collaborationToolNames = new Set<string>(COLLABORATION_TOOL_NAMES)
    const toolsDir = path.join(workingDir, '.opencode', 'tools')
    let changed = false

    const existing = await fs.readdir(toolsDir).catch(() => [])
    for (const file of existing) {
        if (!file.endsWith('.ts')) continue
        const toolName = file.replace(/\.ts$/, '')
        if (collaborationToolNames.has(toolName) && !currentToolNames.has(toolName)) {
            await fs.rm(path.join(toolsDir, file), { force: true }).catch(() => {})
            changed = true
        }
    }

    return changed
}

async function writeExtraToolFiles(
    workingDir: string,
    compiled: CompiledAgent,
    extraTools: ExtraTool[],
) {
    let changed = false
    for (const tool of extraTools) {
        const toolPath = path.join(workingDir, '.opencode', 'tools', `${tool.name}.ts`)
        compiled.allFiles.push(toRelativePath(workingDir, toolPath))
        changed = (await writeIfChanged(toolPath, tool.content)) || changed
    }
    return changed
}

async function writeCompiledAgentFiles(compiled: CompiledAgent) {
    const buildPath = compiled.agentPaths.build
    const buildContent = compiled.agentContents.build
    if (!buildPath || !buildContent) {
        throw new Error(`Missing build projection for agent ${compiled.agentId}.`)
    }

    let changed = await writeIfChanged(buildPath, buildContent)
    if (compiled.agentPaths.plan && compiled.agentContents.plan) {
        changed = (await writeIfChanged(compiled.agentPaths.plan, compiled.agentContents.plan)) || changed
    }
    return changed
}

async function writeCompiledSkillFiles(skills: CompiledSkill[]) {
    let changed = false
    for (const skill of skills) {
        changed = (await writeIfChanged(skill.filePath, skill.content)) || changed
        changed = skill.bundleChanged || changed
    }
    return changed
}

export async function applyAgentProjectionFiles(input: {
    workingDir: string
    workspaceHash: string
    agentId: string
    compiled: CompiledAgent
    skills: CompiledSkill[]
    extraTools?: AgentProjectionInput['extraTools']
}) {
    let changed = false

    if (input.extraTools) {
        changed = (await cleanExtraToolFiles(input.workingDir, input.extraTools)) || changed
        changed = (await writeExtraToolFiles(input.workingDir, input.compiled, input.extraTools)) || changed
    }

    await cleanGroupFiles(
        input.workingDir,
        agentProjectionGroupKey(input.agentId),
        input.compiled.allFiles,
    )

    changed = (await writeCompiledSkillFiles(input.skills)) || changed
    changed = (await writeCompiledAgentFiles(input.compiled)) || changed

    await updateManifestGroup(
        input.workingDir,
        input.workspaceHash,
        agentProjectionGroupKey(input.agentId),
        input.compiled.allFiles,
    )
    await updateGitExclude(input.workingDir)
    if (changed) {
        await markProjectionRuntimePending(input.workingDir, input.workspaceHash)
    }

    return changed
}

export async function pruneStaleAgentProjectionFiles(workingDir: string, agentIds: string[]) {
    const manifest = await readManifest(workingDir)
    if (!manifest) {
        return false
    }

    const activeIds = new Set(agentIds)
    const staleKeys = Object.keys(manifest.groups).filter((key) => {
        if (!key.startsWith('agent:')) return false
        const agentId = key.slice('agent:'.length)
        return !activeIds.has(agentId)
    })

    if (staleKeys.length === 0) {
        return false
    }

    let changed = false
    for (const key of staleKeys) {
        for (const file of manifest.groups[key] || []) {
            await fs.rm(path.join(workingDir, file), { force: true, recursive: true }).catch(() => {})
            changed = true
        }
        delete manifest.groups[key]
        changed = true
    }

    if (!changed) {
        return false
    }
    await writeManifest(workingDir, manifest)
    return true
}
