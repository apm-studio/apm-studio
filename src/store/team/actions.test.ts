import { describe, expect, it } from 'vitest'

import { addTeamRelationImpl } from './team-relation-actions'
import type { StudioState } from '../types'

describe('addTeamRelationImpl', () => {
    it('allows opposite one-way relations for the same participant pair', () => {
        let state: StudioState = {
            teams: [
                {
                    id: 'team-1',
                    participants: {
                        Coder: { agentRef: { kind: 'registry', urn: 'agent/@studio/coder' }, position: { x: 0, y: 0 } },
                        Reviewer: { agentRef: { kind: 'registry', urn: 'agent/@studio/reviewer' }, position: { x: 1, y: 0 } },
                    },
                    relations: [
                        {
                            id: 'rel-1',
                            between: ['Coder', 'Reviewer'],
                            direction: 'one-way',
                            name: 'request_review',
                            description: 'Coder asks for review',
                        },
                    ],
                },
            ],
            agents: [],
            recordStudioChange: () => 'none',
        } as unknown as StudioState

        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            const next = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...next } as StudioState
        }

        const relationId = addTeamRelationImpl(get, set, 'team-1', ['Reviewer', 'Coder'], 'one-way')

        expect(relationId).toBeTruthy()
        expect(state.teams[0].relations).toHaveLength(2)
        expect(state.teams[0].relations[1].between).toEqual(['Reviewer', 'Coder'])
    })

    it('blocks duplicate exact one-way relations', () => {
        let state: StudioState = {
            teams: [
                {
                    id: 'team-1',
                    participants: {
                        Coder: { agentRef: { kind: 'registry', urn: 'agent/@studio/coder' }, position: { x: 0, y: 0 } },
                        Reviewer: { agentRef: { kind: 'registry', urn: 'agent/@studio/reviewer' }, position: { x: 1, y: 0 } },
                    },
                    relations: [
                        {
                            id: 'rel-1',
                            between: ['Coder', 'Reviewer'],
                            direction: 'one-way',
                            name: 'request_review',
                            description: 'Coder asks for review',
                        },
                    ],
                },
            ],
            agents: [],
            recordStudioChange: () => 'none',
        } as unknown as StudioState

        const get = () => state
        const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            const next = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...next } as StudioState
        }

        const relationId = addTeamRelationImpl(get, set, 'team-1', ['Coder', 'Reviewer'], 'one-way')

        expect(relationId).toBe('rel-1')
        expect(state.teams[0].relations).toHaveLength(1)
    })
})
