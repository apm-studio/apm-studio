import { describe, expect, it } from 'vitest'
import { createAgentNode } from '../../lib/agents-node'
import {
    applyMcpCatalogImpactToAgents,
    buildMcpCatalogImpact,
    buildMcpDrafts,
    getMcpEntryValidationError,
    serializeMcpEntries,
    type McpEntryDraft,
} from './mcp-catalog-utils'

function createDraft(overrides: Partial<McpEntryDraft>): McpEntryDraft {
    return {
        key: 'draft',
        name: '',
        transport: 'stdio',
        enabled: true,
        timeoutText: '',
        command: '',
        args: [],
        env: [],
        url: '',
        headers: [],
        oauthEnabled: true,
        oauthClientId: '',
        oauthClientSecret: '',
        oauthScope: '',
        ...overrides,
    }
}

describe('mcp-catalog-utils', () => {
    it('rejects duplicate MCP names before save', () => {
        expect(getMcpEntryValidationError([
            {
                key: '1',
                name: 'github',
                transport: 'stdio',
                enabled: true,
                timeoutText: '',
                command: 'cmd-a',
                args: [],
                env: [],
                url: '',
                headers: [],
                oauthEnabled: true,
                oauthClientId: '',
                oauthClientSecret: '',
                oauthScope: '',
            },
            {
                key: '2',
                name: 'github',
                transport: 'http',
                enabled: true,
                timeoutText: '',
                command: '',
                args: [],
                env: [],
                url: 'https://mcp.example.com',
                headers: [],
                oauthEnabled: true,
                oauthClientId: '',
                oauthClientSecret: '',
                oauthScope: '',
            },
        ])).toBe("MCP 'github' is duplicated. Server names must be unique.")
    })

    it('builds rename and delete impact against agent references', () => {
        const agents = [
            createAgentNode({
                id: 'agent-1',
                name: 'Planner',
                x: 0,
                y: 0,
                mcpServerNames: ['github', 'postgres'],
                mcpBindingMap: {
                    prod: 'github',
                },
            }),
            createAgentNode({
                id: 'agent-2',
                name: 'Writer',
                x: 0,
                y: 0,
                mcpServerNames: ['filesystem'],
                mcpBindingMap: {
                    archive: 'filesystem',
                },
            }),
        ]

        const impact = buildMcpCatalogImpact(
            [
                createDraft({ key: 'github', name: 'github', command: 'npx' }),
                createDraft({ key: 'filesystem', name: 'filesystem', command: 'npx' }),
            ],
            [
                createDraft({ key: 'github', name: 'github-prod', command: 'npx' }),
            ],
            agents,
        )

        expect(impact).toEqual({
            renames: [{
                key: 'github',
                previousName: 'github',
                nextName: 'github-prod',
                affectedAgentIds: ['agent-1'],
            }],
            deletes: [{
                key: 'filesystem',
                name: 'filesystem',
                affectedAgentIds: ['agent-2'],
            }],
            affectedAgentIds: ['agent-1', 'agent-2'],
            affectedAgentNames: ['Planner', 'Writer'],
        })
    })

    it('rewrites agent MCP selections and bindings for rename/delete impact', () => {
        const agents = [
            createAgentNode({
                id: 'agent-1',
                name: 'Planner',
                x: 0,
                y: 0,
                mcpServerNames: ['github', 'filesystem'],
                mcpBindingMap: {
                    prod: 'github',
                    archive: 'filesystem',
                },
                meta: {
                    sourceBindingUrn: 'agent/@acme/planner',
                },
            }),
            createAgentNode({
                id: 'agent-2',
                name: 'Writer',
                x: 0,
                y: 0,
                mcpServerNames: ['playwright'],
            }),
        ]

        const nextAgents = applyMcpCatalogImpactToAgents(agents, {
            renames: [{
                key: 'github',
                previousName: 'github',
                nextName: 'github-prod',
                affectedAgentIds: ['agent-1'],
            }],
            deletes: [{
                key: 'filesystem',
                name: 'filesystem',
                affectedAgentIds: ['agent-1'],
            }],
            affectedAgentIds: ['agent-1'],
            affectedAgentNames: ['Planner'],
        })

        expect(nextAgents[0]).toEqual(expect.objectContaining({
            mcpServerNames: ['github-prod'],
            mcpBindingMap: {
                prod: 'github-prod',
            },
            meta: expect.objectContaining({
                sourceBindingUrn: null,
            }),
        }))
        expect(nextAgents[1]).toBe(agents[1])
    })

    it('round-trips startup state for disabled MCP servers', () => {
        const drafts = buildMcpDrafts({
            tradingview: {
                type: 'remote',
                url: 'https://mcp.example.com',
                enabled: false,
                oauth: false,
            },
        })

        expect(drafts).toEqual([
            expect.objectContaining({
                name: 'tradingview',
                enabled: false,
            }),
        ])

        expect(serializeMcpEntries(drafts)).toEqual({
            tradingview: {
                type: 'remote',
                url: 'https://mcp.example.com',
                enabled: false,
                oauth: false,
            },
        })
    })

    it('preserves editor draft keys when rebuilding saved catalog drafts', () => {
        const drafts = buildMcpDrafts({
            dartlab: {
                type: 'local',
                command: ['dartlab-mcp'],
            },
        }, [
            createDraft({
                key: 'package-mcp-local-draft',
                name: 'dartlab',
                command: 'dartlab-mcp',
            }),
        ])

        expect(drafts[0]).toEqual(expect.objectContaining({
            key: 'package-mcp-local-draft',
            name: 'dartlab',
        }))
    })
})
