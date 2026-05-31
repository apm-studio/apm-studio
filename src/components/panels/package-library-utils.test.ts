import type { DraftPrimitive } from '../../lib/primitive-types'
import { describe, it, expect } from 'vitest'
import {
    normalizeAuthor,
    displayUrn,
    isPackagePrimitiveKind,
    getPrimitiveUrn,
    getPackagePanelItemKey,
    buildSearchHaystack,
    buildModelHaystack,
    buildMcpHaystack,
    classifyModelProvider,
    scoreModel,
    placeholderForLocalSection,
    placeholderForPrimitiveSection,
    buildDraftPackageCards,
    buildPackagePrimitiveDragPayload,
    resolveSelectedPackagePanelItem,
} from './package-library-utils'

import type { McpServerSummary } from '../../../shared/opencode-contracts'
import type { PackagePrimitive, ModelPanelItem } from './package-panel-types'

describe('normalizeAuthor', () => {
    it('prefixes @ when missing', () => {
        expect(normalizeAuthor('user')).toBe('@user')
    })

    it('keeps @ when present', () => {
        expect(normalizeAuthor('@user')).toBe('@user')
    })

    it('returns empty for falsy input', () => {
        expect(normalizeAuthor(undefined)).toBe('')
        expect(normalizeAuthor('')).toBe('')
    })
})

describe('displayUrn', () => {
    it('returns last segment', () => {
        expect(displayUrn('instruction/@user/my-instruction')).toBe('my-instruction')
    })

    it('handles single segment', () => {
        expect(displayUrn('single')).toBe('single')
    })
})

describe('isPackagePrimitiveKind', () => {
    it('returns true for valid kinds', () => {
        expect(isPackagePrimitiveKind('instruction')).toBe(true)
        expect(isPackagePrimitiveKind('skill')).toBe(true)
        expect(isPackagePrimitiveKind('agent')).toBe(true)
        expect(isPackagePrimitiveKind('team')).toBe(true)
    })

    it('returns false for invalid kinds', () => {
        expect(isPackagePrimitiveKind('model')).toBe(false)
        expect(isPackagePrimitiveKind('mcp')).toBe(false)
        expect(isPackagePrimitiveKind('')).toBe(false)
    })
})

describe('getPrimitiveUrn', () => {
    it('returns urn when present', () => {
        expect(getPrimitiveUrn({ urn: 'instruction/@user/foo' })).toBe('instruction/@user/foo')
    })

    it('constructs urn from kind/author/name', () => {
        expect(getPrimitiveUrn({ kind: 'instruction', author: 'user', name: 'foo', slug: 'foo' })).toBe('instruction/@user/foo')
    })

    it('returns null for null input', () => {
        expect(getPrimitiveUrn(null)).toBeNull()
    })

    it('returns null for model kind', () => {
        expect(getPrimitiveUrn({ kind: 'model', name: 'gpt-4' })).toBeNull()
    })
})

describe('getPackagePanelItemKey', () => {
    it('uses urn when available', () => {
        expect(getPackagePanelItemKey({ urn: 'instruction/@user/foo', kind: 'instruction' })).toBe('instruction/@user/foo')
    })

    it('generates model key', () => {
        expect(getPackagePanelItemKey({ kind: 'model', provider: 'anthropic', id: 'claude-3' })).toBe('model:anthropic:claude-3')
    })

    it('generates mcp key', () => {
        expect(getPackagePanelItemKey({ kind: 'mcp', name: 'my-server' })).toBe('mcp:my-server')
    })
})

describe('buildSearchHaystack', () => {
    it('combines name, author, urn, description, tags', () => {
        const result = buildSearchHaystack({
            name: 'My Item',
            author: '@user',
            urn: '/@user/my-item',
            description: 'A cool item',
            tags: ['tag1', 'tag2'],
        })
        expect(result).toContain('my item')
        expect(result).toContain('@user')
        expect(result).toContain('tag1')
    })

    it('handles missing fields gracefully', () => {
        const result = buildSearchHaystack({ name: 'Test' })
        expect(result).toContain('test')
    })
})

describe('buildModelHaystack', () => {
    it('includes model name and provider', () => {
        const result = buildModelHaystack({ name: 'GPT-4', provider: 'openai', toolCall: true })
        expect(result).toContain('gpt-4')
        expect(result).toContain('openai')
        expect(result).toContain('tool-call')
    })
})

describe('buildMcpHaystack', () => {
    it('includes server name and tools', () => {
        const result = buildMcpHaystack({
            name: 'my-server',
            status: 'connected',
            tools: [{ name: 'read', description: 'Read files' }],
        })
        expect(result).toContain('my-server')
        expect(result).toContain('read')
    })
})

