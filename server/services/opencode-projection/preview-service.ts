import type { CompilePromptRequest, PromptPreview } from '../../../shared/chat-contracts.js'
import { ensureAgentProjection } from './workspace-agent-projection-service.js'

export function getCompileRequestTargets(request: CompilePromptRequest) {
    return request.requestTargets || []
}

export async function compileProjectionPreview(
    cwd: string,
    request: CompilePromptRequest,
): Promise<PromptPreview> {
    const posture = request.planMode ? 'plan' : 'build'
    const ensured = await ensureAgentProjection({
        agentId: request.agentId || 'preview',
        agentName: request.agentName || 'Preview',
        agentBody: request.agentBody || null,
        skillRefs: request.skillRefs,
        model: request.model,
        modelVariant: request.modelVariant || null,
        mcpServerNames: request.mcpServerNames || [],
        workingDir: cwd,
        requestTargets: getCompileRequestTargets(request),
    })
    const system = ensured.compiled.agentContents[posture] || ''
    const agent = ensured.compiled.agentNames[posture] || request.agentName || 'Preview'

    return {
        system,
        agent,
        skillCatalog: ensured.compiled.skills.map((skill) => ({
            urn: skill.logicalName,
            description: skill.description,
            loadMode: 'tool' as const,
        })),
        capabilitySnapshot: ensured.capabilitySnapshot,
        toolResolution: ensured.toolResolution,
    }
}
