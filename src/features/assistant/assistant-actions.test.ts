import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createAgentNode } from '../../lib/agents-node'

let useStudioStore: typeof import('../../store').useStudioStore
let applyAssistantAction: typeof import('./assistant-actions').applyAssistantAction
let applyAssistantActions: typeof import('./assistant-actions').applyAssistantActions

const listPrimitivesMock = vi.fn().mockResolvedValue([])
const createDraftMock = vi.fn()
const updateDraftMock = vi.fn()
const deleteDraftMock = vi.fn()
const writeSkillBundleFileMock = vi.fn()
const deleteSkillBundleFileMock = vi.fn()
const deleteTeamRuntimeMock = vi.fn().mockResolvedValue({ ok: true })
const listTeamThreadsMock = vi.fn().mockResolvedValue({ threads: [] })

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

vi.mock('../../api-clients/drafts', () => ({
    draftApi: {
        create: createDraftMock,
        update: updateDraftMock,
        delete: deleteDraftMock,
        skillBundle: {
            writeFile: writeSkillBundleFileMock,
            deleteFile: deleteSkillBundleFileMock,
        },
    },
}))

vi.mock('../../api-clients/team-runtime', () => ({
    teamRuntimeApi: {
        deleteTeam: deleteTeamRuntimeMock,
        listThreads: listTeamThreadsMock,
    },
}))

beforeAll(async () => {
    vi.stubGlobal('localStorage', {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
    })

    ;({ useStudioStore } = await import('../../store'))
    ;({ applyAssistantAction } = await import('./assistant-actions'))
    ;({ applyAssistantActions } = await import('./assistant-actions'))
})

afterEach(() => {
    listPrimitivesMock.mockClear()
    createDraftMock.mockReset()
    updateDraftMock.mockReset()
    deleteDraftMock.mockReset()
    writeSkillBundleFileMock.mockReset()
    deleteSkillBundleFileMock.mockReset()
    deleteTeamRuntimeMock.mockReset().mockResolvedValue({ ok: true })
    listTeamThreadsMock.mockReset().mockResolvedValue({ threads: [] })
    useStudioStore.setState({
        agents: [],
        teams: [],
        drafts: {},
        teamThreads: {},
        workspaceDirty: false,
        workingDir: '',
        selectedTeamId: null,
        selectedAgentId: null,
        selectedMarkdownEditorId: null,
        markdownEditors: [],
        editingTarget: null,
        teamEditorState: null,
        activeThreadId: null,
        activeThreadParticipantKey: null,
        isPackageLibraryOpen: false,
        isTrackingOpen: false,
        isTerminalOpen: false,
        canvasRevealTarget: null,
    })
})

