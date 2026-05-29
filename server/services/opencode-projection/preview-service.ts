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
        instructionRef: request.instructionRef,
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
        instructionStack: [
            {
                label: 'OpenCode config',
                detail: 'Global and project instructions are loaded by OpenCode before Studio projected agents when configured.',
            },
            {
                label: 'Projected agent frontmatter',
                detail: 'Studio sets model, variant, tool policy, skill allowlist, and task allowlist in the generated agent file.',
            },
            {
                label: 'Agent Body',
                detail: request.agentBody ? 'The Agent Body is inserted into the projected agent file.' : 'No Agent Body is set for this agent.',
            },
            ...(getCompileRequestTargets(request).length > 0 ? [{
                label: 'Team relation context',
                detail: 'Thread participant relation context is appended for Team-scoped execution.',
            }] : []),
            ...(ensured.compiled.skills.length > 0 ? [{
                label: 'Skills',
                detail: `${ensured.compiled.skills.length} projected SKILL.md file${ensured.compiled.skills.length === 1 ? '' : 's'} are available through the OpenCode skill tool.`,
            }] : []),
        ],
        skillCatalog: ensured.compiled.skills.map((skill) => ({
            urn: skill.logicalName,
            description: skill.description,
            loadMode: 'tool' as const,
        })),
        capabilitySnapshot: ensured.capabilitySnapshot,
        toolResolution: ensured.toolResolution,
    }
}
