import { resolveRuntimeModel } from '../../lib/model-catalog.js'
import { resolveRuntimeTools } from '../../lib/runtime-tools.js'
import { mcpToolPattern } from '../../../shared/mcp-catalog.js'
import type { ModelCapabilities } from '../../../shared/model-types.js'
import type { RuntimeToolResolution } from '../../../shared/opencode-contracts.js'
import type { AgentProjectionInput } from './agent-projection-types.js'

export type CapabilitySnapshot = ModelCapabilities | null

export type AgentProjectionRuntime = {
    toolResolution: RuntimeToolResolution
    toolMap: Record<string, boolean>
    capabilitySnapshot: CapabilitySnapshot
}

function buildProjectedToolMap(mcpServerNames: string[]) {
    return Object.fromEntries(
        Array.from(new Set(mcpServerNames.filter(Boolean)))
            .sort((left, right) => left.localeCompare(right))
            .map((serverName) => [mcpToolPattern(serverName), true]),
    )
}

async function resolveCapabilitySnapshot(
    input: Pick<AgentProjectionInput, 'workingDir' | 'model'>,
): Promise<CapabilitySnapshot> {
    if (!input.model) {
        return null
    }
    const runtimeModel = await resolveRuntimeModel(input.workingDir, input.model)
    if (!runtimeModel) {
        return null
    }
    return {
        toolCall: runtimeModel.toolCall,
        reasoning: runtimeModel.reasoning,
        attachment: runtimeModel.attachment,
        temperature: runtimeModel.temperature,
        modalities: runtimeModel.modalities,
    }
}

export async function resolveAgentProjectionRuntime(
    input: Pick<AgentProjectionInput, 'workingDir' | 'model' | 'mcpServerNames' | 'extraTools'>,
): Promise<AgentProjectionRuntime> {
    const toolResolution = await resolveRuntimeTools(input.workingDir, input.model, input.mcpServerNames)
    const resolvedServerNames = input.mcpServerNames.filter((serverName) =>
        toolResolution.resolvedTools.includes(mcpToolPattern(serverName)),
    )
    const toolMap = buildProjectedToolMap(resolvedServerNames)

    for (const tool of input.extraTools || []) {
        toolMap[tool.name] = true
    }

    return {
        toolResolution,
        toolMap,
        capabilitySnapshot: await resolveCapabilitySnapshot(input),
    }
}
