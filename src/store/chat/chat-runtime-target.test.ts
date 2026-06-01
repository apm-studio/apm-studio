import { describe, expect, it } from 'vitest'

import { buildTeamParticipantChatKey } from '../../../shared/chat-targets'
import { createAgentNode } from '../../lib/agents-node'
import { buildAssistantWorkspaceContext, resolveChatRuntimeTarget } from './chat-runtime-target'

describe('chat-runtime-target', () => {
    it('includes team rules and participant subscriptions in assistant workspace context', () => {
        const researcher = createAgentNode({
            id: 'agent-researcher',
            name: 'Researcher',
            x: 0,
            y: 0,
            meta: {
                authoring: {
                    description: 'Collect evidence and prepare concise handoffs.',
                },
            },
        })
        const writer = createAgentNode({
            id: 'agent-writer',
            name: 'Writer',
            x: 0,
            y: 0,
        })

        const context = buildAssistantWorkspaceContext((() => ({
            workingDir: '/tmp/workspace',
            agents: [researcher, writer],
            teams: [
                {
                    id: 'team-1',
                    name: 'Research Flow',
                    description: 'Research then draft.',
                    teamRules: ['Escalate blockers quickly.'],
                    position: { x: 0, y: 0 },
                    width: 400,
                    height: 300,
                    createdAt: Date.now(),
                    participants: {
                        'participant-researcher': {
                            agentRef: { kind: 'draft', draftId: 'agent-researcher' },
                            displayName: 'Lead Researcher',
                            subscriptions: {
                                messageTags: ['handoff'],
                                callboardKeys: ['brief'],
                                eventTypes: ['runtime.idle'],
                            },
                            position: { x: 0, y: 0 },
                        },
                        'participant-writer': {
                            agentRef: { kind: 'draft', draftId: 'agent-writer' },
                            displayName: 'Writer',
                            subscriptions: {
                                messagesFrom: ['participant-researcher'],
                            },
                            position: { x: 100, y: 0 },
                        },
                    },
                    relations: [
                        {
                            id: 'rel-1',
                            between: ['participant-researcher', 'participant-writer'],
                            direction: 'one-way',
                            name: 'handoff',
                            description: 'Researcher hands off notes to Writer.',
                        },
                    ],
                    safety: {
                        threadTimeoutMs: 120000,
                    },
                },
            ],
            drafts: {},
            assistantAvailableModels: [],
        })) as never)

        expect(context?.teams[0].description).toBe('Research then draft.')
        expect(context?.teams[0].position).toEqual({ x: 0, y: 0 })
        expect(context?.teams[0].size).toEqual({ width: 400, height: 300 })
        expect(context?.teams[0].hidden).toBe(false)
        expect(context?.teams[0].teamRules).toEqual(['Escalate blockers quickly.'])
        expect(context?.teams[0].safety).toEqual({ threadTimeoutMs: 120000 })
        expect(context?.teams[0].participants[0].displayName).toBe('Lead Researcher')
        expect(context?.teams[0].participants[0].description).toBe('Collect evidence and prepare concise handoffs.')
        expect(context?.teams[0].participants[0].subscriptions).toEqual({
            messageTags: ['handoff'],
            callboardKeys: ['brief'],
            eventTypes: ['runtime.idle'],
        })
        expect(context?.teams[0].participants[1].subscriptions).toEqual({
            messagesFrom: ['participant-researcher'],
        })
    })

    it('includes local draft bindings and draft save state in assistant workspace context', () => {
        const agent = createAgentNode({
            id: 'agent-1',
            name: 'Writer',
            x: 0,
            y: 0,
            model: {
                provider: 'openai',
                modelId: 'gpt-5.4',
            },
            modelVariant: 'reasoning-high',
            meta: {
                authoring: {
                    description: 'Drafts polished answers for the team.',
                },
            },
            skillRefs: [
                { kind: 'draft', draftId: 'skill-unsaved' },
                { kind: 'registry', urn: 'skill/@dot/skill-packs/review' },
            ],
        })

        const context = buildAssistantWorkspaceContext((() => ({
            workingDir: '/tmp/workspace',
            agents: [agent],
            teams: [],
            drafts: {
                'skill-saved': {
                    id: 'skill-saved',
                    kind: 'skill',
                    name: 'Saved Skill',
                    content: '---\nname: saved-skill\n---',
                    updatedAt: Date.now(),
                    saveState: 'saved',
                },
                'skill-unsaved': {
                    id: 'skill-unsaved',
                    kind: 'skill',
                    name: 'Unsaved Skill',
                    content: '---\nname: unsaved-skill\n---',
                    updatedAt: Date.now(),
                    saveState: 'unsaved',
                },
                'instruction-unsaved': {
                    id: 'instruction-unsaved',
                    kind: 'instruction',
                    name: 'Unsaved Instruction',
                    content: '# Instruction',
                    updatedAt: Date.now(),
                    saveState: 'unsaved',
                },
            },
            assistantAvailableModels: [
                {
                    provider: 'openai',
                    providerName: 'OpenAI',
                    modelId: 'gpt-5.4',
                    name: 'GPT-5.4',
                    variants: [
                        {
                            id: 'reasoning-high',
                            summary: 'reasoning.effort=high',
                        },
                    ],
                },
            ],
        })) as never)

        expect(context?.agents).toEqual([
            {
                id: 'agent-1',
                name: 'Writer',
                description: 'Drafts polished answers for the team.',
                position: { x: 0, y: 0 },
                size: { width: 320, height: 480 },
                hidden: false,
                model: {
                    provider: 'openai',
                    modelId: 'gpt-5.4',
                },
                modelVariant: 'reasoning-high',
                skillUrns: ['skill/@dot/skill-packs/review'],
                skillDraftIds: ['skill-unsaved'],
            },
        ])
        expect(context?.availableModels).toEqual([
            {
                provider: 'openai',
                providerName: 'OpenAI',
                modelId: 'gpt-5.4',
                name: 'GPT-5.4',
                variants: [
                    {
                        id: 'reasoning-high',
                        summary: 'reasoning.effort=high',
                    },
                ],
            },
        ])
        expect(context?.drafts).toEqual([
            {
                id: 'skill-saved',
                kind: 'skill',
                name: 'Saved Skill',
                description: undefined,
                tags: undefined,
                saveState: 'saved',
            },
            {
                id: 'skill-unsaved',
                kind: 'skill',
                name: 'Unsaved Skill',
                description: undefined,
                tags: undefined,
                saveState: 'unsaved',
            },
            {
                id: 'instruction-unsaved',
                kind: 'instruction',
                name: 'Unsaved Instruction',
                description: undefined,
                tags: undefined,
                saveState: 'unsaved',
            },
        ])
    })

    it('resolves team participant chatKeys through the shared runtime target path', () => {
        const agent = createAgentNode({
            id: 'agent-researcher',
            name: 'Researcher',
            x: 0,
            y: 0,
        })
        agent.model = {
            provider: 'openai',
            modelId: 'gpt-5.4',
        }

        const chatKey = buildTeamParticipantChatKey('team-1', 'thread-1', 'participant-researcher')
        const target = resolveChatRuntimeTarget((() => ({
            workingDir: '/tmp/workspace',
            agents: [agent],
            teams: [
                {
                    id: 'team-1',
                    name: 'Research Flow',
                    description: 'Research then draft.',
                    teamRules: [],
                    position: { x: 0, y: 0 },
                    width: 400,
                    height: 300,
                    createdAt: Date.now(),
                    participants: {
                        'participant-researcher': {
                            agentRef: { kind: 'draft', draftId: 'agent-researcher' },
                            displayName: 'Lead Researcher',
                            position: { x: 0, y: 0 },
                        },
                    },
                    relations: [],
                },
            ],
            drafts: {},
            assistantAvailableModels: [],
            assistantModel: null,
        })) as never, chatKey)

        expect(target).toMatchObject({
            chatKey,
            kind: 'team-participant',
            name: 'Researcher',
            executionScope: {
                agentId: 'agent-researcher',
                teamId: 'team-1',
            },
            requestTarget: {
                agentId: chatKey,
                agentName: 'Researcher',
                teamId: 'team-1',
                teamThreadId: 'thread-1',
            },
        })
    })
})
