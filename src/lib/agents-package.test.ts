import { describe, expect, it } from 'vitest'
import {
    buildTeamPrimitivePayload,
    buildAgentPrimitivePayload,
    getAgentDependencyPackageIssues,
    normalizeAgentPrimitiveInput,
} from './agents'

describe('buildAgentPrimitivePayload', () => {
    it('keeps portable declared MCP config when exporting agent primitives', () => {
        const payload = buildAgentPrimitivePayload({
            instructionRef: { kind: 'registry', urn: 'instruction/@user/project/reasoning' },
            skillRefs: [],
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcpServerNames: ['project-github'],
            mcpBindingMap: { github: 'project-github' },
            declaredMcpConfig: {
                github: { command: 'placeholder' },
            },
        }, {
            name: 'Research Agent',
        })

        expect(payload.payload).toMatchObject({
            instruction: 'instruction/@user/project/reasoning',
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcp_config: {
                github: { command: 'placeholder' },
            },
        })
        expect(payload).not.toHaveProperty('$schema')
        expect(payload).not.toHaveProperty('schema')
    })

    it('exports selected MCP server names as portable requirements for scratch agents', () => {
        const payload = buildAgentPrimitivePayload({
            instructionRef: { kind: 'registry', urn: 'instruction/@user/project/reasoning' },
            skillRefs: [],
            model: null,
            modelVariant: null,
            mcpServerNames: ['github-prod', 'postgres-readonly'],
            mcpBindingMap: {},
            declaredMcpConfig: null,
        }, {
            name: 'Tool Agent',
        })

        expect(payload.payload).toMatchObject({
            instruction: 'instruction/@user/project/reasoning',
            mcp_config: {
                servers: ['github-prod', 'postgres-readonly'],
            },
        })
    })

    it('reports draft Instruction dependencies with an Instruction-specific message', () => {
        expect(() => buildAgentPrimitivePayload({
            instructionRef: { kind: 'draft', draftId: 'draft-instruction-1' },
            skillRefs: [{ kind: 'registry', urn: 'skill/@user/repo/review-skill' }],
            model: null,
            modelVariant: null,
            mcpServerNames: [],
            mcpBindingMap: {},
            declaredMcpConfig: null,
        }, {
            name: 'Review Agent',
        })).toThrow('Instruction is still attached as a draft.')
    })

    it('reports draft Skill dependencies with a Skill-specific message', () => {
        expect(() => buildAgentPrimitivePayload({
            instructionRef: { kind: 'registry', urn: 'instruction/@user/project/reasoning' },
            skillRefs: [{ kind: 'draft', draftId: 'draft-skill-1' }],
            model: null,
            modelVariant: null,
            mcpServerNames: [],
            mcpBindingMap: {},
            declaredMcpConfig: null,
        }, {
            name: 'Review Agent',
        })).toThrow('Draft Skills are still attached.')
    })
})

describe('normalizeAgentPrimitiveInput', () => {
    it('preserves modelVariant from imported agent primitives', () => {
        const normalized = normalizeAgentPrimitiveInput({
            name: 'Imported Agent',
            urn: 'agent/@user/project/imported',
            instructionUrn: 'instruction/@user/project/reasoning',
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

describe('getAgentDependencyPackageIssues', () => {
    it('returns no issues when agent refs are installable', () => {
        expect(getAgentDependencyPackageIssues({
            instructionRef: { kind: 'registry', urn: 'instruction/@user/project/reasoning' },
            skillRefs: [{ kind: 'registry', urn: 'skill/@user/repo/review-skill' }],
        })).toEqual([])
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
