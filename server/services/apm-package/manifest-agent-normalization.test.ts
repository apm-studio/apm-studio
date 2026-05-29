import { describe, expect, it } from 'vitest'
import type {
    ApmAgentExtension,
    ApmPackageManifest,
} from '../../../shared/apm-contracts.js'
import {
    agentFromExtension,
    normalizeAgent,
} from './manifest-agent-normalization.js'

describe('manifest agent normalization', () => {
    it('normalizes workspace agent snapshots from unknown input', () => {
        expect(normalizeAgent({
            id: 'agent-1',
            name: 'API Designer',
            position: { x: 10, y: 20 },
            width: 320,
            height: 240,
            scope: 'shared',
            model: { provider: 'openai', modelId: 'gpt-5', temperature: 0.2 },
            modelPlaceholder: null,
            instructionRef: { kind: 'registry', urn: 'instruction://api' },
            skillRefs: [
                { kind: 'draft', draftId: 'skill-draft-1' },
                { kind: 'unknown', draftId: 'ignored' },
            ],
            agentBody: 'Design REST APIs.',
            mcpServerNames: ['github', ''],
            mcpBindingMap: { github: 'github-main', empty: '' },
            declaredMcpConfig: null,
            runtimeAgentId: 'build',
            planMode: true,
            hidden: false,
            meta: {
                derivedFrom: 'agent://api',
                sourceBindingUrn: 'agent://api',
                authoring: {
                    slug: 'api-designer',
                    description: 'Design APIs',
                    tags: ['api', ''],
                },
            },
        })).toMatchObject({
            id: 'agent-1',
            name: 'API Designer',
            position: { x: 10, y: 20 },
            width: 320,
            height: 240,
            scope: 'shared',
            model: { provider: 'openai', modelId: 'gpt-5', temperature: 0.2 },
            modelPlaceholder: null,
            instructionRef: { kind: 'registry', urn: 'instruction://api' },
            skillRefs: [{ kind: 'draft', draftId: 'skill-draft-1' }],
            agentBody: 'Design REST APIs.',
            mcpServerNames: ['github'],
            mcpBindingMap: { github: 'github-main' },
            declaredMcpConfig: null,
            runtimeAgentId: 'build',
            planMode: true,
            hidden: false,
            meta: {
                derivedFrom: 'agent://api',
                sourceBindingUrn: 'agent://api',
                authoring: {
                    slug: 'api-designer',
                    description: 'Design APIs',
                    tags: ['api'],
                },
            },
        })
    })

    it('rejects invalid workspace agent snapshots', () => {
        expect(normalizeAgent(null)).toBeNull()
        expect(normalizeAgent({ id: '', name: 'Missing id' })).toBeNull()
        expect(normalizeAgent({ id: 'agent-1', name: '' })).toBeNull()
    })

    it('restores workspace agents from Studio x-apm extension metadata', () => {
        const extension: ApmAgentExtension = {
            agentNodeId: 'agent-1',
            agentName: 'API Designer',
            model: null,
            modelVariant: 'fast',
            agentBody: null,
            instructionRef: { kind: 'registry', urn: 'instruction://api' },
            skillRefs: [{ kind: 'draft', draftId: 'skill-1' }],
            mcpServerNames: ['github'],
            runtimeAgentId: 'build',
            planMode: true,
            derivedFrom: 'agent://api',
        }
        const manifest: ApmPackageManifest = {
            name: 'api-designer',
            version: '0.1.0',
            description: 'Design APIs',
            agents: [{ instruction: { source: 'inline', content: 'Use clear API contracts.' } }],
        }

        expect(agentFromExtension(extension, manifest)).toMatchObject({
            id: 'agent-1',
            name: 'API Designer',
            model: null,
            modelVariant: 'fast',
            agentBody: 'Use clear API contracts.',
            instructionRef: { kind: 'registry', urn: 'instruction://api' },
            skillRefs: [{ kind: 'draft', draftId: 'skill-1' }],
            mcpServerNames: ['github'],
            runtimeAgentId: 'build',
            planMode: true,
            meta: {
                derivedFrom: 'agent://api',
                authoring: { description: 'Design APIs' },
            },
        })
    })
})
