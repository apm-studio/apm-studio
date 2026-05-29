/**
 * team-session-policy.ts — Single source of truth for Team session execution rules.
 *
 * Team is a direct-only runtime.
 * All Team participant sessions — manual sends and auto-wake — use the same policy.
 */

/** Team sessions use 'team' as their session owner kind. */
export const TEAM_OWNER_KIND = 'team' as const

/** Team scope for projection — always 'team', never 'workspace'. */
export const TEAM_SCOPE = 'team' as const

/**
 * Resolve the canonical execution policy for a Team session.
 * Both manual Team chat and wake cascade must use this function
 * so the rules are defined in exactly one place.
 */
export function resolveTeamSessionPolicy(teamId?: string) {
    void teamId
    return {
        ownerKind: TEAM_OWNER_KIND,
        scope: TEAM_SCOPE,
        agentPosture: 'build',
    } as const
}
