import type { AgentProjectionInput } from './agent-projection-types.js'
import { getProjectedAgentName } from './agent-projection-identity.js'

export interface CompiledRequestRelations {
    taskAllowlist: string[]
    promptSection: string | null
}

type RequestTarget = NonNullable<AgentProjectionInput['requestTargets']>[number]

function compileMentionRelations(targets: Array<{
    agentName: string
    description?: string
}>): CompiledRequestRelations {
    if (targets.length === 0) {
        return { taskAllowlist: [], promptSection: null }
    }
    const lines = [
        '# Available Agents',
        '',
        'The following agents are available for @mention in this context.',
        'Use the `task` tool only when it is actually useful, and only with the allowed agent names below.',
        '',
    ]
    for (const target of targets) {
        const description = target.description ? ` - ${target.description}` : ''
        lines.push(`- **${target.agentName}**: use \`task\` with agent="${target.agentName}"${description}`)
    }
    return {
        taskAllowlist: targets.map((target) => target.agentName),
        promptSection: lines.join('\n'),
    }
}

function resolveRequestTarget(
    input: {
        workingDir: string
        scope?: 'workspace' | 'team'
        teamId?: string
    },
    target: RequestTarget,
) {
    return {
        agentName: getProjectedAgentName(
            input.workingDir,
            target.agentId,
            'build',
            input.scope,
            input.teamId,
        ),
        description: target.description || '',
    }
}

export function compileProjectionRequestRelations(
    input: Pick<AgentProjectionInput, 'workingDir' | 'requestTargets' | 'scope' | 'teamId'>,
): CompiledRequestRelations {
    const targets = (input.requestTargets || []).map((target) => resolveRequestTarget(input, target))
    return compileMentionRelations(targets)
}
