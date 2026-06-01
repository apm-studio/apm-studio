import type { WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import { describe, expect, it } from 'vitest'
import type { StudioState } from '../types'
import { createTeamSlice } from './slice'
import { createEmptyProjectionDirtyState } from '../runtime/change-policy'
function overlaps(
    left: { x: number; y: number; width: number; height: number },
    right: { x: number; y: number; width: number; height: number },
) {
    return !(
        left.x + left.width <= right.x
        || right.x + right.width <= left.x
        || left.y + left.height <= right.y
        || right.y + right.height <= left.y
    )
}

function createBaseState(): StudioState {
    return {
        workspaceId: 'workspace-1',
        agents: [{
            id: 'agent-1',
            name: 'Researcher',
            position: { x: 840, y: 500 },
            width: 320,
            height: 400,
            scope: 'shared',
            model: null,
            skillRefs: [],
            mcpServerNames: [],
        }],
        drafts: {},
        markdownEditors: [],
        editingTarget: null,
        selectedAgentId: null,
        selectedAgentSessionId: null,
        selectedMarkdownEditorId: null,
        focusSnapshot: null,
        canvasRevealTarget: null,
        inspectorFocus: null,
        workspaceList: [],
        workspaceDirty: false,
        projectionDirty: createEmptyProjectionDirtyState(),
        runtimeReloadPending: false,
        theme: 'light',
        workingDir: '/tmp/workspace',
        isTerminalOpen: false,
        isTrackingOpen: false,
        isPackageLibraryOpen: false,
        canvasTerminals: [],
        canvasCenter: { x: 1000, y: 700 },
        layoutTeamId: null,
        chatDrafts: {},
        chatPrefixes: {},
        activeChatAgentId: null,
        sessions: [],
        selectedTeamId: null,
        teamEditorState: null,
        teams: [],
        teamThreads: {},
        activeThreadId: null,
        activeThreadParticipantKey: null,
        isAssistantOpen: false,
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
        seEntities: {},
        seMessages: {},
        seStatuses: {},
        sePermissions: {},
        seQuestions: {},
        seTodos: {},
        chatKeyToSession: {},
        sessionToChatKey: {},
        sessionLoading: {},
        sessionReverts: {},
        clearSessionData: () => {},
        unregisterBinding: () => {},
        clearChatDraftMessages: () => {},
        clearChatPrefixMessages: () => {},
        removeSession: () => {},
        listSessions: async () => {},
        recordStudioChange: () => 'hot',
    } as unknown as StudioState
}

function createHarness(base: StudioState = createBaseState()) {
    let state = base
    const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial
        state = { ...state, ...next }
    }
    const get = () => state
    const slice = createTeamSlice(set, get, {} as never)
    state = { ...slice, ...state } as StudioState
    return {
        get: () => state,
    }
}

