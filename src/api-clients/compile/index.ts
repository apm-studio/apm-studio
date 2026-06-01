import type { CompilePromptRequest, PromptPreview, SharedPrimitiveRef } from '../../../shared/chat-contracts'
import type { ModelSelection } from '../../../shared/model-types'
import { postJSON } from '../../api-core'

export const compileApi = {
    compile: (
        agentId: string | null,
        agentName: string | null,
        skillRefs: SharedPrimitiveRef[],
        model: ModelSelection,
        modelVariant: string | null,
        runtimeAgentId: string | null,
        mcpServerNames: string[],
        planMode = false,
        requestTargets?: Array<{
            agentId: string
            agentName: string
            description?: string
        }>,
    ) =>
        postJSON<PromptPreview>('/api/compile', {
            agentId: agentId || undefined,
            agentName: agentName || undefined,
            skillRefs,
            model,
            modelVariant,
            runtimeAgentId,
            mcpServerNames,
            planMode,
            requestTargets,
        } satisfies CompilePromptRequest),
}
