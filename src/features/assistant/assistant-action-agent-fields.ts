import type { AssistantAgentFields } from '../../../shared/assistant-actions'
import { store, type AssistantRefState } from './assistant-action-state'
import { resolveDraftId } from './assistant-action-resolvers'
import { createDraft } from './assistant-action-draft-context'

async function resolveInstructionRef(
    fields: AssistantAgentFields,
    refs: AssistantRefState,
): Promise<{ kind: 'registry'; urn: string } | { kind: 'draft'; draftId: string } | null | undefined> {
    if (fields.instructionUrn !== undefined) {
        return fields.instructionUrn ? { kind: 'registry', urn: fields.instructionUrn } : null
    }
    if (fields.instructionDraftId) {
        return { kind: 'draft', draftId: fields.instructionDraftId }
    }
    if (fields.instructionDraftRef) {
        const draftId = resolveDraftId(refs, 'instruction', { draftRef: fields.instructionDraftRef })
        return draftId ? { kind: 'draft', draftId } : null
    }
    if (fields.instructionDraft) {
        const draftId = await createDraft('instruction', fields.instructionDraft, refs)
        return { kind: 'draft', draftId }
    }
    return undefined
}

async function applySkillAdditions(
    agentId: string,
    fields: AssistantAgentFields,
    refs: AssistantRefState,
) {
    const s = store()
    for (const urn of fields.addSkillUrns || []) {
        s.addAgentSkillRef(agentId, { kind: 'registry', urn })
    }
    for (const draftId of fields.addSkillDraftIds || []) {
        s.addAgentSkillRef(agentId, { kind: 'draft', draftId })
    }
    for (const draftRef of fields.addSkillDraftRefs || []) {
        const draftId = resolveDraftId(refs, 'skill', { draftRef })
        if (draftId) s.addAgentSkillRef(agentId, { kind: 'draft', draftId })
    }
    for (const blueprint of fields.addSkillDrafts || []) {
        const draftId = await createDraft('skill', blueprint, refs)
        store().addAgentSkillRef(agentId, { kind: 'draft', draftId })
    }
}

function applySkillRemovals(agentId: string, fields: AssistantAgentFields) {
    const s = store()
    for (const urn of fields.removeSkillUrns || []) {
        s.removeAgentSkill(agentId, urn)
    }
    for (const draftId of fields.removeSkillDraftIds || []) {
        s.removeAgentSkill(agentId, draftId)
    }
}

export async function applyAgentFields(
    agentId: string,
    fields: AssistantAgentFields,
    refs: AssistantRefState,
) {
    const s = store()
    if (fields.description !== undefined) {
        s.updateAgentAuthoringMeta(agentId, {
            description: fields.description || '',
        })
    }
    const instructionRef = await resolveInstructionRef(fields, refs)
    if (instructionRef !== undefined) {
        s.setAgentInstructionRef(agentId, instructionRef)
    }
    await applySkillAdditions(agentId, fields, refs)
    applySkillRemovals(agentId, fields)
    if (fields.model !== undefined) {
        s.setAgentModel(agentId, fields.model)
    }
    if (fields.modelVariant !== undefined) {
        s.setAgentModelVariant(agentId, fields.modelVariant || null)
    }
    for (const name of fields.addMcpServerNames || []) {
        s.addAgentMcp(agentId, { name, status: 'connected', tools: [], resources: [] })
    }
    for (const name of fields.removeMcpServerNames || []) {
        s.removeAgentMcp(agentId, name)
    }
}
