import type { WorkspaceMarkdownEditorNode } from '../../../shared/workspace-contracts'
import type { StudioState } from '../types'
import { buildCanvasViewResetState, buildExitFocusModeState } from './focus-mode-state'
import { defaultMarkdownContent, resolveCanvasSpawnPosition } from './helpers'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

export function createMarkdownEditorImpl(
    get: GetState,
    set: SetState,
    markdownEditorIdCounter: { value: number },
    makeId: (prefix: string) => string,
    kind: 'instruction' | 'skill',
    options?: {
        source?: {
            name?: string
            slug?: string
            description?: string
            tags?: string[]
            content?: string
            derivedFrom?: string | null | undefined
        }
        position?: { x: number; y: number }
        attachTarget?: WorkspaceMarkdownEditorNode['attachTarget']
    },
) {
    markdownEditorIdCounter.value++
    const editorId = `markdown-editor-${markdownEditorIdCounter.value}`
    const draftId = makeId(`${kind}-draft`)
    const source = options?.source
    const name = source?.name || (kind === 'instruction' ? 'New Instruction' : 'New Skill')
    const slug = source?.slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const description = source?.description || name
    const tags = source?.tags || []
    const content = source?.content || defaultMarkdownContent(kind)
    const now = Date.now()
    const position = options?.position || resolveCanvasSpawnPosition({
        canvasCenter: get().canvasCenter,
        existingCount: get().markdownEditors.length,
        width: 560,
        height: 380,
    })

    set((state: StudioState) => {
        const focusExit = buildExitFocusModeState(state)
        const markdownEditors = (focusExit?.markdownEditors as StudioState['markdownEditors'] | undefined) || state.markdownEditors

        return {
            ...(focusExit || buildCanvasViewResetState(state.splitView)),
            drafts: {
                ...state.drafts,
                [draftId]: {
                    id: draftId,
                    kind,
                    name,
                    slug,
                    description,
                    tags,
                    content,
                    derivedFrom: source?.derivedFrom || undefined,
                    createdAt: now,
                    updatedAt: now,
                    saveState: 'unsaved',
                },
            },
            markdownEditors: [
                ...markdownEditors,
                {
                    id: editorId,
                    kind,
                    position,
                    width: 560,
                    height: 380,
                    draftId,
                    baseline: source ? {
                        name,
                        slug,
                        description,
                        tags,
                        content,
                    } : null,
                    attachTarget: options?.attachTarget || null,
                    hidden: false,
                },
            ],
            selectedMarkdownEditorId: editorId,
            selectedAgentId: null,
            selectedAgentSessionId: null,
            canvasRevealTarget: {
                id: editorId,
                type: 'markdownEditor',
                nonce: (state.canvasRevealTarget?.nonce || 0) + 1,
            },
            inspectorFocus: null,
            workspaceDirty: true,
        }
    })
    get().recordStudioChange({ kind: 'draft', draftIds: [draftId] })

    return editorId
}

export function openDraftEditorImpl(
    get: GetState,
    set: SetState,
    markdownEditorIdCounter: { value: number },
    draftId: string,
) {
    const existing = get().markdownEditors.find((editor) => editor.draftId === draftId)
    if (existing) {
        set((state: StudioState) => {
            const focusExit = buildExitFocusModeState(state)
            const markdownEditors = (focusExit?.markdownEditors as StudioState['markdownEditors'] | undefined) || state.markdownEditors

            return {
                ...(focusExit || buildCanvasViewResetState(state.splitView)),
                markdownEditors: markdownEditors.map((entry) => (
                    entry.id === existing.id
                        ? { ...entry, hidden: false }
                        : entry
                )),
                selectedMarkdownEditorId: existing.id,
                selectedAgentId: null,
                selectedAgentSessionId: null,
                canvasRevealTarget: {
                    id: existing.id,
                    type: 'markdownEditor',
                    nonce: (state.canvasRevealTarget?.nonce || 0) + 1,
                },
                inspectorFocus: null,
            }
        })
        return existing.id
    }

    const draft = get().drafts[draftId]
    if (!draft) return null

    const kind = draft.kind as 'instruction' | 'skill'
    if (kind !== 'instruction' && kind !== 'skill') return null

    markdownEditorIdCounter.value++
    const editorId = `markdown-editor-${markdownEditorIdCounter.value}`
    const content = typeof draft.content === 'string' ? draft.content : ''

    set((state: StudioState) => {
        const focusExit = buildExitFocusModeState(state)
        const markdownEditors = (focusExit?.markdownEditors as StudioState['markdownEditors'] | undefined) || state.markdownEditors
        const position = resolveCanvasSpawnPosition({
            canvasCenter: state.canvasCenter,
            existingCount: markdownEditors.length,
            width: 560,
            height: 380,
        })

        return {
            ...(focusExit || buildCanvasViewResetState(state.splitView)),
            markdownEditors: [
                ...markdownEditors,
                {
                    id: editorId,
                    kind,
                    position,
                    width: 560,
                    height: 380,
                    draftId,
                    baseline: {
                        name: draft.name,
                        slug: draft.slug || '',
                        description: draft.description || '',
                        tags: draft.tags || [],
                        content,
                    },
                    attachTarget: null,
                    hidden: false,
                },
            ],
            selectedMarkdownEditorId: editorId,
            selectedAgentId: null,
            selectedAgentSessionId: null,
            canvasRevealTarget: {
                id: editorId,
                type: 'markdownEditor',
                nonce: (state.canvasRevealTarget?.nonce || 0) + 1,
            },
            inspectorFocus: null,
            workspaceDirty: true,
        }
    })

    return editorId
}
