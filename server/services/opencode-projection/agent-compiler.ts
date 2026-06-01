
import { createHash } from 'crypto'
import { resolveRuntimeModel } from '../../lib/model-catalog.js'
import { findRuntimeModelVariant } from '../../../shared/model-variants.js'
import { toRelativePath, resolveAgentIdentity } from './projection-manifest.js'
import type { Posture } from './projection-manifest.js'
export type { Posture } from './projection-manifest.js'
import type { CompiledSkill } from './skill-compiler.js'
import type { ModelSelection } from '../../../shared/model-types.js'
import { COLLABORATION_TOOL_NAMES } from '../team-runtime/team-tools.js'
import { ASSISTANT_TOOL_NAMES } from '../studio-assistant/assistant-tools.js'



export interface AgentCompileInput {
    agentId: string
    agentName: string
    agentBody?: string | null
    model: ModelSelection
    modelVariant?: string | null
    workspaceHash: string
    executionDir: string
    scope?: 'workspace' | 'team'
    teamId?: string
    skillNames: string[]
    toolMap: Record<string, boolean>
    taskAllowlist?: string[]
    relationPromptSection?: string | null
}

type AgentFile = {
    agentName: string
    filePath: string
    relativePath: string
    content: string
}

export interface CompiledAgent {
    agentId: string
    agentNames: Partial<Record<Posture, string>>
    agentPaths: Partial<Record<Posture, string>>
    agentContents: Partial<Record<Posture, string>>
    skills: CompiledSkill[]
    projectionHash: string
    allFiles: string[]
}




function resolveAgentBody(agentBody?: string | null): string | null {
    if (typeof agentBody === 'string' && agentBody.trim()) {
        return agentBody
    }
    return null
}

function buildBody(input: {
    agentBody: string | null
    relationPromptSection?: string | null
}) {
    return [
        input.agentBody,
        input.relationPromptSection || null,
    ].filter(Boolean).join('\n\n')
}


function buildSkillPermissionLines(skillNames: string[]) {
    const lines = ['permission:', '  skill:', '    "*": "deny"']
    for (const skillName of skillNames) {
        lines.push(`    ${JSON.stringify(skillName)}: "allow"`)
    }
    return lines
}

function buildTaskPermissionLines(taskAllowlist: string[]) {
    if (taskAllowlist.length === 0) {
        return []
    }
    const lines = ['  task:', '    "*": "deny"']
    for (const agentName of taskAllowlist) {
        lines.push(`    ${JSON.stringify(agentName)}: "allow"`)
    }
    return lines
}

function buildToolsLines(
    toolMap: Record<string, boolean>,
    posture: Posture,
    scope: 'workspace' | 'team',
) {
    const effectiveToolMap = { ...toolMap }
    for (const toolName of ASSISTANT_TOOL_NAMES) {
        effectiveToolMap[toolName] = false
    }
    if (scope !== 'team') {
        for (const toolName of COLLABORATION_TOOL_NAMES) {
            effectiveToolMap[toolName] = false
        }
    }

    const pairs = Object.entries(effectiveToolMap).sort(([left], [right]) => left.localeCompare(right))
    if (posture === 'plan') {
        pairs.push(['bash', false], ['edit', false], ['write', false])
    }
    if (pairs.length === 0) {
        return []
    }

    const lines = ['tools:']
    for (const [tool, enabled] of pairs) {
        lines.push(`  ${JSON.stringify(tool)}: ${enabled ? 'true' : 'false'}`)
    }
    return lines
}

function buildFrontmatter(input: {
    agentName: string
    model: ModelSelection
    posture: Posture
    scope: 'workspace' | 'team'
    variantId?: string | null
    skillNames: string[]
    toolMap: Record<string, boolean>
    taskAllowlist?: string[]
}) {
    const lines = ['---']
    lines.push(`description: ${JSON.stringify(`Agent: ${input.agentName}`)}`)
    lines.push('mode: primary')
    if (input.model) {
        const modelStr = input.model.modelId.startsWith(`${input.model.provider}/`)
            ? input.model.modelId
            : `${input.model.provider}/${input.model.modelId}`
        lines.push(`model: ${JSON.stringify(modelStr)}`)
    }
    if (input.variantId) {
        lines.push(`variant: ${JSON.stringify(input.variantId)}`)
    }
    lines.push(...buildSkillPermissionLines(input.skillNames))
    lines.push(...buildTaskPermissionLines(input.taskAllowlist || []))
    lines.push(...buildToolsLines(input.toolMap, input.posture, input.scope))
    lines.push('---')
    return lines.join('\n')
}

