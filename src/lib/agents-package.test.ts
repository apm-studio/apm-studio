import { describe, expect, it } from 'vitest'
import {
    buildTeamPrimitivePayload,
    normalizeAgentPrimitiveInput,
} from './agents'

describe('normalizeAgentPrimitiveInput', () => {
    it('preserves modelVariant from imported agent primitives', () => {
        const normalized = normalizeAgentPrimitiveInput({
            name: 'Imported Agent',
            urn: 'agent/@user/project/imported',
            skillUrns: ['skill/@user/repo/style'],
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcpConfig: {
                github: { command: 'placeholder' },
            },
        })

        expect(normalized.modelVariant).toBe('reasoning-high')
        expect(normalized.meta).toEqual({
            derivedFrom: 'agent/@user/project/imported',
            sourceBindingUrn: 'agent/@user/project/imported',
        })
    })
})

describe('buildTeamPrimitivePayload', () => {
    it('requires relation descriptions at the canonical package boundary', () => {
        expect(() => buildTeamPrimitivePayload({
            id: 'team-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                'participant-lead': {
                    agentRef: { kind: 'registry', urn: 'agent/@studio/main/lead' },
                    displayName: 'Lead',
                    position: { x: 0, y: 0 },
                },
                'participant-reviewer': {
                    agentRef: { kind: 'registry', urn: 'agent/@studio/main/reviewer' },
                    displayName: 'Reviewer',
                    position: { x: 100, y: 0 },
                },
            },
            relations: [
                {
                    id: 'rel-1',
                    between: ['participant-lead', 'participant-reviewer'],
                    direction: 'both',
                    name: 'Review Loop',
                    description: '',
                },
            ],
            createdAt: Date.now(),
        })).toThrow('requires a description')
    })

    it('exports canonical team primitives without schema metadata', () => {
        const payload = buildTeamPrimitivePayload({
            id: 'team-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                'participant-lead': {
                    agentRef: { kind: 'registry', urn: 'agent/@studio/main/lead' },
                    displayName: 'Lead',
                    position: { x: 0, y: 0 },
                },
            },
            relations: [],
            createdAt: Date.now(),
        })

        expect(payload).not.toHaveProperty('$schema')
        expect(payload).not.toHaveProperty('schema')
    })
})