describe('classifyModelProvider', () => {
    it('classifies anthropic', () => {
        expect(classifyModelProvider({ provider: 'anthropic' })).toBe('provider:anthropic')
    })

    it('classifies openai', () => {
        expect(classifyModelProvider({ provider: 'openai' })).toBe('provider:openai')
    })

    it('uses provider id rather than provider name heuristics', () => {
        expect(classifyModelProvider({ provider: 'google', providerName: 'Google AI' })).toBe('provider:google')
    })

    it('keeps custom provider ids', () => {
        expect(classifyModelProvider({ provider: 'github-copilot' })).toBe('provider:github-copilot')
    })

    it('falls back to unknown without a provider id', () => {
        expect(classifyModelProvider({ providerName: 'Custom Provider' })).toBe('provider:unknown')
    })
})

describe('scoreModel', () => {
    it('scores connected models higher', () => {
        const connected = scoreModel({ connected: true, name: 'test', context: 0 })
        const disconnected = scoreModel({ connected: false, name: 'test', context: 0 })
        expect(connected).toBeGreaterThan(disconnected)
    })

    it('scores sonnet models high', () => {
        const score = scoreModel({ name: 'Claude Sonnet', connected: true, context: 200000 })
        expect(score).toBeGreaterThan(1100) // 1000 (connected) + 140 (sonnet) + context bonus
    })

    it('penalizes preview/mini models', () => {
        const regular = scoreModel({ name: 'GPT-5', connected: true, context: 0 })
        const preview = scoreModel({ name: 'GPT-5 Preview', connected: true, context: 0 })
        expect(regular).toBeGreaterThan(preview)
    })

    it('prioritizes newer numbered GPT models', () => {
        const latest = scoreModel({ name: 'GPT-5.5', id: 'gpt-5.5', connected: true, context: 0 })
        const previous = scoreModel({ name: 'GPT-5.4', id: 'gpt-5.4', connected: true, context: 0 })
        expect(latest).toBeGreaterThan(previous)
    })
})

describe('placeholderForLocalSection', () => {
    it('returns package placeholder for package lists', () => {
        expect(placeholderForLocalSection('packages')).toBe('package, primitive, apm.yml path...')
    })

    it('returns mcp placeholder', () => {
        expect(placeholderForLocalSection('mcp')).toBe('mcp server, tool, status...')
    })

    it('returns model placeholder for model lists', () => {
        expect(placeholderForLocalSection('models')).toBe('model, provider, capability...')
    })
})

describe('placeholderForPrimitiveSection', () => {
    it('returns Studio Agent component placeholders', () => {
        expect(placeholderForPrimitiveSection('agents')).toBe('studio agent package, apm.yml path...')
        expect(placeholderForPrimitiveSection('instructions')).toBe('instruction package, apm.yml path...')
        expect(placeholderForPrimitiveSection('skills')).toBe('skill package, apm.yml path...')
        expect(placeholderForPrimitiveSection('mcp')).toBe('mcp server, tool, status...')
    })
})

describe('buildDraftPackageCards', () => {
    it('builds cards from drafts filtered by kind', () => {
        const drafts: Record<string, DraftPrimitive> = {
            d1: { id: 'd1', kind: 'instruction', name: 'Draft Instruction', createdAt: 100, updatedAt: 100, content: '# hello', saveState: 'saved' },
            d2: { id: 'd2', kind: 'skill', name: 'Draft Skill', createdAt: 200, updatedAt: 200, content: '## skill', saveState: 'saved' },
            d3: { id: 'd3', kind: 'instruction', name: 'Another Instruction', createdAt: 300, updatedAt: 300, content: '', saveState: 'saved' },
        }
        const cards = buildDraftPackageCards(drafts, 'instruction')
        expect(cards).toHaveLength(2)
        // Should be sorted by updatedAt descending
        expect(cards[0].name).toBe('Another Instruction')
        expect(cards[1].name).toBe('Draft Instruction')
    })

    it('returns empty for no matching drafts', () => {
        expect(buildDraftPackageCards({}, 'agent')).toHaveLength(0)
    })
})

