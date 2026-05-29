import { Hono } from 'hono'
import type { CompilePromptRequest, PromptPreview } from '../../../shared/chat-contracts.js'
import {
    StudioValidationError,
    jsonOpencodeError,
} from '../../lib/opencode-errors.js'
import { compileStudioPromptPreview } from '../../services/compile/service.js'
import { requestWorkingDir } from '../route-errors.js'

const compile = new Hono()

compile.post('/api/compile', async (c) => {
    const body = await c.req.json<CompilePromptRequest>()
    const { model } = body

    if (!model) {
        return jsonOpencodeError(
            c,
            new StudioValidationError(
                'Select a model for this agent before compiling prompts.',
                'select_model',
            ),
        )
    }

    try {
        const response = await compileStudioPromptPreview(requestWorkingDir(c), body)
        return c.json(response satisfies PromptPreview)
    } catch (err) {
        return jsonOpencodeError(c, err, { model })
    }
})

export default compile
