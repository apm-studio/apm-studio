import { describe, expect, it } from 'vitest'
import type { TeamDefinition } from './team-types.js'
import {
    firstTeamDefinitionValidationError,
    validateTeamDefinition,
} from './team-definition-validation.js'

function teamDefinition(overrides: Partial<TeamDefinition> = {}): TeamDefinition {
    return {
        id: 'team-1',
        name: 'Team',
        participants: {
            lead: { agentRef: { kind: 'draft', draftId: 'agent-lead' } },
            analyst: { agentRef: { kind: 'draft', draftId: 'agent-analyst' } },
        },
        relations: [{
            id: 'rel-1',
            between: ['lead', 'analyst'],
            direction: 'both',
            name: 'handoff',
            description: 'Exchange work.',
        }],
        ...overrides,
    }
}

describe('Team definition validation', () => {
    it('accepts absent optional team definitions and valid teams', () => {
        expect(validateTeamDefinition(undefined)).toEqual([])
        expect(validateTeamDefinition(teamDefinition())).toEqual([])
    })

    it('rejects teams without participants', () => {
        const issues = validateTeamDefinition(teamDefinition({ participants: {}, relations: [] }))

        expect(issues).toEqual([
            expect.objectContaining({
                code: 'no-participants',
                message: 'Team must have at least one agent',
                focus: { mode: 'team' },
            }),
        ])
    })

    it('validates participant agent refs and subscription sources', () => {
        const issues = validateTeamDefinition(teamDefinition({
            participants: {
                lead: {
                    agentRef: { kind: 'draft', draftId: '' },
                    subscriptions: { messagesFrom: ['ghost'] },
                },
                analyst: { agentRef: { kind: 'registry', urn: 'agent://analyst' } },
            },
        }))

        expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
            'missing-draft-agent-ref',
            'invalid-subscription-source',
        ]))
        expect(firstTeamDefinitionValidationError(teamDefinition({
            participants: {
                lead: { agentRef: { kind: 'draft', draftId: '' } },
            },
            relations: [],
        }))).toBe('Participant "lead": draft agentRef must include draftId')
    })

    it('validates relation endpoints and required relation fields', () => {
        const issues = validateTeamDefinition(teamDefinition({
            relations: [{
                id: 'bad',
                between: ['lead', 'ghost'],
                direction: 'one-way',
                name: '',
                description: '',
            }],
        }))

        expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
            'unknown-relation-endpoint',
            'empty-relation-name',
            'empty-relation-description',
        ]))
    })
})
