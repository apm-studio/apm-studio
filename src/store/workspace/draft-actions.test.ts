import type { DraftPrimitive } from '../../lib/primitive-types'
import { describe, expect, it, vi } from 'vitest'
import { buildDraftPackageCards } from '../../components/panels/package-library-authoring'
import { draftApi } from '../../api-clients/drafts'

import type { StudioState } from '../types'
import { createMarkdownEditorImpl, openDraftEditorImpl } from './markdown-editor-actions'
import { saveMarkdownDraftImpl, upsertDraftImpl } from './draft-persistence-actions'

function createDraftState(): StudioState {
    return {
        drafts: {},
        markdownEditors: [],
        agents: [],
        teams: [],
        workingDir: '',
        workspaceId: null,
        workspaceList: [],
        workspaceDirty: false,
        runtimeReloadPending: false,
        theme: 'light',
        isTerminalOpen: false,
        isTrackingOpen: false,
        isPackageLibraryOpen: false,
        canvasTerminals: [],
        canvasCenter: null,
        layoutTeamId: null,
        editingTarget: null,
        selectedAgentId: null,
        selectedAgentSessionId: null,
        selectedMarkdownEditorId: null,
        focusSnapshot: null,
        canvasRevealTarget: null,
        inspectorFocus: null,
        chatDrafts: {},
        chatPrefixes: {},
        activeChatAgentId: null,
        sessions: [],
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
        selectedTeamId: null,
        teamEditorState: null,
        teamThreads: {},
        activeThreadId: null,
        activeThreadParticipantKey: null,
        isAssistantOpen: false,
        assistantModel: null,
        assistantAvailableModels: [],
        appliedAssistantActionMessageIds: {},
        assistantActionResults: {},
        recordStudioChange: () => {},
    } as unknown as StudioState
}

function createHarness(initialState = createDraftState()) {
    let state = initialState
    return {
        get: () => state,
        set: (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
            const nextPartial = typeof partial === 'function' ? partial(state) : partial
            state = { ...state, ...nextPartial }
        },
        read: () => state,
    }
}

describe('instruction draft lifecycle', () => {
    it('creates new instruction editor drafts as local-only until first save', () => {
        const harness = createHarness()
        const counter = { value: 0 }

        createMarkdownEditorImpl(
            harness.get,
            harness.set,
            counter,
            (prefix) => `${prefix}-1`,
            'instruction',
        )

        const draft = harness.read().drafts['instruction-draft-1'] as DraftPrimitive
        expect(draft).toBeTruthy()
        expect(draft.saveState).toBe('unsaved')
    })

    it('does not auto-persist unsaved instruction drafts', () => {
        const harness = createHarness()
        const scheduleDraftPersist = vi.fn()

        upsertDraftImpl(harness.get, harness.set, scheduleDraftPersist, {
            id: 'instruction-draft-1',
            kind: 'instruction',
            name: 'Unsaved Instruction',
            content: '# Instruction',
            createdAt: 1,
            updatedAt: Date.now(),
            saveState: 'unsaved',
        })

        expect(scheduleDraftPersist).not.toHaveBeenCalled()
    })

    it('auto-persists instruction drafts after the first explicit save', () => {
        const harness = createHarness()
        const scheduleDraftPersist = vi.fn()

        upsertDraftImpl(harness.get, harness.set, scheduleDraftPersist, {
            id: 'instruction-draft-1',
            kind: 'instruction',
            name: 'Saved Instruction',
            content: '# Instruction',
            createdAt: 1,
            updatedAt: Date.now(),
            saveState: 'saved',
        })

        expect(scheduleDraftPersist).toHaveBeenCalledTimes(1)
    })

    it('promotes markdown drafts to saved state on first explicit save', async () => {
        const harness = createHarness()
        const counter = { value: 0 }

        createMarkdownEditorImpl(
            harness.get,
            harness.set,
            counter,
            (prefix) => `${prefix}-1`,
            'skill',
        )

        const createSpy = vi.spyOn(draftApi, 'create').mockResolvedValue({
            id: 'skill-draft-1',
            kind: 'skill',
            name: 'New Skill',
            content: 'skill body',
            slug: 'new-skill',
            description: 'New Skill',
            tags: [],
            derivedFrom: null,
            createdAt: 123,
            updatedAt: 123,
            saveState: 'saved',
        })

        const editorId = harness.read().markdownEditors[0]?.id
        expect(editorId).toBeTruthy()

        const saved = await saveMarkdownDraftImpl(harness.get, harness.set, editorId!)
        expect(saved.saveState).toBe('saved')
        expect(harness.read().drafts['skill-draft-1']?.saveState).toBe('saved')

        createSpy.mockRestore()
    })

    it('keeps unsaved instruction drafts out of the package library', () => {
        const cards = buildDraftPackageCards({
            hidden: {
                id: 'hidden',
                kind: 'instruction',
                name: 'Unsaved Instruction',
                content: '# Instruction',
                createdAt: 1,
                updatedAt: 1,
                saveState: 'unsaved',
            },
            visible: {
                id: 'visible',
                kind: 'instruction',
                name: 'Saved Instruction',
                content: '# Instruction',
                createdAt: 2,
                updatedAt: 2,
                saveState: 'saved',
            },
        }, 'instruction')

        expect(cards).toHaveLength(1)
        expect(cards[0]?.draftId).toBe('visible')
    })

    it('opens saved instruction drafts near the current canvas center', () => {
        const harness = createHarness({
            ...createDraftState(),
            canvasCenter: { x: 2400, y: 1800 },
            drafts: {
                'instruction-draft-1': {
                    id: 'instruction-draft-1',
                    kind: 'instruction',
                    name: 'Saved Instruction',
                    content: '# Instruction',
                    createdAt: 1,
                    updatedAt: 1,
                    saveState: 'saved',
                },
            },
        })
        const counter = { value: 0 }

        const editorId = openDraftEditorImpl(harness.get, harness.set, counter, 'instruction-draft-1')

        expect(editorId).toBe('markdown-editor-1')
        expect(harness.read().markdownEditors[0]).toMatchObject({
            id: 'markdown-editor-1',
            draftId: 'instruction-draft-1',
            position: { x: 2120, y: 1610 },
            hidden: false,
        })
        expect(harness.read().canvasRevealTarget).toMatchObject({
            id: 'markdown-editor-1',
            type: 'markdownEditor',
        })
    })

    it('reveals an already-open instruction draft editor from the package library edit action', () => {
        const harness = createHarness({
            ...createDraftState(),
            drafts: {
                'instruction-draft-1': {
                    id: 'instruction-draft-1',
                    kind: 'instruction',
                    name: 'Saved Instruction',
                    content: '# Instruction',
                    createdAt: 1,
                    updatedAt: 1,
                    saveState: 'saved',
                },
            },
            markdownEditors: [{
                id: 'markdown-editor-7',
                kind: 'instruction',
                position: { x: -1200, y: -900 },
                width: 560,
                height: 380,
                draftId: 'instruction-draft-1',
                baseline: null,
                hidden: true,
            }],
        })
        const counter = { value: 7 }

        const editorId = openDraftEditorImpl(harness.get, harness.set, counter, 'instruction-draft-1')

        expect(editorId).toBe('markdown-editor-7')
        expect(harness.read().selectedMarkdownEditorId).toBe('markdown-editor-7')
        expect(harness.read().markdownEditors[0]?.hidden).toBe(false)
        expect(harness.read().canvasRevealTarget).toMatchObject({
            id: 'markdown-editor-7',
            type: 'markdownEditor',
        })
    })
})