describe('buildPackagePrimitiveDragPayload', () => {
    it('preserves agent modelVariant in drag payloads', () => {
        expect(buildPackagePrimitiveDragPayload({
            kind: 'agent',
            urn: 'agent/@user/project/researcher',
            name: 'researcher',
            author: '@user',
            instructionUrn: 'instruction/@user/project/reasoning',
            skillUrns: ['skill/@user/project/write'],
            model: { provider: 'openai', modelId: 'gpt-5' },
            modelVariant: 'reasoning-high',
            mcpConfig: { github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] } },
            declaredMcpServerNames: ['github'],
            matchedMcpServerNames: ['github'],
            missingMcpServerNames: [],
        } as PackagePrimitive)).toMatchObject({
            kind: 'agent',
            modelVariant: 'reasoning-high',
            declaredMcpServerNames: ['github'],
            matchedMcpServerNames: ['github'],
        })
    })

    it('includes draftContent for agent drafts', () => {
        const draftContent = {
            instructionRef: { kind: 'registry' as const, urn: 'instruction/@user/project/reasoning' },
            skillRefs: [],
            model: null,
            mcpServerNames: [],
        }
        const payload = buildPackagePrimitiveDragPayload({
            kind: 'agent',
            source: 'draft',
            draftId: 'draft-1',
            urn: 'draft/draft-1',
            name: 'Draft Agent',
            author: '@draft',
            draftContent,
        } as PackagePrimitive)
        expect(payload).toMatchObject({
            kind: 'agent',
            source: 'draft',
            draftId: 'draft-1',
            draftContent,
        })
    })

    it('includes participants and relations for package team primitives', () => {
        const participants = [
            { key: 'p1', agent: '/@user/coder' },
            { key: 'p2', agent: '/@user/reviewer' },
        ]
        const relations: Array<{
            id: string
            between: [string, string]
            direction: 'one-way'
            name: string
            description: string
        }> = [
            { id: 'r1', between: ['p1', 'p2'], direction: 'one-way', name: 'request_review', description: 'Route review requests.' },
        ]
        const payload = buildPackagePrimitiveDragPayload({
            kind: 'team',
            urn: '/@user/code-review',
            name: 'code-review',
            author: '@user',
            source: 'workspace',
            description: 'Code review team',
            teamRules: ['Always review before merge'],
            participants,
            relations,
        } as PackagePrimitive)
        expect(payload).toMatchObject({
            kind: 'team',
            source: 'workspace',
            participants,
            relations,
            teamRules: ['Always review before merge'],
        })
    })

    it('includes draftContent for team drafts', () => {
        const draftContent = { description: 'Draft team', participants: {}, relations: [] }
        const payload = buildPackagePrimitiveDragPayload({
            kind: 'team',
            source: 'draft',
            draftId: 'team-draft-1',
            urn: 'draft/team-draft-1',
            name: 'Draft Team',
            author: '@draft',
            draftContent,
        } as PackagePrimitive)
        expect(payload).toMatchObject({
            kind: 'team',
            source: 'draft',
            draftId: 'team-draft-1',
            draftContent,
        })
    })
})

describe('resolveSelectedPackagePanelItem', () => {
    it('refreshes selected draft details from the latest package snapshot', () => {
        const selected: PackagePrimitive = {
            kind: 'instruction',
            source: 'draft',
            urn: 'draft/draft-1',
            draftId: 'draft-1',
            name: 'Head Manager Instruction',
            author: '@draft',
            description: 'Old description',
            content: 'Old content',
        }

        const latest: PackagePrimitive = {
            ...selected,
            description: 'Updated description',
            content: 'Updated content',
        }

        expect(resolveSelectedPackagePanelItem(selected, {
            packagePrimitives: [latest],
        })).toEqual(latest)
    })

    it('refreshes selected runtime primitives from live model and MCP snapshots', () => {
        const selectedModel: ModelPanelItem = {
            kind: 'model',
            provider: 'openai',
            providerName: 'OpenAI',
            id: 'gpt-5.4',
            name: 'GPT-5.4',
            connected: false,
            context: 128000,
            output: 16000,
            toolCall: true,
            reasoning: true,
            attachment: true,
            temperature: false,
            modalities: {
                input: ['text'],
                output: ['text'],
            },
            variants: [],
        }
        const updatedModel = {
            provider: 'openai',
            providerName: 'OpenAI',
            id: 'gpt-5.4',
            name: 'GPT-5.4',
            connected: true,
            context: 128000,
            output: 16000,
            toolCall: true,
            reasoning: true,
            attachment: true,
            temperature: false,
            modalities: {
                input: ['text'],
                output: ['text'],
            },
            variants: [],
        }

        const selectedMcp = {
            kind: 'mcp',
            name: 'filesystem',
            status: 'disconnected',
            tools: [],
            resources: [],
        } satisfies McpServerSummary & { kind: 'mcp' }
        const updatedMcp: McpServerSummary = {
            name: 'filesystem',
            status: 'connected',
            tools: [],
            resources: [],
        }

        expect(resolveSelectedPackagePanelItem(selectedModel, {
            models: [updatedModel],
        })).toMatchObject({
            kind: 'model',
            connected: true,
        })
        expect(resolveSelectedPackagePanelItem(selectedMcp, {
            mcps: [updatedMcp],
        })).toMatchObject({
            kind: 'mcp',
            status: 'connected',
        })
    })
})
