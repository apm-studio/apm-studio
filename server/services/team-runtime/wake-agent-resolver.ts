/**
 * wake-agent-resolver.ts — Resolve agent config for wake cascade
 *
 * When the wake cascade auto-wakes a participant, it needs the agent's
 * model, Agent Body, Skills, and MCP configuration to properly project into OpenCode.
 * This module reads workspace.json to find the matching agent node.
 */

import type { TeamDefinition } from '../../../shared/team-types.js'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts.js'
import type { WorkspaceAgentSnapshot } from '../../../shared/workspace-contracts.js'
import { listWorkspaceAgentsForDir } from '../workspace/service.js'

export interface ResolvedAgentConfig {
    agentId: string
    agentName: string
    model: { provider: string; modelId: string } | null
    modelVariant: string | null
    skillRefs: SharedPrimitiveRef[]
    mcpServerNames: string[]
    runtimeAgentId: string | null
    planMode: boolean
}

/**
 * Resolve the agent config for a participant in a Team.
 * Reads the saved workspace snapshot to find the agent matching the
 * participant's agentRef (draft id or registry URN).
 *
 * Returns null if:
 * - the workspace snapshot is not available
 * - participant not in teamDefinition
 * - no matching agent in workspace
 */
export async function resolveAgentForWake(
    workingDir: string,
    teamDefinition: TeamDefinition,
    participantKey: string,
): Promise<ResolvedAgentConfig | null> {
    const binding = teamDefinition.participants[participantKey]
    if (!binding) return null

    const ref = binding.agentRef

    // Read workspace.json to find agents
    const agents = await listWorkspaceAgentsForDir(workingDir)
    if (agents.length === 0) {
        console.warn(`[wake-resolver] Cannot read agents for workspace ${workingDir}`)
        return null
    }

    // Match agent by ref
    const agent = matchAgent(agents, ref)
    if (!agent) {
        console.warn(
            `[wake-resolver] No matching agent for participant "${participantKey}" ref=${JSON.stringify(ref)}`,
        )
        return null
    }

    return {
        agentId: agent.id,
        agentName: agent.name,
        model: agent.model,
        modelVariant: agent.modelVariant ?? null,
        skillRefs: agent.skillRefs || [],
        mcpServerNames: agent.mcpServerNames || [],
        runtimeAgentId: agent.runtimeAgentId ?? null,
        planMode: agent.planMode ?? false,
    }
}

function matchAgent(
    agents: WorkspaceAgentSnapshot[],
    ref: SharedPrimitiveRef,
): WorkspaceAgentSnapshot | null {
    if (ref.kind === 'draft') {
        return (
            agents.find((p) => p.id === ref.draftId) ||
            agents.find((p) => p.meta?.derivedFrom === `draft:${ref.draftId}`) ||
            null
        )
    }

    if (ref.kind === 'registry') {
        return (
            agents.find((p) => p.meta?.derivedFrom === ref.urn) ||
            null
        )
    }

    return null
}
