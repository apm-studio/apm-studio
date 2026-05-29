import type {
    TeamRuntimeErrorResponse,
    TeamRuntimeErrorStatus,
} from '../../../shared/team-types.js'

export function teamRuntimeError(
    error: string | undefined,
    status: TeamRuntimeErrorStatus,
): TeamRuntimeErrorResponse {
    return { ok: false, status, error: error || 'Team runtime request failed.' }
}