describe('team slice', () => {
    it('spawns a new team without overlapping an existing agent window', () => {
        const harness = createHarness()

        const teamId = harness.get().addTeam('Review Flow')
        const team = harness.get().teams.find((entry) => entry.id === teamId)

        expect(team).toBeTruthy()
        expect(overlaps(
            {
                x: team!.position.x,
                y: team!.position.y,
                width: team!.width,
                height: team!.height,
            },
            {
                x: 840,
                y: 500,
                width: 320,
                height: 400,
            },
        )).toBe(false)
        expect(harness.get().canvasRevealTarget).toMatchObject({
            id: teamId,
            type: 'team',
        })
    })

    it('keeps focus mode active when toggling another team visibility', () => {
        const harness = createHarness({
            ...createBaseState(),
            teams: [
                {
                    id: 'team-1',
                    name: 'Focused Team',
                    position: { x: 100, y: 120 },
                    width: 960,
                    height: 720,
                    participants: {},
                    relations: [],
                    createdAt: Date.now(),
                    hidden: false,
                },
                {
                    id: 'team-2',
                    name: 'Hidden Target',
                    position: { x: 520, y: 120 },
                    width: 640,
                    height: 800,
                    participants: {},
                    relations: [],
                    createdAt: Date.now(),
                    hidden: true,
                },
            ],
            focusSnapshot: {
                nodeId: 'team-1',
                type: 'team',
                nodePosition: { x: 100, y: 120 },
                nodeSize: { width: 640, height: 800 },
                hiddenAgentIds: [],
                hiddenTeamIds: [],
                hiddenEditorIds: [],
                hiddenTerminalIds: [],
                packageLibraryOpen: false,
                assistantOpen: false,
                trackingOpen: false,
                terminalOpen: false,
            },
        } as StudioState)

        harness.get().toggleTeamVisibility('team-2')

        expect(harness.get().focusSnapshot).toMatchObject({
            nodeId: 'team-1',
            hiddenTeamIds: ['team-2'],
        })
        expect(harness.get().teams.find((entry) => entry.id === 'team-2')?.hidden).toBe(true)
    })

    it('preserves the active participant when selecting a different thread', () => {
        const threadTeam: WorkspaceTeamSnapshot = {
            id: 'team-1',
            name: 'Review Flow',
            position: { x: 0, y: 0 },
            width: 400,
            height: 300,
            participants: {
                alpha: {
                    agentRef: { kind: 'draft', draftId: 'agent-1' },
                    position: { x: 0, y: 0 },
                },
            },
            relations: [],
            createdAt: Date.now(),
        }

        const harness = createHarness({
            ...createBaseState(),
            teams: [threadTeam],
            selectedTeamId: 'team-1',
            activeThreadId: 'thread-1',
            activeThreadParticipantKey: 'alpha',
        } as StudioState)

        harness.get().selectThread('team-1', 'thread-2')
        expect(harness.get().activeThreadParticipantKey).toBe('alpha')

        harness.get().selectThreadParticipant(null)
        expect(harness.get().activeThreadParticipantKey).toBeNull()
    })

    it('reorders team participants without rewriting their bindings', () => {
        const harness = createHarness({
            ...createBaseState(),
            teams: [{
                id: 'team-1',
                name: 'Review Flow',
                position: { x: 0, y: 0 },
                width: 400,
                height: 300,
                participants: {
                    alpha: {
                        agentRef: { kind: 'draft', draftId: 'agent-1' },
                        displayName: 'Alpha',
                        position: { x: 0, y: 0 },
                    },
                    beta: {
                        agentRef: { kind: 'registry', urn: 'agent/@studio/beta' },
                        displayName: 'Beta',
                        position: { x: 100, y: 0 },
                    },
                    gamma: {
                        agentRef: { kind: 'registry', urn: 'agent/@studio/gamma' },
                        displayName: 'Gamma',
                        position: { x: 200, y: 0 },
                    },
                },
                relations: [],
                createdAt: Date.now(),
            }],
        } as StudioState)

        const originalBindings = harness.get().teams[0]?.participants
        harness.get().reorderTeamParticipants('team-1', ['gamma', 'alpha', 'beta'])

        const reorderedTeam = harness.get().teams.find((entry) => entry.id === 'team-1')
        expect(Object.keys(reorderedTeam?.participants || {})).toEqual(['gamma', 'alpha', 'beta'])
        expect(reorderedTeam?.participants.gamma).toBe(originalBindings?.gamma)
        expect(reorderedTeam?.participants.alpha).toBe(originalBindings?.alpha)
        expect(reorderedTeam?.participants.beta).toBe(originalBindings?.beta)
        expect(harness.get().workspaceDirty).toBe(true)
    })

    it('collapses opposite one-way duplicates when a relation is changed to both', () => {
        const harness = createHarness({
            ...createBaseState(),
            teams: [{
                id: 'team-1',
                name: 'Review Flow',
                position: { x: 0, y: 0 },
                width: 400,
                height: 300,
                participants: {
                    coder: {
                        agentRef: { kind: 'draft', draftId: 'agent-1' },
                        position: { x: 0, y: 0 },
                    },
                    reviewer: {
                        agentRef: { kind: 'registry', urn: 'agent/@studio/reviewer' },
                        position: { x: 100, y: 0 },
                    },
                },
                relations: [
                    {
                        id: 'rel-1',
                        between: ['coder', 'reviewer'],
                        direction: 'one-way',
                        name: 'request_review',
                        description: 'Coder asks for review',
                    },
                    {
                        id: 'rel-2',
                        between: ['reviewer', 'coder'],
                        direction: 'one-way',
                        name: 'return_feedback',
                        description: 'Reviewer returns feedback',
                    },
                ],
                createdAt: Date.now(),
            }],
        } as StudioState)

        harness.get().updateRelation('team-1', 'rel-1', { direction: 'both' })

        const team = harness.get().teams.find((entry) => entry.id === 'team-1')
        expect(team?.relations).toHaveLength(1)
        expect(team?.relations[0]).toMatchObject({
            id: 'rel-1',
            between: ['coder', 'reviewer'],
            direction: 'both',
        })
    })
})
