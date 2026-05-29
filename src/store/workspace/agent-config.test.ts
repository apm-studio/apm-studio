import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAgentNode } from '../../lib/agents-node'
import {
    addAgentMcp,
    removeAgentSkill,
    removeAgentMcp,
    setAgentMcpBinding,
    setAgentModel,
    setAgentModelVariant,
} from './agent-config'
import type { StudioState } from '../types'

function makeState(): StudioState {
    return {
        agents: [
            createAgentNode({
                id: 'agent-1',
                name: 'Reviewer',
                x: 0,
                y: 0,
                skillRefs: [
                    { kind: 'draft', draftId: 'skill-draft-1' },
                    { kind: 'registry', urn: 'skill/@acme/review-checks' },
                ],
            }),
        ],
        teams: [],
        teamThreads: {},
        workspaceDirty: false,
        recordStudioChange: () => {},
        saveWorkspace: vi.fn(async () => {}),
    } as unknown as StudioState
}

describe('workspace agent config', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('removes draft skill refs by plain draft id', () => {
        let state = makeState()
        const get = () => state
        const set = (partial: Partial<StudioState> | ((value: StudioState) => Partial<StudioState>)) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...update }
        }

        removeAgentSkill(set, get, 'agent-1', 'skill-draft-1')

        expect(state.agents[0].skillRefs).toEqual([
            { kind: 'registry', urn: 'skill/@acme/review-checks' },
        ])
    })

    it('still removes registry skill refs by URN', () => {
        let state = makeState()
        const get = () => state
        const set = (partial: Partial<StudioState> | ((value: StudioState) => Partial<StudioState>)) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...update }
        }

        removeAgentSkill(set, get, 'agent-1', 'skill/@acme/review-checks')

        expect(state.agents[0].skillRefs).toEqual([
            { kind: 'draft', draftId: 'skill-draft-1' },
        ])
    })

    it('clears modelVariant when the model changes', () => {
        let state = {
            ...makeState(),
            agents: [
                createAgentNode({
                    id: 'agent-1',
                    name: 'Reviewer',
                    x: 0,
                    y: 0,
                    model: { provider: 'openai', modelId: 'gpt-5.4' },
                    modelVariant: 'high',
                }),
            ],
        }
        const get = () => state
        const set = (partial: Partial<StudioState> | ((value: StudioState) => Partial<StudioState>)) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...update }
        }

        setAgentModel(set, get, 'agent-1', { provider: 'anthropic', modelId: 'claude-sonnet-4' })

        expect(state.agents[0].modelVariant).toBeNull()
    })

    it('persists workspace for live Team agent runtime changes without requiring Team sync', async () => {
        let state = {
            ...makeState(),
            workspaceDirty: true,
            teams: [{
                id: 'team-1',
                name: 'Review Flow',
                position: { x: 0, y: 0 },
                width: 400,
                height: 300,
                participants: {
                    reviewer: {
                        agentRef: { kind: 'draft', draftId: 'agent-1' },
                        position: { x: 0, y: 0 },
                    },
                },
                relations: [],
                createdAt: Date.now(),
            }],
            teamThreads: {
                'team-1': [{
                    id: 'thread-1',
                    teamId: 'team-1',
                    status: 'active',
                    participantSessions: {},
                    participantStatuses: {},
                    createdAt: Date.now(),
                }],
            },
        } as unknown as StudioState
        const get = () => state
        const set = (partial: Partial<StudioState> | ((value: StudioState) => Partial<StudioState>)) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...update }
        }

        setAgentModelVariant(set, get, 'agent-1', 'high')
        await vi.advanceTimersByTimeAsync(350)

        expect(state.saveWorkspace).toHaveBeenCalledTimes(1)
    })

    it('adds direct MCP selections as agent projection changes', () => {
        const recordStudioChange = vi.fn()
        let state: StudioState = {
            ...makeState(),
            recordStudioChange,
        } as unknown as StudioState
        const get = () => state
        const set = (partial: Partial<StudioState> | ((value: StudioState) => Partial<StudioState>)) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...update }
        }

        addAgentMcp(set, get, 'agent-1', { name: 'dartlab' })
        addAgentMcp(set, get, 'agent-1', { name: 'dartlab' })

        expect(state.agents[0].mcpServerNames).toEqual(['dartlab'])
        expect(state.workspaceDirty).toBe(true)
        expect(recordStudioChange).toHaveBeenCalledTimes(1)
        expect(recordStudioChange).toHaveBeenCalledWith({ kind: 'agent', agentIds: ['agent-1'] })
    })

    it('removes direct MCP selections and related placeholder bindings together', () => {
        const recordStudioChange = vi.fn()
        let state: StudioState = {
            ...makeState(),
            recordStudioChange,
            agents: [
                createAgentNode({
                    id: 'agent-1',
                    name: 'Reviewer',
                    x: 0,
                    y: 0,
                    mcpServerNames: ['dartlab', 'openbb-mcp'],
                    mcpBindingMap: {
                        market_data: 'dartlab',
                        filings: 'openbb-mcp',
                    },
                }),
            ],
        } as unknown as StudioState
        const get = () => state
        const set = (partial: Partial<StudioState> | ((value: StudioState) => Partial<StudioState>)) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...update }
        }

        removeAgentMcp(set, get, 'agent-1', 'dartlab')
        removeAgentMcp(set, get, 'agent-1', 'dartlab')

        expect(state.agents[0].mcpServerNames).toEqual(['openbb-mcp'])
        expect(state.agents[0].mcpBindingMap).toEqual({ filings: 'openbb-mcp' })
        expect(recordStudioChange).toHaveBeenCalledTimes(1)
        expect(recordStudioChange).toHaveBeenCalledWith({ kind: 'agent', agentIds: ['agent-1'] })
    })

    it('sets and clears portable MCP placeholder bindings', () => {
        const recordStudioChange = vi.fn()
        let state: StudioState = {
            ...makeState(),
            recordStudioChange,
        } as unknown as StudioState
        const get = () => state
        const set = (partial: Partial<StudioState> | ((value: StudioState) => Partial<StudioState>)) => {
            const update = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...update }
        }

        setAgentMcpBinding(set, get, 'agent-1', 'market_data', 'dartlab')
        setAgentMcpBinding(set, get, 'agent-1', 'market_data', 'dartlab')
        expect(state.agents[0].mcpBindingMap).toEqual({ market_data: 'dartlab' })

        setAgentMcpBinding(set, get, 'agent-1', 'market_data', null)
        setAgentMcpBinding(set, get, 'agent-1', 'market_data', null)
        expect(state.agents[0].mcpBindingMap).toEqual({})
        expect(recordStudioChange).toHaveBeenCalledTimes(2)
    })
})