describe('assistant-actions', () => {
    it('creates, updates, and deletes an instruction draft through draft CRUD actions', async () => {
        createDraftMock.mockResolvedValue({
            id: 'instruction-draft-1',
            kind: 'instruction',
            name: 'Reviewer Instruction',
            content: '# Role',
            updatedAt: Date.now(),
        })
        updateDraftMock.mockResolvedValue({
            id: 'instruction-draft-1',
            kind: 'instruction',
            name: 'Senior Reviewer Instruction',
            content: '# Updated Role',
            updatedAt: Date.now(),
        })

        const result = await applyAssistantActions([
            {
                type: 'createInstructionDraft',
                ref: 'reviewer-instruction',
                name: 'Reviewer Instruction',
                content: '# Role',
            },
            {
                type: 'updateInstructionDraft',
                draftRef: 'reviewer-instruction',
                name: 'Senior Reviewer Instruction',
                content: '# Updated Role',
            },
            {
                type: 'deleteInstructionDraft',
                draftRef: 'reviewer-instruction',
            },
        ])

        expect(result).toEqual({ applied: 3, failed: 0 })
        expect(updateDraftMock).toHaveBeenCalledWith('instruction', 'instruction-draft-1', {
            name: 'Senior Reviewer Instruction',
            content: '# Updated Role',
        })
        expect(deleteDraftMock).toHaveBeenCalledWith('instruction', 'instruction-draft-1')
        expect(useStudioStore.getState().drafts).toEqual({})
    })

    it('updates and deletes a saved skill draft through draft CRUD actions', async () => {
        useStudioStore.setState({
            drafts: {
                'skill-draft-1': {
                    id: 'skill-draft-1',
                    kind: 'skill',
                    name: 'Review Skill',
                    content: '---\nname: review-skill\n---',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    saveState: 'saved',
                },
            },
        })
        updateDraftMock.mockResolvedValue({
            id: 'skill-draft-1',
            kind: 'skill',
            name: 'Updated Review Skill',
            content: '---\nname: updated-review-skill\n---',
            updatedAt: Date.now(),
        })

        const result = await applyAssistantActions([
            {
                type: 'updateSkillDraft',
                draftId: 'skill-draft-1',
                name: 'Updated Review Skill',
                content: '---\nname: updated-review-skill\n---',
            },
            {
                type: 'deleteSkillDraft',
                draftId: 'skill-draft-1',
            },
        ])

        expect(result).toEqual({ applied: 2, failed: 0 })
        expect(updateDraftMock).toHaveBeenCalledWith('skill', 'skill-draft-1', {
            name: 'Updated Review Skill',
            content: '---\nname: updated-review-skill\n---',
        })
        expect(deleteDraftMock).toHaveBeenCalledWith('skill', 'skill-draft-1')
        expect(useStudioStore.getState().drafts).toEqual({})
    })

    it('updates participant subscriptions using agent-name locators', async () => {
        useStudioStore.setState({
            agents: [
                createAgentNode({
                    id: 'agent-researcher',
                    name: 'Researcher',
                    x: 0,
                    y: 0,
                }),
                createAgentNode({
                    id: 'agent-writer',
                    name: 'Writer',
                    x: 0,
                    y: 0,
                }),
            ],
            teams: [
                {
                    id: 'team-1',
                    name: 'Research Flow',
                    position: { x: 0, y: 0 },
                    width: 400,
                    height: 300,
                    createdAt: Date.now(),
                    participants: {
                        'participant-researcher': {
                            agentRef: { kind: 'draft', draftId: 'agent-researcher' },
                            position: { x: 0, y: 0 },
                        },
                        'participant-writer': {
                            agentRef: { kind: 'draft', draftId: 'agent-writer' },
                            position: { x: 100, y: 0 },
                        },
                    },
                    relations: [],
                },
            ],
            teamThreads: {},
        })

        const result = await applyAssistantAction({
            type: 'updateParticipantSubscriptions',
            teamId: 'team-1',
            agentName: 'Writer',
            subscriptions: {
                messagesFromAgentNames: ['Researcher'],
                messageTags: ['handoff'],
                callboardKeys: ['brief'],
                eventTypes: ['runtime.idle'],
            },
        })

        expect(result.success).toBe(true)
        expect(useStudioStore.getState().teams[0].participants['participant-writer'].subscriptions).toEqual({
            messagesFrom: ['participant-researcher'],
            messageTags: ['handoff'],
            callboardKeys: ['brief'],
            eventTypes: ['runtime.idle'],
        })
    })

    it('creates and updates an agent through Workspace CRUD actions', async () => {
        const result = await applyAssistantActions([
            {
                type: 'createAgent',
                ref: 'writer',
                name: 'Writer',
                model: { provider: 'openai', modelId: 'gpt-5.4' },
                modelVariant: 'reasoning-high',
            },
            {
                type: 'updateAgent',
                agentRef: 'writer',
                name: 'Senior Writer',
                model: { provider: 'anthropic', modelId: 'claude-sonnet-4' },
                modelVariant: 'thinking-deep',
            },
        ])

        expect(result).toEqual({ applied: 2, failed: 0 })

        const agent = useStudioStore.getState().agents[0]
        expect(agent?.name).toBe('Senior Writer')
        expect(agent?.model).toEqual({ provider: 'anthropic', modelId: 'claude-sonnet-4' })
        expect(agent?.modelVariant).toBe('thinking-deep')
    })

    it('deletes an agent and removes attached team bindings', async () => {
        const agentId = useStudioStore.getState().addAgent('Reviewer')
        const teamId = useStudioStore.getState().addTeam('Code Review')
        const participantKey = useStudioStore.getState().attachAgentToTeam(teamId, agentId)

        expect(participantKey).toBeTruthy()

        const result = await applyAssistantAction({
            type: 'deleteAgent',
            agentId,
        })

        expect(result.success).toBe(true)
        expect(useStudioStore.getState().agents).toHaveLength(0)
        expect(useStudioStore.getState().teams[0]?.participants).toEqual({})
    })

    it('fails cleanly when agent or team CRUD targets do not exist', async () => {
        const agentResult = await applyAssistantAction({
            type: 'updateAgent',
            agentName: 'Missing Agent',
            name: 'Still Missing',
        })
        const teamResult = await applyAssistantAction({
            type: 'deleteTeam',
            teamName: 'Missing Team',
        })

        expect(agentResult.success).toBe(false)
        expect(teamResult.success).toBe(false)
    })

    it('creates and updates a team from same-call agent refs', async () => {
        const result = await applyAssistantActions([
            {
                type: 'createAgent',
                ref: 'dev',
                name: 'Developer',
            },
            {
                type: 'createAgent',
                ref: 'rev',
                name: 'Reviewer',
            },
            {
                type: 'createTeam',
                ref: 'review-team',
                name: 'Code Review',
                description: 'Initial review flow.',
                participantAgentRefs: ['dev', 'rev'],
                relations: [
                    {
                        sourceAgentRef: 'dev',
                        targetAgentRef: 'rev',
                        direction: 'one-way',
                        name: 'request review',
                        description: 'Developer sends work to Reviewer.',
                    },
                ],
            },
            {
                type: 'updateTeam',
                teamRef: 'review-team',
                description: 'Updated review flow.',
                teamRules: ['Escalate blockers quickly.'],
            },
        ])

        expect(result).toEqual({ applied: 4, failed: 0 })

        const team = useStudioStore.getState().teams[0]
        expect(team?.name).toBe('Code Review')
        expect(team?.description).toBe('Updated review flow.')
        expect(team?.teamRules).toEqual(['Escalate blockers quickly.'])
        expect(Object.keys(team?.participants || {})).toHaveLength(2)
        expect(team?.relations).toHaveLength(1)
        expect(team?.relations[0]).toMatchObject({
            direction: 'one-way',
            name: 'request review',
            description: 'Developer sends work to Reviewer.',
        })

        const agents = useStudioStore.getState().agents.map((agent) => ({
            x: agent.position.x,
            y: agent.position.y,
            width: agent.width || 320,
            height: agent.height || 400,
        }))
        const teamRect = {
            x: team!.position.x,
            y: team!.position.y,
            width: team!.width,
            height: team!.height,
        }

        expect(agents.every((agent) => agent.y < teamRect.y)).toBe(true)
        expect(overlaps(agents[0], agents[1])).toBe(false)
        expect(agents.every((agent) => overlaps(agent, teamRect) === false)).toBe(true)
        expect(useStudioStore.getState().canvasRevealTarget).toMatchObject({
            id: team!.id,
            type: 'team',
        })
    })

    it('applies agent descriptions and team safety settings', async () => {
        const result = await applyAssistantActions([
            {
                type: 'createAgent',
                ref: 'macro_analyst',
                name: 'Macro Analyst',
                description: 'Tracks regime changes and hands off evidence-backed context.',
            },
            {
                type: 'createAgent',
                ref: 'equity_researcher',
                name: 'Equity Researcher',
            },
            {
                type: 'createTeam',
                name: 'Investment Analyst Team',
                safety: {
                    threadTimeoutMs: 600000,
                    loopDetectionThreshold: 3,
                },
                participantAgentRefs: ['macro_analyst', 'equity_researcher'],
                relations: [
                    {
                        sourceAgentRef: 'macro_analyst',
                        targetAgentRef: 'equity_researcher',
                        direction: 'one-way',
                        name: 'macro handoff',
                        description: 'Macro Analyst hands regime context to Equity Researcher.',
                    },
                ],
            },
        ])

        expect(result).toEqual({ applied: 3, failed: 0 })

        const team = useStudioStore.getState().teams[0]
        const agent = useStudioStore.getState().agents.find((entry) => entry.name === 'Macro Analyst')
        expect(agent?.meta?.authoring?.description).toBe('Tracks regime changes and hands off evidence-backed context.')
        expect(team?.name).toBe('Investment Analyst Team')
        expect(team?.safety).toEqual({
            threadTimeoutMs: 600000,
            loopDetectionThreshold: 3,
        })
        expect(Object.keys(team?.participants || {})).toHaveLength(2)
        expect(team?.relations).toHaveLength(1)
        expect(team?.relations[0]).toMatchObject({
            direction: 'one-way',
            name: 'macro handoff',
            description: 'Macro Analyst hands regime context to Equity Researcher.',
        })
    })

    it('fails to create a relation when name or description is missing', async () => {
        const result = await applyAssistantActions([
            {
                type: 'createAgent',
                ref: 'macro_analyst',
                name: 'Macro Analyst',
            },
            {
                type: 'createAgent',
                ref: 'equity_researcher',
                name: 'Equity Researcher',
            },
            {
                type: 'createTeam',
                name: 'Investment Analyst Team',
                participantAgentRefs: ['macro_analyst', 'equity_researcher'],
                relations: [
                    {
                        sourceAgentRef: 'macro_analyst',
                        targetAgentRef: 'equity_researcher',
                        direction: 'one-way',
                        name: 'macro handoff',
                        description: '',
                    },
                ],
            },
        ])

        expect(result).toEqual({ applied: 2, failed: 1 })

        expect(useStudioStore.getState().teams).toHaveLength(0)
    })

    it('deletes a team by name', async () => {
        useStudioStore.getState().addTeam('Code Review')

        const result = await applyAssistantAction({
            type: 'deleteTeam',
            teamName: 'Code Review',
        })

        expect(result.success).toBe(true)
        expect(useStudioStore.getState().teams).toHaveLength(0)
    })

    it('creates a skill draft and writes bundle files using same-call draft refs', async () => {
        createDraftMock.mockResolvedValue({
            id: 'skill-draft-1',
            kind: 'skill',
            name: 'Review Skill',
            content: '---\nname: review-skill\n---',
            updatedAt: Date.now(),
        })

        const result = await applyAssistantActions([
            {
                type: 'createSkillDraft',
                ref: 'skill',
                name: 'Review Skill',
                content: '---\nname: review-skill\n---',
            },
            {
                type: 'upsertSkillBundleFile',
                draftRef: 'skill',
                path: 'references/checklist.md',
                content: '# Checklist',
            },
            {
                type: 'upsertSkillBundleFile',
                draftRef: 'skill',
                path: 'agents/openai.yaml',
                content: 'display_name: Review Skill',
            },
        ])

        expect(result).toEqual({ applied: 3, failed: 0 })
        expect(writeSkillBundleFileMock).toHaveBeenNthCalledWith(1, 'skill-draft-1', 'references/checklist.md', '# Checklist')
        expect(writeSkillBundleFileMock).toHaveBeenNthCalledWith(2, 'skill-draft-1', 'agents/openai.yaml', 'display_name: Review Skill')
    })

    it('deletes Skill folder entries for saved drafts', async () => {
        useStudioStore.setState({
            drafts: {
                'skill-draft-1': {
                    id: 'skill-draft-1',
                    kind: 'skill',
                    name: 'Review Skill',
                    content: '---\nname: review-skill\n---',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    saveState: 'saved',
                },
            },
        })

        const result = await applyAssistantAction({
            type: 'deleteSkillBundleEntry',
            draftId: 'skill-draft-1',
            path: 'scripts\\old-helper.sh',
        })

        expect(result.success).toBe(true)
        expect(deleteSkillBundleFileMock).toHaveBeenCalledWith('skill-draft-1', 'scripts/old-helper.sh')
    })

    it('fails cleanly for unsaved skill drafts before calling bundle APIs', async () => {
        useStudioStore.setState({
            drafts: {
                'skill-draft-1': {
                    id: 'skill-draft-1',
                    kind: 'skill',
                    name: 'Unsaved Skill',
                    content: '---\nname: unsaved-skill\n---',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    saveState: 'unsaved',
                },
            },
        })

        const result = await applyAssistantAction({
            type: 'upsertSkillBundleFile',
            draftId: 'skill-draft-1',
            path: 'references/checklist.md',
            content: '# Checklist',
        })

        expect(result.success).toBe(false)
        expect(writeSkillBundleFileMock).not.toHaveBeenCalled()
    })

    it('applies Studio UI operations for nodes, drafts, panels, and canvas frames', async () => {
        const agentId = useStudioStore.getState().addAgent('Writer')
        const teamId = useStudioStore.getState().addTeam('Review Flow')
        useStudioStore.setState({
            drafts: {
                'instruction-draft-1': {
                    id: 'instruction-draft-1',
                    kind: 'instruction',
                    name: 'Writer Instruction',
                    content: '# Writer',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    saveState: 'saved',
                },
            },
        })

        const result = await applyAssistantActions([
            { type: 'showAgent', agentId, surface: 'editor', editorFocus: 'model' },
            { type: 'showTeam', teamId, surface: 'editor', editorMode: 'team' },
            { type: 'showDraft', draftId: 'instruction-draft-1', kind: 'instruction' },
            { type: 'setStudioPanel', panel: 'packages', open: true },
            {
                type: 'setStudioNodeVisibility',
                nodeType: 'agent',
                agentId,
                visible: false,
            },
            {
                type: 'setStudioNodeFrame',
                nodeType: 'team',
                teamId,
                position: { x: 320, y: 240 },
                size: { width: 520, height: 460 },
            },
        ])

        expect(result).toEqual({ applied: 6, failed: 0 })
        const state = useStudioStore.getState()
        expect(state.editingTarget).toEqual(null)
        expect(state.teamEditorState).toMatchObject({ teamId: teamId, mode: 'team' })
        expect(state.selectedMarkdownEditorId).toBeTruthy()
        expect(state.markdownEditors[0]).toMatchObject({ draftId: 'instruction-draft-1', kind: 'instruction' })
        expect(state.isPackageLibraryOpen).toBe(true)
        expect(state.agents.find((entry) => entry.id === agentId)?.hidden).toBe(true)
        expect(state.teams.find((entry) => entry.id === teamId)).toMatchObject({
            position: { x: 320, y: 240 },
            width: 520,
            height: 460,
        })
        expect(state.canvasRevealTarget).toMatchObject({ id: teamId, type: 'team' })
    })
})
