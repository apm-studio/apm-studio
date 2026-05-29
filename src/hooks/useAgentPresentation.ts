import type { DraftPrimitive, PrimitiveCard } from '../lib/primitive-types'
import type { WorkspaceAgentNode } from '../../shared/workspace-contracts'
import { useMemo } from 'react'
import {
    buildPrimitiveCardMap,
    buildMcpServerMap,
    resolveAgentPresentation,
    resolveAgentRuntimeConfig,
} from '../lib/agents'
import { useRuntimeTools } from './queries/opencode'

import type { McpServerSummary } from '../../shared/opencode-contracts'

const EMPTY_PRESENTATION = {
    instructionPrimitive: null,
    skillPrimitives: [] as ReturnType<typeof resolveAgentPresentation>['skillPrimitives'],
    mcpServers: [] as ReturnType<typeof resolveAgentPresentation>['mcpServers'],
    mcpPlaceholders: [] as string[],
    mappedMcpPlaceholders: [] as ReturnType<typeof resolveAgentPresentation>['mappedMcpPlaceholders'],
    declaredMcpServerNames: [] as string[],
}

/**
 * Resolves a agent's presentation (attached primitives, MCP servers)
 * and runtime config in one hook. Replaces duplicated useMemo blocks
 * in AgentFrame and TeamAreaFrame.
 */
export function useAgentPresentation(
    agent: WorkspaceAgentNode | null,
    primitives: PrimitiveCard[],
    mcpServers: McpServerSummary[],
    drafts: Record<string, DraftPrimitive>,
    opts?: { enableTools?: boolean },
) {
    const presentation = useMemo(() => (
        agent
            ? resolveAgentPresentation(
                agent,
                buildPrimitiveCardMap(primitives),
                buildMcpServerMap(mcpServers),
                drafts,
            )
            : EMPTY_PRESENTATION
    ), [primitives, drafts, mcpServers, agent])

    const runtimeConfig = useMemo(
        () => agent ? resolveAgentRuntimeConfig(agent) : null,
        [agent],
    )

    const { data: runtimeTools } = useRuntimeTools(
        runtimeConfig?.model || null,
        runtimeConfig?.mcpServerNames || [],
        (opts?.enableTools ?? true) && !!runtimeConfig,
    )

    return { presentation, runtimeConfig, runtimeTools }
}
