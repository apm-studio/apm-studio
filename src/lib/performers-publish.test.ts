import { describe, expect, it } from 'vitest'
import {
    buildActAssetPayload,
    buildPerformerAssetPayload,
    getPerformerDependencyPublishIssues,
    normalizePerformerAssetInput,
} from './performers'

describe('buildPerformerAssetPayload', () => {
    it('keeps portable declared MCP config when exporting performer assets', () => {
        const payload = buildPerformerAssetPayload({
            talRef: { kind: 'registry', urn: 'tal/@user/project/reasoning' },
            danceRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcpServerNames: ['project-github'],
            mcpBindingMap: { github: 'project-github' },
            declaredMcpConfig: {
                github: { command: 'placeholder' },
            },
        }, {
            name: 'Research Performer',
        })

        expect(payload.payload).toMatchObject({
            tal: 'tal/@user/project/reasoning',
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcp_config: {
                github: { command: 'placeholder' },
            },
        })
        expect(payload).not.toHaveProperty('$schema')
        expect(payload).not.toHaveProperty('schema')
    })

    it('exports selected MCP server names as portable requirements for scratch performers', () => {
        const payload = buildPerformerAssetPayload({
            talRef: { kind: 'registry', urn: 'tal/@user/project/reasoning' },
            danceRefs: [],
            model: null,
            modelVariant: null,
            mcpServerNames: ['github-prod', 'postgres-readonly'],
            mcpBindingMap: {},
            declaredMcpConfig: null,
        }, {
            name: 'Tool Performer',
        })

        expect(payload.payload).toMatchObject({
            tal: 'tal/@user/project/reasoning',
            mcp_config: {
                servers: ['github-prod', 'postgres-readonly'],
            },
        })
    })

    it('reports draft Instruction dependencies with an Instruction-specific message', () => {
        expect(() => buildPerformerAssetPayload({
            talRef: { kind: 'draft', draftId: 'draft-tal-1' },
            danceRefs: [{ kind: 'registry', urn: 'dance/@user/repo/review-skill' }],
            model: null,
            modelVariant: null,
            mcpServerNames: [],
            mcpBindingMap: {},
            declaredMcpConfig: null,
        }, {
            name: 'Review Performer',
        })).toThrow('Instruction is still attached as a draft.')
    })

    it('reports draft Skill dependencies with a Skill-specific message', () => {
        expect(() => buildPerformerAssetPayload({
            talRef: { kind: 'registry', urn: 'tal/@user/project/reasoning' },
            danceRefs: [{ kind: 'draft', draftId: 'draft-dance-1' }],
            model: null,
            modelVariant: null,
            mcpServerNames: [],
            mcpBindingMap: {},
            declaredMcpConfig: null,
        }, {
            name: 'Review Performer',
        })).toThrow('Draft Skills are still attached.')
    })
})

describe('normalizePerformerAssetInput', () => {
    it('preserves modelVariant from imported performer assets', () => {
        const normalized = normalizePerformerAssetInput({
            name: 'Imported Performer',
            urn: 'performer/@user/project/imported',
            talUrn: 'tal/@user/project/reasoning',
            danceUrns: ['dance/@user/repo/style'],
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcpConfig: {
                github: { command: 'placeholder' },
            },
        })

        expect(normalized.modelVariant).toBe('reasoning-high')
        expect(normalized.meta).toEqual({
            derivedFrom: 'performer/@user/project/imported',
            publishBindingUrn: 'performer/@user/project/imported',
        })
    })
})

describe('getPerformerDependencyPublishIssues', () => {
    it('returns no issues when performer refs are installable', () => {
        expect(getPerformerDependencyPublishIssues({
            talRef: { kind: 'registry', urn: 'tal/@user/project/reasoning' },
            danceRefs: [{ kind: 'registry', urn: 'dance/@user/repo/review-skill' }],
        })).toEqual([])
    })
})

describe('buildActAssetPayload', () => {
    it('requires relation descriptions at the canonical asset boundary', () => {
        expect(() => buildActAssetPayload({
            id: 'act-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                'participant-lead': {
                    performerRef: { kind: 'registry', urn: 'performer/@studio/main/lead' },
                    displayName: 'Lead',
                    position: { x: 0, y: 0 },
                },
                'participant-reviewer': {
                    performerRef: { kind: 'registry', urn: 'performer/@studio/main/reviewer' },
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

    it('exports canonical act assets without schema metadata', () => {
        const payload = buildActAssetPayload({
            id: 'act-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                'participant-lead': {
                    performerRef: { kind: 'registry', urn: 'performer/@studio/main/lead' },
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
