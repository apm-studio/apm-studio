import { describe, expect, it } from 'vitest'
import type { DraftPrimitive } from '../../lib/primitive-types'
import {
    buildMarkdownDraftUpdate,
    buildMarkdownEditorState,
    buildSavedDraftAttachPlan,
    isMarkdownEditorDirty,
} from './markdown-editor-state'

describe('markdown editor state', () => {
    const draft: DraftPrimitive = {
        id: 'draft-1',
        kind: 'instruction',
        name: 'API Designer',
        slug: '',
        content: '# Guide',
        description: 'Design APIs',
        tags: ['api'],
        createdAt: 1,
        updatedAt: 2,
        saveState: 'unsaved',
    }

    it('normalizes editor state from draft metadata', () => {
        expect(buildMarkdownEditorState(draft)).toEqual({
            name: 'API Designer',
            slug: 'api-designer',
            description: 'Design APIs',
            tags: ['api'],
            content: '# Guide',
        })
    })

    it('detects baseline changes without React state', () => {
        const state = buildMarkdownEditorState(draft)

        expect(isMarkdownEditorDirty({
            name: 'API Designer',
            slug: 'api-designer',
            description: 'Design APIs',
            tags: ['api'],
            content: '# Guide',
        }, state)).toBe(false)

        expect(isMarkdownEditorDirty({
            name: 'API Designer',
            slug: 'api-designer',
            description: 'Design APIs',
            tags: ['design'],
            content: '# Guide',
        }, state)).toBe(true)
    })

    it('builds draft updates without mutating the original draft', () => {
        const next = buildMarkdownDraftUpdate(draft, {
            name: 'Next',
            slug: 'next',
            description: 'Updated',
            tags: ['next'],
            content: 'Body',
        }, 30)

        expect(next).toMatchObject({
            id: 'draft-1',
            name: 'Next',
            slug: 'next',
            description: 'Updated',
            tags: ['next'],
            content: 'Body',
            updatedAt: 30,
        })
        expect(draft.name).toBe('API Designer')
    })

    it('plans saved draft attachment by target mode', () => {
        expect(buildSavedDraftAttachPlan({
            agentId: 'agent-1',
            mode: 'skill-new',
        }, 'draft-1')).toEqual({
            kind: 'skill-add',
            agentId: 'agent-1',
            draftId: 'draft-1',
        })

        expect(buildSavedDraftAttachPlan({
            agentId: 'agent-1',
            mode: 'skill-replace',
            targetRef: { kind: 'draft', draftId: 'old-draft' },
        }, 'draft-2')).toEqual({
            kind: 'skill-replace',
            agentId: 'agent-1',
            draftId: 'draft-2',
            targetRef: { kind: 'draft', draftId: 'old-draft' },
        })
    })
})
