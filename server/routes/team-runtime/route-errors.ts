import type { Context } from 'hono'
import type { TeamRuntimeErrorResponse } from '../../../shared/team-types.js'

export function jsonTeamRuntimeError(
    c: Context,
    response: TeamRuntimeErrorResponse,
) {
    return c.json(response, { status: response.status })
}
