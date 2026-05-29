import type { RuntimeToolResolution } from '../../../shared/opencode-contracts.js'
import { compileSkill, type CompiledSkill } from './skill-compiler.js'
import {
    compileAgent,
    type CompiledAgent,
    type AgentCompileInput,
} from './agent-compiler.js'
import type {
    AgentProjectionInput,
} from './agent-projection-types.js'
import {
    applyAgentProjectionFiles,
    pruneStaleAgentProjectionFiles,
} from './agent-projection-writer.js'
import {
    computeWorkspaceHash,
    getProjectedAgentName,
} from './agent-projection-identity.js'
import {
    compileProjectionRequestRelations,
} from './agent-projection-relations.js'
import {
    resolveAgentProjectionRuntime,
    type CapabilitySnapshot,
} from './agent-projection-runtime.js'
export type {
    CodexProjectionAgentSnapshot,
    AgentProjectionInput,
} from './agent-projection-types.js'

export interface EnsuredAgentProjection {
    compiled: CompiledAgent
    toolResolution: RuntimeToolResolution
    toolMap: Record<string, boolean>
    capabilitySnapshot: CapabilitySnapshot
    changed: boolean
}

export async function pruneStaleAgentProjections(workingDir: string, agentIds: string[]) {
    return pruneStaleAgentProjectionFiles(workingDir, agentIds)
}

export async function ensureAgentProjection(input: AgentProjectionInput): Promise<EnsuredAgentProjection> {
    const workspaceHash = computeWorkspaceHash(input.workingDir)
    const projectionRuntime = await resolveAgentProjectionRuntime(input)

    const compiledSkills: CompiledSkill[] = []
    for (const ref of input.skillRefs) {
        compiledSkills.push(await compileSkill(
            input.workingDir,
            ref,
            workspaceHash,
            input.agentId,
            input.workingDir,
            input.scope || 'workspace',
            input.teamId,
        ))
    }

    const skills = compiledSkills
    const requestProjection = compileProjectionRequestRelations(input)

    const compiled = await compileAgent(
        input.workingDir,
        {
            agentId: input.agentId,
            agentName: input.agentName,
            instructionRef: input.instructionRef,
            agentBody: input.agentBody || null,
            model: input.model,
            modelVariant: input.modelVariant || null,
            workspaceHash,
            executionDir: input.workingDir,
            scope: input.scope || 'workspace',
            teamId: input.teamId,
            skillNames: skills.map((skill) => skill.logicalName),
            toolMap: projectionRuntime.toolMap,
            taskAllowlist: requestProjection.taskAllowlist,
            relationPromptSection: requestProjection.promptSection,
        } satisfies AgentCompileInput,
        skills,
    )
    const changed = await applyAgentProjectionFiles({
        workingDir: input.workingDir,
        workspaceHash,
        agentId: input.agentId,
        compiled,
        skills,
        extraTools: input.extraTools,
    })

    return {
        compiled,
        toolResolution: projectionRuntime.toolResolution,
        toolMap: projectionRuntime.toolMap,
        capabilitySnapshot: projectionRuntime.capabilitySnapshot,
        changed,
    }
}

export { getProjectedAgentName }
