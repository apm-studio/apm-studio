import { describe, expect, it } from 'vitest'
import type { TeamDefinition, MailboxEvent } from '../../shared/team-types.js'
import { Mailbox } from '../../server/services/team-runtime/mailbox.js'
import { routeEvent } from '../../server/services/team-runtime/event-router.js'

const teamDefinition: TeamDefinition = {
    id: 'team-routing',
    name: 'Routing Team',
    participants: {
        CEO: {
            agentRef: { kind: 'draft', draftId: 'ceo' },
            displayName: 'Chief Exec',
        },
        Merchandiser: {
            agentRef: { kind: 'draft', draftId: 'md' },
            displayName: 'Merchandiser',
            subscriptions: {
                messagesFrom: ['CEO'],
            },
        },
        GrowthMarketer: {
            agentRef: { kind: 'draft', draftId: 'gm' },
            displayName: 'Growth Marketer',
            subscriptions: {
                messagesFrom: ['CEO'],
            },
        },
    },
    relations: [
        {
            id: 'rel-ceo-md',
            between: ['CEO', 'Merchandiser'],
            direction: 'both',
            name: 'CEO-MD',
            description: 'CEO works with merchandiser.',
        },
        {
            id: 'rel-ceo-gm',
            between: ['CEO', 'GrowthMarketer'],
            direction: 'both',
            name: 'CEO-GM',
            description: 'CEO works with growth marketer.',
        },
    ],
}

describe('team event routing', () => {
    it('wakes only the direct recipient for direct messages', () => {
        const event: MailboxEvent = {
            id: 'evt-1',
            type: 'message.sent',
            sourceType: 'agent',
            source: 'CEO',
            timestamp: Date.now(),
            payload: {
                from: 'CEO',
                to: 'GrowthMarketer',
                threadId: 'thread-1',
            },
        }

        const targets = routeEvent(event, teamDefinition, new Mailbox(), [])

        expect(targets.map((target) => target.participantKey)).toEqual(['GrowthMarketer'])
    })

    it('still allows subscriptions to filter direct messages received by the participant', () => {
        const event: MailboxEvent = {
            id: 'evt-2',
            type: 'message.sent',
            sourceType: 'agent',
            source: 'CEO',
            timestamp: Date.now(),
            payload: {
                from: 'CEO',
                to: 'Merchandiser',
                threadId: 'thread-1',
            },
        }

        const targets = routeEvent(event, teamDefinition, new Mailbox(), [])

        expect(targets.map((target) => target.participantKey)).toEqual(['Merchandiser'])
    })

    it('keeps the wait condition wake when the same event also matches a subscription', () => {
        const mailbox = new Mailbox()
        mailbox.addWakeCondition({
            target: 'self',
            createdBy: 'GrowthMarketer',
            onSatisfiedMessage: 'Summarize the new ask and reply.',
            condition: {
                type: 'message_received',
                from: 'Chief Exec',
            },
        })

        const event: MailboxEvent = {
            id: 'evt-3',
            type: 'message.sent',
            sourceType: 'agent',
            source: 'CEO',
            timestamp: Date.now(),
            payload: {
                from: 'CEO',
                to: 'GrowthMarketer',
                threadId: 'thread-1',
            },
        }

        const targets = routeEvent(event, teamDefinition, mailbox, [event])

        expect(targets).toHaveLength(1)
        expect(targets[0]).toEqual(expect.objectContaining({
            participantKey: 'GrowthMarketer',
            reason: 'wake-condition',
            wakeCondition: expect.objectContaining({
                onSatisfiedMessage: 'Summarize the new ask and reply.',
                status: 'triggered',
            }),
        }))
    })

    it('suppresses intermediate fan-in message wakes until the combined wait condition is satisfied', () => {
        const mailbox = new Mailbox()
        mailbox.addWakeCondition({
            target: 'self',
            createdBy: 'GrowthMarketer',
            onSatisfiedMessage: 'Merge both updates and respond once.',
            condition: {
                type: 'all_of',
                conditions: [
                    { type: 'message_received', from: 'Chief Exec', tag: 'brief' },
                    { type: 'message_received', from: 'Chief Exec', tag: 'final' },
                ],
            },
        })

        const firstEvent: MailboxEvent = {
            id: 'evt-4',
            type: 'message.sent',
            sourceType: 'agent',
            source: 'CEO',
            timestamp: Date.now(),
            payload: {
                from: 'CEO',
                to: 'GrowthMarketer',
                tag: 'brief',
                threadId: 'thread-1',
            },
        }

        expect(routeEvent(firstEvent, teamDefinition, mailbox, [firstEvent])).toEqual([])

        const secondEvent: MailboxEvent = {
            id: 'evt-5',
            type: 'message.sent',
            sourceType: 'agent',
            source: 'CEO',
            timestamp: firstEvent.timestamp + 1,
            payload: {
                from: 'CEO',
                to: 'GrowthMarketer',
                tag: 'final',
                threadId: 'thread-1',
            },
        }

        const targets = routeEvent(secondEvent, teamDefinition, mailbox, [firstEvent, secondEvent])

        expect(targets).toHaveLength(1)
        expect(targets[0]).toEqual(expect.objectContaining({
            participantKey: 'GrowthMarketer',
            reason: 'wake-condition',
            wakeCondition: expect.objectContaining({
                onSatisfiedMessage: 'Merge both updates and respond once.',
                status: 'triggered',
            }),
        }))
    })
})
