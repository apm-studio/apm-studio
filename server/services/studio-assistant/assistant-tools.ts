import { ASSISTANT_MUTATION_TOOL_NAME } from '../../../shared/assistant-actions.js'
import { buildAssistantMutationToolContent } from './assistant-mutation-tool-content.js'

export const ASSISTANT_TOOL_NAMES = [ASSISTANT_MUTATION_TOOL_NAME] as const

export function buildAssistantToolMap(): Record<string, boolean> {
    return {
        [ASSISTANT_MUTATION_TOOL_NAME]: true,
    }
}

export function getStaticAssistantTools(): Array<{ name: string; content: string }> {
    return [{
        name: ASSISTANT_MUTATION_TOOL_NAME,
        content: buildAssistantMutationToolContent(),
    }]
}
