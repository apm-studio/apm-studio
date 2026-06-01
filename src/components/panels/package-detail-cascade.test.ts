import { describe, expect, it } from 'vitest'
import type { PackagePrimitive } from './package-panel-types'
import {
    buildCascadeStubFromUrn,
    getTeamCascadeParticipants,
    getTeamCascadeRelations,
    getTeamRules,
    getAgentCascadeReferences,
    summarizeMarkdown,
} from './package-detail-cascade'

describe('buildCascadeStubFromUrn', () => {
    it('builds a fetchable stub for package primitives', () => {
        expect(buildCascadeStubFromUrn('agent/@user/agent-presets/reviewer', 'workspace')).toMatchObject({
            kind: 'agent',
            author: '@user',
            name: 'reviewer',
            source: 'workspace',
        })
    })

    it('returns null when source cannot be resolved', () => {
        expect(buildCascadeStubFromUrn('instruction/@user/checklist', 'draft')).toBeNull()
    })
})

describe('summarizeMarkdown', () => {
    it('strips common markdown formatting', () => {
        expect(summarizeMarkdown('# Title\n- item with `code` and [link](https://example.com)'))
            .toBe('Title item with and link')
    })
})

describe('getAgentCascadeReferences', () => {
    it('extracts skill references from agent primitives', () => {
        const agent = {
            kind: 'agent',
            name: 'reviewer',
            author: '@user',
            source: 'workspace',
            urn: 'agent/@user/agent-presets/reviewer',
            skillUrns: ['skill/@user/agent-presets/review-flow'],
        } as PackagePrimitive

        expect(getAgentCascadeReferences(agent)).toEqual([
            expect.objectContaining({ kind: 'skill', label: 'review-flow' }),
        ])
    })
})

describe('team cascade helpers', () => {
    const team = {
        kind: 'team',
        name: 'qa-loop',
        author: '@user',
        source: 'workspace',
        teamRules: ['Stay concise'],
        participants: [
            {
                key: 'lead',
                agent: '/@user/agent-presets/reviewer',
                subscriptions: {
                    messagesFrom: ['worker'],
                    eventTypes: ['runtime.idle'],
                },
            },
        ],
        relations: [
            {
                name: 'handoff',
                direction: 'one-way',
                between: ['worker', 'lead'],
                description: 'Worker sends drafts to lead.',
            },
        ],
    } as PackagePrimitive

    it('extracts participant agent references and subscriptions', () => {
        expect(getTeamCascadeParticipants(team)).toEqual([
            {
                key: 'lead',
                agent: expect.objectContaining({
                    kind: 'agent',
                    label: 'reviewer',
                }),
                subscriptions: ['from: worker', 'events: runtime.idle'],
            },
        ])
    })

    it('extracts relation summaries', () => {
        expect(getTeamCascadeRelations(team)).toEqual([
            {
                name: 'handoff',
                direction: 'one-way',
                between: ['worker', 'lead'],
                description: 'Worker sends drafts to lead.',
            },
        ])
    })

    it('returns team rules from structured primitives', () => {
        expect(getTeamRules(team)).toEqual(['Stay concise'])
    })
})
