import type { CompilePromptRequest, PromptPreview } from '../../../shared/chat-contracts.js'
import { compileProjectionPreview } from '../opencode-projection/preview-service.js'

export async function compileStudioPromptPreview(
    workingDir: string,
    request: CompilePromptRequest,
): Promise<PromptPreview> {
    return compileProjectionPreview(workingDir, request)
}
