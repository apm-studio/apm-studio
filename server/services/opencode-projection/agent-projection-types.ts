import type { SharedPrimitiveRef } from '../../../shared/chat-contracts.js'
import type { ModelSelection } from '../../../shared/model-types.js'

export interface AgentProjectionInput {
    agentId: string
    agentName: string
    instructionRef: SharedPrimitiveRef | null
    agentBody?: string | null
    skillRefs: SharedPrimitiveRef[]
    model: ModelSelection
    modelVariant?: string | null
    mcpServerNames: string[]
    workingDir: string
    requestTargets?: Array<{
        agentId: string
        agentName: string
        description?: string
    }>
    scope?: 'workspace' | 'team'
    teamId?: string
    extraTools?: Array<{
        name: string
        content: string
    }>
}

export type CodexProjectionAgentSnapshot = {
    id?: string
    name?: string
    model?: ModelSelection | null
    modelVariant?: string | null
    instructionRef?: SharedPrimitiveRef | null
    agentBody?: string | null
    skillRefs?: SharedPrimitiveRef[]
    mcpServerNames?: string[]
}
