import { describe, expect, it } from 'vitest'
import type { TeamDefinition } from '../../../shared/team-types.js'
import { resolveParticipantRecipient } from './tools.js'

const teamDefinition: TeamDefinition = {
    id: 'team-review',
    name: 'Review Team',
    participants: {
        'participant-lead': {
            agentRef: { kind: 'draft', draftId: 'lead-agent' },
            displayName: 'participant_1',
        },
        'participant-data': {
            agentRef: { kind: 'draft', draftId: 'data-agent' },
            displayName: 'participant_2',
        },
        'participant-bull': {
            agentRef: { kind: 'draft', draftId: 'bull-agent' },
            displayName: 'participant_3',
        },
    },
    relations: [
        {
            id: 'rel-1',
            between: ['participant-lead', 'participant-data'],
            direction: 'one-way',
            name: 'participant_1_to_participant_2',
            description: 'Request evidence packs.',
        },
        {
            id: 'rel-2',
            between: ['participant-lead', 'participant-bull'],
            direction: 'one-way',
            name: 'participant_1_to_participant_3',
            description: 'Request bull thesis.',
        },
    ],
}

describe('resolveParticipantRecipient', () => {
    it('resolves display names and participant keys directly', () => {
        expect(resolveParticipantRecipient(teamDefinition, 'participant-lead', 'participant_2')).toBe('participant-data')
        expect(resolveParticipantRecipient(teamDefinition, 'participant-lead', 'participant-bull')).toBe('participant-bull')
    })

    it('does not resolve relation names or unknown recipients', () => {
        expect(resolveParticipantRecipient(
            teamDefinition,
            'participant-lead',
            'participant_1_to_participant_2',
        )).toBeNull()
        expect(resolveParticipantRecipient(
            teamDefinition,
            'participant-data',
            'participant_1_to_participant_3',
        )).toBeNull()
        expect(resolveParticipantRecipient(teamDefinition, 'participant-lead', 'UnknownTeammate')).toBeNull()
    })

    it('does not resolve recipients that are only connected by an incoming one-way relation', () => {
        expect(resolveParticipantRecipient(teamDefinition, 'participant-data', 'participant_1')).toBeNull()
        expect(resolveParticipantRecipient(teamDefinition, 'participant-data', 'participant-lead')).toBeNull()
        expect(resolveParticipantRecipient(
            teamDefinition,
            'participant-data',
            'participant_1_to_participant_2',
        )).toBeNull()
    })
})
