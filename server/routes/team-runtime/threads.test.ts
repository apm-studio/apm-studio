import { describe, expect, it } from 'vitest'
import type { TeamRuntimeErrorResponse } from '../../../shared/team-types.js'

describe('Team runtime thread routes', () => {
    it('rejects invalid Team definitions through the shared validator', async () => {
        const { default: teamRuntimeThreads } = await import('./threads.js')

        const res = await teamRuntimeThreads.request('http://studio.local/api/team/team-1/runtime-definition?workingDir=%2Ftmp%2Fworkspace', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                teamDefinition: {
                    id: 'team-1',
                    name: 'Team',
                    participants: {},
                    relations: [],
                },
            }),
        })
        const body = await res.json() as TeamRuntimeErrorResponse

        expect(res.status).toBe(400)
        expect(body).toEqual({
            ok: false,
            status: 400,
            error: 'Team must have at least one Studio Agent',
        })
    })

    it('requires Team definitions when patching runtime definitions', async () => {
        const { default: teamRuntimeThreads } = await import('./threads.js')

        const res = await teamRuntimeThreads.request('http://studio.local/api/team/team-1/runtime-definition?workingDir=%2Ftmp%2Fworkspace', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
        })
        const body = await res.json() as TeamRuntimeErrorResponse

        expect(res.status).toBe(400)
        expect(body.error).toBe('teamDefinition is required')
    })
})
