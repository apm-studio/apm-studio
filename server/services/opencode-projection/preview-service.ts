import type { CompilePromptRequest } from '../../../shared/chat-contracts.js'
import { ensurePerformerProjection } from './stage-projection-service.js'

export function getCompileRequestTargets(request: CompilePromptRequest) {
    return request.requestTargets || []
}

export async function compileProjectionPreview(
    cwd: string,
    request: CompilePromptRequest,
) {
    const posture = request.planMode ? 'plan' : 'build'
    const ensured = await ensurePerformerProjection({
        performerId: request.performerId || 'preview',
        performerName: request.performerName || 'Preview',
        talRef: request.talRef,
        inlineInstruction: request.inlineInstruction || null,
        danceRefs: request.danceRefs,
        model: request.model,
        modelVariant: request.modelVariant || null,
        mcpServerNames: request.mcpServerNames || [],
        workingDir: cwd,
        requestTargets: getCompileRequestTargets(request),
    })

    return {
        system: ensured.compiled.agentContents[posture],
        agent: ensured.compiled.agentNames[posture],
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
                detail: request.inlineInstruction ? 'The Agent Body is inserted into the projected agent file.' : 'No Agent Body is set for this agent.',
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
        danceCatalog: ensured.compiled.skills.map((skill) => ({
            urn: skill.logicalName,
            description: skill.description,
            loadMode: 'tool' as const,
        })),
        capabilitySnapshot: ensured.capabilitySnapshot,
        toolResolution: ensured.toolResolution,
    }
}
