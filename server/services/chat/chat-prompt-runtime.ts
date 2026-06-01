import type { ChatSendRequest } from '../../../shared/chat-contracts.js'
import type { ModelCapabilities } from '../../../shared/model-types.js'
import type { RuntimeToolResolution } from '../../../shared/opencode-contracts.js'
import { normalizeProjectionDirtyPatch } from '../../../shared/projection-dirty.js'
import { assertRuntimeModelPromptable } from '../../lib/model-catalog.js'
import { StudioValidationError } from '../../lib/opencode-errors.js'
import { describeUnavailableRuntimeTools } from '../../lib/runtime-tools.js'
import { buildProjectionDirtyPatch } from '../opencode-projection/projection-dirty-patch.js'
import { buildProjectionExecutionPlan } from '../opencode-projection/projection-execution-plan.js'
import {
    ensureAgentProjection,
    type EnsuredAgentProjection,
} from '../opencode-projection/workspace-agent-projection-service.js'
import { publishProjectionConsumed } from '../runtime/execution-events.js'
import {
    prepareRuntimeForExecution,
    throwIfRuntimePreparationBlocked,
} from '../runtime/preparation-service.js'
import { prepareAssistantChatRequest } from '../studio-assistant/assistant-chat-service.js'
import { buildTeamToolMap } from '../team-runtime/team-tool-files.js'

type PromptModel = NonNullable<ChatSendRequest['agent']['model']>

export type PreparedChatPromptRuntime = {
    isAssistant: boolean
    model: PromptModel
    agentName?: string
    systemPrompt: string
    promptTools?: Record<string, boolean>
    capabilitySnapshot: ModelCapabilities | null
}

function isAssistantOwnerId(ownerId: string) {
    return ownerId === 'studio-assistant' || ownerId.startsWith('studio-assistant--')
}

function assertAvailableRuntimeTools(toolResolution: RuntimeToolResolution) {
    const unavailableSummary = describeUnavailableRuntimeTools(toolResolution)
    if (
        toolResolution.selectedMcpServers.length > 0
        && toolResolution.resolvedTools.length === 0
        && unavailableSummary
    ) {
        throw new StudioValidationError(
            `Selected MCP servers are unavailable: ${unavailableSummary}.`,
            'fix_input',
        )
    }
}

async function prepareProjectedAgentRuntime(input: {
    workingDir: string
    request: ChatSendRequest
    projectionAgentId: string
    projectionAgentName: string
}): Promise<{
    agentName?: string
    promptTools?: Record<string, boolean>
    capabilitySnapshot: ModelCapabilities | null
    toolResolution: RuntimeToolResolution
}> {
    const {
        workingDir,
        request,
        projectionAgentId,
        projectionAgentName,
    } = input
    const agent = request.agent
    const model = agent.model!
    const projectionDirtyPatch = buildProjectionDirtyPatch({
        agentId: projectionAgentId || null,
        skillRefs: [...(agent.skillRefs || []), ...(agent.extraSkillRefs || [])],
    })
    const requestedProjectionScope = normalizeProjectionDirtyPatch(request.projectionScope)
    const projectionPlan = await buildProjectionExecutionPlan({
        workingDir,
        target: {
            agentId: projectionAgentId,
            agentName: projectionAgentName,
            agentBody: agent.agentBody || null,
            skillRefs: [...(agent.skillRefs || []), ...(agent.extraSkillRefs || [])],
            model,
            modelVariant: agent.modelVariant || null,
            mcpServerNames: agent.mcpServerNames || [],
            workingDir,
        },
        targetPatch: projectionDirtyPatch,
        requestedPatch: requestedProjectionScope,
    })
    const prepared = await prepareRuntimeForExecution(workingDir, async () => {
        let primaryProjection: EnsuredAgentProjection | null = null
        let changed = false

        for (const projectionInput of projectionPlan.inputs) {
            const nextProjection = await ensureAgentProjection(projectionInput)
            if (projectionInput.agentId === projectionAgentId) {
                primaryProjection = nextProjection
            }
            changed = changed || nextProjection.changed
        }

        if (!primaryProjection) {
            throw new Error(`Missing projection for agent ${projectionAgentId}`)
        }

        return {
            ...primaryProjection,
            changed,
        }
    })
    throwIfRuntimePreparationBlocked(prepared)

    const ensured = prepared.payload
    if (prepared.requiresDispose) {
        publishProjectionConsumed(workingDir, projectionPlan.consumedPatch)
    }

    const posture = request.teamId ? 'build' : (agent.planMode ? 'plan' : 'build')
    return {
        agentName: ensured.compiled.agentNames[posture],
        promptTools: request.teamId
            ? { ...ensured.toolMap, ...buildTeamToolMap() }
            : ensured.toolMap,
        capabilitySnapshot: ensured.capabilitySnapshot,
        toolResolution: ensured.toolResolution,
    }
}

export async function prepareChatPromptRuntime(input: {
    workingDir: string
    request: ChatSendRequest
    rawAgentId: string
    projectionAgentId: string
    projectionAgentName: string
}): Promise<PreparedChatPromptRuntime> {
    const {
        workingDir,
        request,
        rawAgentId,
        projectionAgentId,
        projectionAgentName,
    } = input
    const agent = request.agent
    if (!agent?.model) {
        throw new StudioValidationError(
            'Select a model for this agent before sending prompts.',
            'select_model',
        )
    }

    await assertRuntimeModelPromptable(workingDir, agent.model)

    if (isAssistantOwnerId(rawAgentId)) {
        const prepared = await prepareAssistantChatRequest(workingDir, {
            message: request.message,
            model: agent.model,
            assistantContext: request.assistantContext || null,
        })
        return {
            isAssistant: true,
            model: agent.model,
            agentName: prepared.assistantAgentName,
            systemPrompt: prepared.systemPrompt,
            promptTools: prepared.promptTools,
            capabilitySnapshot: prepared.capabilitySnapshot,
        }
    }

    const prepared = await prepareProjectedAgentRuntime({
        workingDir,
        request,
        projectionAgentId,
        projectionAgentName,
    })
    assertAvailableRuntimeTools(prepared.toolResolution)

    return {
        isAssistant: false,
        model: agent.model,
        agentName: prepared.agentName,
        systemPrompt: '',
        promptTools: prepared.promptTools,
        capabilitySnapshot: prepared.capabilitySnapshot,
    }
}
