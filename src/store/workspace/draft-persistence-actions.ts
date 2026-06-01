import type { DraftPrimitive } from '../../lib/primitive-types'
import { draftApi } from '../../api-clients/drafts'
import type { StudioState } from '../types'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

export function upsertDraftImpl(
    get: GetState,
    set: SetState,
    scheduleDraftPersist: (draftId: string, fn: () => void, delay?: number) => void,
    draft: DraftPrimitive,
) {
    set((state: StudioState) => ({
        drafts: {
            ...state.drafts,
            [draft.id]: draft,
        },
        workspaceDirty: true,
    }))
    get().recordStudioChange({ kind: 'draft', draftIds: [draft.id] })

    if (draft.saveState === 'unsaved') {
        return
    }

    scheduleDraftPersist(draft.id, () => {
        const current = get().drafts[draft.id]
        if (!current) return
        draftApi.update(current.kind, draft.id, {
            name: current.name,
            content: current.content,
            slug: current.slug,
            description: current.description,
            tags: current.tags,
            derivedFrom: current.derivedFrom,
        }).catch((error) => {
            console.warn('Failed to persist draft to disk', error)
        })
    })
}

export async function saveMarkdownDraftImpl(
    get: GetState,
    set: SetState,
    editorId: string,
): Promise<DraftPrimitive> {
    const editor = get().markdownEditors.find((entry) => entry.id === editorId)
    if (!editor) {
        throw new Error('Markdown editor not found.')
    }

    const draft = get().drafts[editor.draftId]
    if (!draft) {
        throw new Error('Draft not found.')
    }
    if ((editor.kind !== 'instruction' && editor.kind !== 'skill') || (draft.kind !== 'instruction' && draft.kind !== 'skill')) {
        throw new Error('Markdown draft kind mismatch.')
    }
    if (!draft.name.trim()) {
        throw new Error('Draft name is required.')
    }
    if (typeof draft.content !== 'string') {
        throw new Error('Markdown draft content must be text.')
    }

    const payload = {
        id: draft.id,
        name: draft.name,
        content: draft.content,
        slug: draft.slug,
        description: draft.description,
        tags: draft.tags,
        derivedFrom: draft.derivedFrom,
    }

    const saved = draft.kind === 'instruction'
        ? draft.saveState === 'saved'
            ? await draftApi.update('instruction', draft.id, payload)
            : await draftApi.create({ ...payload, kind: 'instruction' })
        : draft.saveState === 'saved'
            ? await draftApi.update('skill', draft.id, payload)
            : await draftApi.create({ ...payload, kind: 'skill' })

    const nextDraft: DraftPrimitive = {
        ...saved,
        saveState: 'saved',
    }

    set((state: StudioState) => ({
        drafts: {
            ...state.drafts,
            [saved.id]: nextDraft,
        },
        markdownEditors: state.markdownEditors.map((entry) => (
            entry.id !== editorId
                ? entry
                : {
                    ...entry,
                    draftId: saved.id,
                    baseline: {
                        name: nextDraft.name,
                        slug: nextDraft.slug || '',
                        description: nextDraft.description || '',
                        tags: nextDraft.tags || [],
                        content: typeof nextDraft.content === 'string' ? nextDraft.content : '',
                    },
                }
        )),
        workspaceDirty: true,
    }))
    get().recordStudioChange({ kind: 'draft', draftIds: [saved.id] })

    return nextDraft
}

export async function saveAgentAsDraftImpl(get: GetState, set: SetState, agentId: string) {
    const agent = get().agents.find((item) => item.id === agentId)
    if (!agent) return
    const description = agent.meta?.authoring?.description || agent.name

    const draftContent = {
        agentBody: agent.agentBody || null,
        skillRefs: agent.skillRefs || [],
        model: agent.model || null,
        modelVariant: agent.modelVariant || null,
        mcpServerNames: agent.mcpServerNames || [],
        mcpBindingMap: agent.mcpBindingMap || {},
        planMode: agent.planMode || false,
        runtimeAgentId: agent.runtimeAgentId || null,
    }

    try {
        const draft = await draftApi.create({
            kind: 'agent',
            name: agent.name,
            content: draftContent,
            description,
        })

        set((state: StudioState) => ({
            drafts: {
                ...state.drafts,
                [draft.id]: draft,
            },
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'draft', draftIds: [draft.id] })
    } catch (error) {
        console.error('Failed to save agent as draft', error)
    }
}

export async function loadDraftsFromDiskImpl(set: SetState) {
    try {
        const drafts = await draftApi.list()
        const draftsMap: Record<string, DraftPrimitive> = {}
        for (const draft of drafts) {
            draftsMap[draft.id] = draft
        }
        set({ drafts: draftsMap })
    } catch (error) {
        console.warn('Failed to load drafts from disk', error)
    }
}

export async function saveTeamAsDraftImpl(get: GetState, set: SetState, teamId: string) {
    const team = get().teams.find((entry) => entry.id === teamId)
    if (!team) return

    const draftContent = {
        description: team.description,
        teamRules: team.teamRules,
        participants: Object.fromEntries(
            Object.entries(team.participants).map(([key, participant]) => [key, {
                agentRef: participant.agentRef,
                displayName: participant.displayName,
                subscriptions: participant.subscriptions,
                position: participant.position,
            }]),
        ),
        relations: team.relations.map((relation) => ({
            id: relation.id,
            between: relation.between,
            direction: relation.direction,
            name: relation.name,
            description: relation.description,
        })),
        safety: team.safety,
        position: team.position,
        width: team.width,
        height: team.height,
        hidden: team.hidden,
        meta: team.meta,
    }

    try {
        const draft = await draftApi.create({
            kind: 'team',
            name: team.name,
            content: draftContent,
            description: team.meta?.authoring?.description || team.name,
        })

        set((state: StudioState) => ({
            drafts: {
                ...state.drafts,
                [draft.id]: draft,
            },
            workspaceDirty: true,
        }))
        get().recordStudioChange({ kind: 'draft', draftIds: [draft.id] })
    } catch (error) {
        console.error('Failed to save team as draft', error)
    }
}
