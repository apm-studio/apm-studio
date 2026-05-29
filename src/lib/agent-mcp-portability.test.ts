import { describe, expect, it } from 'vitest'
import { resolveAgentMcpPortability } from '../../shared/agent-mcp-portability'

describe('resolveAgentMcpPortability', () => {
    it('splits declared MCP servers into matched and missing names', () => {
        expect(resolveAgentMcpPortability({
            servers: {
                github: { command: 'npx' },
                notion: { url: 'https://mcp.example.com' },
            },
        }, ['github', 'postgres'])).toEqual({
            declaredMcpServerNames: ['github', 'notion'],
            matchedMcpServerNames: ['github'],
            missingMcpServerNames: ['notion'],
        })
    })

    it('returns empty groups when a agent has no declared MCP config', () => {
        expect(resolveAgentMcpPortability(null, ['github'])).toEqual({
            declaredMcpServerNames: [],
            matchedMcpServerNames: [],
            missingMcpServerNames: [],
        })
    })
})
