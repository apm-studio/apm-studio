import type {
    AgentDraftContent,
    DraftDeletePreviewResponse,
    DraftDependencyPlanItem,
    DraftFile,
    DraftKind,
    TeamDraftContent,
} from '../../../shared/draft-contracts.js'
import {
    isAgentDraftFile,
    isTeamDraftFile,
} from './draft-normalizers.js'

type DraftRef = {
    kind: DraftKind
    draftId: string
}

function extractReferencedDrafts(draft: DraftFile): DraftRef[] {
    const refs: DraftRef[] = []

    if (isAgentDraftFile(draft)) {
        const content: AgentDraftContent = draft.content
        if (Array.isArray(content.skillRefs)) {
            for (const ref of content.skillRefs) {
                if (ref?.kind === 'draft' && typeof ref.draftId === 'string') {
                    refs.push({ kind: 'skill', draftId: ref.draftId })
                }
            }
        }
    }

    if (isTeamDraftFile(draft)) {
        const content: TeamDraftContent = draft.content
        for (const key of Object.keys(content.participants)) {
            const participant = content.participants[key]
            if (participant?.agentRef?.kind === 'draft' && typeof participant.agentRef.draftId === 'string') {
                refs.push({ kind: 'agent', draftId: participant.agentRef.draftId })
            }
        }
    }

    return refs
}

export function buildDraftDeletePreview(
    allDrafts: DraftFile[],
    targetKind: DraftKind,
    targetId: string,
): DraftDeletePreviewResponse {
    const targetDraft = allDrafts.find((draft) => draft.kind === targetKind && draft.id === targetId)

    if (!targetDraft) {
        throw new Error(`Draft not found: ${targetKind}/${targetId}`)
    }

    const dependents: DraftDependencyPlanItem[] = []
    const processedIds = new Set<string>([targetId])

    const queue = [targetId]
    while (queue.length > 0) {
        const currentId = queue.shift()!
        for (const draft of allDrafts) {
            if (processedIds.has(draft.id)) continue

            const refs = extractReferencedDrafts(draft)
            if (refs.some((ref) => ref.draftId === currentId)) {
                processedIds.add(draft.id)
                const reason = draft.kind === 'agent'
                    ? `References ${targetKind} draft`
                    : `Contains agent referencing ${targetKind} draft`
                dependents.push({
                    draftId: draft.id,
                    kind: draft.kind,
                    name: draft.name,
                    source: 'draft',
                    reason,
                })
                queue.push(draft.id)
            }
        }
    }

    return {
        target: {
            draftId: targetDraft.id,
            kind: targetDraft.kind,
            name: targetDraft.name,
            source: 'draft',
            reason: 'Target',
        },
        dependents,
    }
}

export function sortDraftDependentsForDeletion(dependents: DraftDependencyPlanItem[]) {
    const order: Record<DraftKind, number> = { team: 0, agent: 1, skill: 2, instruction: 3 }
    return [...dependents].sort((left, right) => order[left.kind] - order[right.kind])
}
