/**
 * team-tool-projection.ts — Team tool projection for participant sessions
 *
 * Builds stable collaboration system prompt content for participant sessions.
 */

import type { TeamDefinition } from '../../../shared/team-types.js'
import { buildTeamContext } from './team-context-builder.js'

// ── Types ───────────────────────────────────────────────

export interface TeamToolProjection {
    /** Stable collaboration context to inject into the turn-scoped system prompt */
    systemPrompt: string
}

// ── Projection ──────────────────────────────────────────

/**
 * Generate the turn-scoped Team collaboration prompt for a participant.
 */
export function projectTeamTools(
    participantKey: string,
    teamDefinition: TeamDefinition,
    threadId: string,
    workingDir: string,
): TeamToolProjection {
    void threadId
    void workingDir

    const systemPrompt = buildTeamContext(teamDefinition, participantKey)

    return {
        systemPrompt,
    }
}
