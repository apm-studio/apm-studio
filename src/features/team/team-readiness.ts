import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
/**
 * Team Readiness Evaluator
 *
 * Pure function that determines whether a workspace Team is runnable.
 * Used by all Team surfaces: inspector, frame header, sidebar, chat panel.
 */
import { hasModelConfig } from '../../lib/agents'
import { resolveAgentFromTeamBinding } from '../../lib/team-participants'
import { validateTeamDefinition } from '../../../shared/team-definition-validation'

export type TeamReadinessIssueSeverity = 'error' | 'warning'

export interface TeamReadinessIssueFocus {
    mode: 'team' | 'participant' | 'relation'
    participantKey?: string
    relationId?: string
}

export interface TeamReadinessIssue {
    code: string
    severity: TeamReadinessIssueSeverity
    message: string
    focus?: TeamReadinessIssueFocus
}

export interface TeamReadinessResult {
    runnable: boolean
    issues: TeamReadinessIssue[]
}

/**
 * Evaluate whether a Team is ready to create a thread and run.
 *
 * Produces a structured result so every surface can render the same
 * readiness state without duplicating validation logic.
 */
export function evaluateTeamReadiness(
    team: WorkspaceTeamSnapshot,
    agents: WorkspaceAgentNode[],
): TeamReadinessResult {
    const issues: TeamReadinessIssue[] = validateTeamDefinition(team).map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        focus: issue.focus,
    }))
    const participantKeys = Object.keys(team.participants)
    const participantLabel = (key: string) => team.participants[key]?.displayName?.trim() || key

    for (const key of participantKeys) {
        const binding = team.participants[key]

        // 4. Agent ref cannot resolve
        const agent = resolveAgentFromTeamBinding(agents, binding)
        if (!agent) {
            issues.push({
                code: 'unresolved-agent',
                severity: 'error',
                message: `Participant "${participantLabel(key)}" has no matching Studio Agent on the canvas`,
                focus: { mode: 'participant', participantKey: key },
            })
            continue // skip model check if agent not found
        }

        // 5. Resolved agent has no model config
        if (!hasModelConfig(agent.model)) {
            issues.push({
                code: 'no-model-config',
                severity: 'error',
                message: `Participant "${participantLabel(key)}" has no Studio Agent model configured`,
                focus: { mode: 'participant', participantKey: key },
            })
        }
    }

    if (participantKeys.length > 1) {
        const connectedKeys = new Set<string>()
        for (const relation of team.relations) {
            connectedKeys.add(relation.between[0])
            connectedKeys.add(relation.between[1])
        }
        for (const key of participantKeys) {
            if (!connectedKeys.has(key)) {
                issues.push({
                    code: 'disconnected-participant',
                    severity: 'warning',
                    message: `Participant "${participantLabel(key)}" is not connected by any relation`,
                    focus: { mode: 'participant', participantKey: key },
                })
            }
        }
    }

    const hasErrors = issues.some((issue) => issue.severity === 'error')

    return {
        runnable: !hasErrors,
        issues,
    }
}
