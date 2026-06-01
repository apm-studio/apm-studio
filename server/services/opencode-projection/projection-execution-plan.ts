import {
    mergeProjectionDirtyPatches,
    type ProjectionDirtyPatch,
} from '../../../shared/projection-dirty.js'
import type { ModelSelection } from '../../../shared/model-types.js'
import {
    listWorkspaceAgentsForDir,
} from '../workspace/service.js'
import type { WorkspaceAgentSnapshot } from '../../../shared/workspace-contracts.js'
import type { AgentProjectionInput } from './agent-projection-types.js'

type ProjectionTargetInput = {
    agentId: string
    agentName: string
    agentBody?: string | null
    skillRefs: AgentProjectionInput['skillRefs']
    model: ModelSelection
    modelVariant?: string | null
    mcpServerNames: string[]
    workingDir: string
}

export type ProjectionExecutionPlan = {
    consumedPatch: ProjectionDirtyPatch
    inputs: AgentProjectionInput[]
}

function agentToProjectionInput(
    agent: WorkspaceAgentSnapshot,
    workingDir: string,
): AgentProjectionInput | null {
    if (!agent.model) {
        return null
    }

    return {
        agentId: agent.id,
        agentName: agent.name,
        agentBody: agent.agentBody || null,
        skillRefs: agent.skillRefs || [],
        model: agent.model,
        modelVariant: agent.modelVariant || null,
        mcpServerNames: agent.mcpServerNames || [],
        workingDir,
        scope: 'workspace',
    }
}

function shouldExpandToWorkspace(patch: ProjectionDirtyPatch) {
    return patch.workspaceWide === true
        || (patch.teamIds?.length || 0) > 0
        || (patch.draftIds?.length || 0) > 0
}

export async function buildProjectionExecutionPlan(input: {
    workingDir: string
    target: ProjectionTargetInput
    targetPatch: ProjectionDirtyPatch
    requestedPatch?: ProjectionDirtyPatch | null
}): Promise<ProjectionExecutionPlan> {
    const consumedPatch = mergeProjectionDirtyPatches(input.targetPatch, input.requestedPatch)
    const inputs = new Map<string, AgentProjectionInput>([
        [input.target.agentId, { ...input.target }],
    ])

    const requestedAgentIds = new Set(consumedPatch.agentIds || [])
    if (requestedAgentIds.size === 0 && !shouldExpandToWorkspace(consumedPatch)) {
        return {
            consumedPatch,
            inputs: Array.from(inputs.values()),
        }
    }

    const workspaceAgents = await listWorkspaceAgentsForDir(input.workingDir)
    const includeAllWorkspaceAgents = shouldExpandToWorkspace(consumedPatch)

    for (const agent of workspaceAgents) {
        if (!includeAllWorkspaceAgents && !requestedAgentIds.has(agent.id)) {
            continue
        }
        if (inputs.has(agent.id)) {
            continue
        }
        const projectionInput = agentToProjectionInput(agent, input.workingDir)
        if (!projectionInput) {
            continue
        }
        inputs.set(agent.id, projectionInput)
    }

    return {
        consumedPatch,
        inputs: Array.from(inputs.values()),
    }
}
