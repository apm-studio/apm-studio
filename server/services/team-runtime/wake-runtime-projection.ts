import type { TeamDefinition } from '../../../shared/team-types.js'
import { serverDebug } from '../../lib/server-logger.js'
import { assertRuntimeModelPromptable } from '../../lib/model-catalog.js'
import { ensureAgentProjection } from '../opencode-projection/workspace-agent-projection-service.js'
import { buildProjectionDirtyPatch } from '../opencode-projection/projection-dirty-patch.js'
import { prepareRuntimeForExecution } from '../runtime/preparation-service.js'
import { publishProjectionConsumed } from '../runtime/execution-events.js'
import {
    buildTeamToolMap,
    ensureTeamToolFiles,
} from './team-tool-files.js'
import { projectTeamTools } from './team-tool-projection.js'
import type { ResolvedAgentConfig } from './wake-agent-resolver.js'
import type { ThreadManager } from './thread-manager.js'

export type WakeRuntimeProjection =
    | {
        ok: true
        teamSystemPrompt: string
        agentName?: string
        modelOverride?: { providerId: string; modelId: string }
        projectedTools: Record<string, boolean>
    }
    | { ok: false; reason: 'blocked' }

export async function prepareWakeRuntimeProjection(params: {
    participantKey: string
    teamDefinition: TeamDefinition
    threadId: string
    executionDir: string
    threadManager: ThreadManager
    agentConfig: ResolvedAgentConfig | null
}): Promise<WakeRuntimeProjection> {
    const {
        participantKey,
        teamDefinition,
        threadId,
        executionDir,
        threadManager,
        agentConfig,
    } = params

    const teamProjection = projectTeamTools(
        participantKey,
        teamDefinition,
        threadId,
        threadManager.workingDir,
    )
    const teamSystemPrompt = teamProjection.systemPrompt

    if (!agentConfig?.model) {
        serverDebug('wake-cascade', `No model config for "${participantKey}", using generic Team tools only`)
        await ensureTeamToolFiles(executionDir, threadManager.workingDir)
        return {
            ok: true,
            teamSystemPrompt,
            projectedTools: buildTeamToolMap(),
        }
    }

    await assertRuntimeModelPromptable(threadManager.workingDir, agentConfig.model)

    try {
        const prepared = await prepareRuntimeForExecution(threadManager.workingDir, () => ensureAgentProjection({
            agentId: agentConfig.agentId,
            agentName: agentConfig.agentName,
            instructionRef: agentConfig.instructionRef,
            skillRefs: agentConfig.skillRefs,
            model: agentConfig.model,
            modelVariant: agentConfig.modelVariant,
            mcpServerNames: agentConfig.mcpServerNames,
            workingDir: threadManager.workingDir,
        }))
        if (prepared.blocked) {
            console.warn(`[wake-cascade] Projection update blocked for "${participantKey}" while another working-dir session is running`)
            return { ok: false, reason: 'blocked' }
        }

        const ensured = prepared.payload
        if (prepared.requiresDispose) {
            publishProjectionConsumed(threadManager.workingDir, buildProjectionDirtyPatch({
                agentId: agentConfig.agentId,
                instructionRef: agentConfig.instructionRef,
                skillRefs: agentConfig.skillRefs,
            }))
        }

        const buildAgent = ensured.compiled.agentNames.build
        await ensureTeamToolFiles(executionDir, threadManager.workingDir)
        serverDebug('wake-cascade', `Agent projection done for "${participantKey}" model=${agentConfig.model.modelId}`)
        return {
            ok: true,
            teamSystemPrompt,
            ...(buildAgent ? { agentName: buildAgent } : {}),
            projectedTools: {
                ...ensured.toolMap,
                ...buildTeamToolMap(),
            },
            modelOverride: {
                providerId: agentConfig.model.provider,
                modelId: agentConfig.model.modelId,
            },
        }
    } catch (error) {
        console.warn(`[wake-cascade] Agent projection failed for "${participantKey}", falling back to generic tools:`, error)
        await ensureTeamToolFiles(executionDir, threadManager.workingDir)
        return {
            ok: true,
            teamSystemPrompt,
            projectedTools: buildTeamToolMap(),
        }
    }
}