function buildAgentFile(input: {
    workspaceHash: string
    agentId: string
    agentName: string
    executionDir: string
    scope: 'workspace' | 'team'
    teamId?: string
    model: ModelSelection
    posture: Posture
    variantId?: string | null
    skillNames: string[]
    toolMap: Record<string, boolean>
    taskAllowlist?: string[]
    body: string
}): AgentFile {
    const identity = resolveAgentIdentity({
        executionDir: input.executionDir,
        workspaceHash: input.workspaceHash,
        agentId: input.agentId,
        posture: input.posture,
        scope: input.scope,
        teamId: input.teamId,
    })
    const frontmatter = buildFrontmatter({
        agentName: input.agentName,
        model: input.model,
        posture: input.posture,
        scope: input.scope,
        variantId: input.variantId,
        skillNames: input.skillNames,
        toolMap: input.toolMap,
        taskAllowlist: input.taskAllowlist,
    })
    const content = `${frontmatter}\n\n${input.body}`
    return {
        agentName: identity.agentName,
        filePath: identity.filePath,
        relativePath: toRelativePath(input.executionDir, identity.filePath),
        content,
    }
}

export async function compileAgent(
    cwd: string,
    input: AgentCompileInput,
    skills: CompiledSkill[],
): Promise<CompiledAgent> {
    const agentBody = resolveAgentBody(input.agentBody)

    let resolvedVariantId: string | null = null
    if (input.model) {
        const runtimeModel = await resolveRuntimeModel(cwd, input.model)
        if (runtimeModel) {
            const resolvedVariant = findRuntimeModelVariant(
                [runtimeModel],
                input.model.provider,
                input.model.modelId,
                input.modelVariant || null,
            )
            resolvedVariantId = resolvedVariant?.id || null
        } else {
            resolvedVariantId = input.modelVariant || null
        }
    }

    const body = buildBody({
        agentBody,
        relationPromptSection: input.relationPromptSection || null,
    })
    const projectionScope = input.scope || 'workspace'

    const buildFile = buildAgentFile({
        workspaceHash: input.workspaceHash,
        agentId: input.agentId,
        agentName: input.agentName,
        executionDir: input.executionDir,
        scope: projectionScope,
        teamId: input.teamId,
        model: input.model,
        posture: 'build',
        variantId: resolvedVariantId,
        skillNames: input.skillNames,
        toolMap: input.toolMap,
        taskAllowlist: input.taskAllowlist,
        body,
    })

    // Team scope: build-only (no plan agent — complex multi-agent Teams
    // make plan mode impractical to control across the whole graph).
    const includePlan = projectionScope !== 'team'
    const planFile = includePlan
        ? buildAgentFile({
            workspaceHash: input.workspaceHash,
            agentId: input.agentId,
            agentName: input.agentName,
            executionDir: input.executionDir,
            scope: projectionScope,
            teamId: input.teamId,
            model: input.model,
            posture: 'plan',
            variantId: resolvedVariantId,
            skillNames: input.skillNames,
            toolMap: input.toolMap,
            taskAllowlist: input.taskAllowlist,
            body,
        })
        : null

    const hashInput = [
        buildFile.content,
        planFile?.content,
        ...skills.map((skill) => skill.content),
    ].filter(Boolean).join('\n\n')
    const projectionHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16)

    const allFiles = [
        buildFile.relativePath,
        ...(planFile ? [planFile.relativePath] : []),
        ...skills.flatMap((skill) => [skill.relativePath, ...skill.additionalFiles]),
    ]

    return {
        agentId: input.agentId,
        agentNames: {
            build: buildFile.agentName,
            ...(planFile ? { plan: planFile.agentName } : {}),
        },
        agentPaths: {
            build: buildFile.filePath,
            ...(planFile ? { plan: planFile.filePath } : {}),
        },
        agentContents: {
            build: buildFile.content,
            ...(planFile ? { plan: planFile.content } : {}),
        },
        skills,
        projectionHash,
        allFiles,
    }
}
