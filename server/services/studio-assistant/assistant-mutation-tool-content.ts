import { assistantMutationToolExecuteSource } from './assistant-mutation-tool-source-execute.js'
import { assistantMutationToolLintSource } from './assistant-mutation-tool-source-lint.js'
import { assistantMutationToolNormalizationSource } from './assistant-mutation-tool-source-normalization.js'
import { assistantMutationToolSchemaSource } from './assistant-mutation-tool-source-schema.js'

export function buildAssistantMutationToolContent() {
    return [
        ...assistantMutationToolNormalizationSource,
        ...assistantMutationToolLintSource,
        ...assistantMutationToolSchemaSource,
        ...assistantMutationToolExecuteSource,
    ].join('\n')
}
