import type { PackageLibraryItem, DraftPrimitive } from '../../lib/primitive-types'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts'

import { primitiveUrnDisplayName } from '../../lib/primitive-urn'
import { primitiveRefKey } from '../../lib/agents'
import type { FileMention } from '../../hooks/useFileMentions'

// ── Types ──────────────────────────────────────────────

export type TurnSkillSelection = {
    ref: SharedPrimitiveRef
    label: string
    scope: 'agent' | 'draft' | 'workspace' | 'user'
}

export type SkillSearchItem = {
    key: string
    ref: SharedPrimitiveRef
    label: string
    scope: 'agent' | 'draft' | 'workspace' | 'user'
    subtitle: string
}

// ── Pure Utility Functions ─────────────────────────────

export function formatAgentLabel(name: string | null | undefined) {
    if (!name) {
        return null;
    }
    return name
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join(' ');
}

export function primitiveRefDisplayLabel(ref: SharedPrimitiveRef, drafts: Record<string, DraftPrimitive>) {
    if (ref.kind === 'draft') {
        const draft = drafts[ref.draftId]
        return draft?.name || draft?.slug || `Draft ${ref.draftId.slice(0, 8)}`
    }
    return primitiveUrnDisplayName(ref.urn)
}

export function skillSearchText(label: string, subtitle: string, scope: SkillSearchItem['scope']) {
    return `${label} ${subtitle} ${scope}`.toLowerCase()
}

export function buildAttachedDraftSkillItems(
    agent: { skillRefs?: SharedPrimitiveRef[] } | null,
    drafts: Record<string, DraftPrimitive>,
): SkillSearchItem[] {
    return (agent?.skillRefs || [])
        .filter((ref): ref is Extract<SharedPrimitiveRef, { kind: 'draft' }> => ref.kind === 'draft')
        .map((ref) => ({
            key: `draft:${primitiveRefKey(ref)}`,
            ref,
            label: primitiveRefDisplayLabel(ref, drafts),
            scope: 'draft' as const,
            subtitle: 'Attached to agent',
        }))
}

export function buildStandaloneDraftSkillItems(
    agent: { skillRefs?: SharedPrimitiveRef[] } | null,
    drafts: Record<string, DraftPrimitive>,
): SkillSearchItem[] {
    const attachedDraftIds = new Set(
        (agent?.skillRefs || [])
            .filter((ref): ref is Extract<SharedPrimitiveRef, { kind: 'draft' }> => ref.kind === 'draft')
            .map((ref) => ref.draftId),
    )

    return Object.entries(drafts)
        .filter(([id, draft]) => draft.kind === 'skill' && !attachedDraftIds.has(id))
        .map(([id, draft]) => ({
            key: `draft:${id}`,
            ref: { kind: 'draft' as const, draftId: id },
            label: draft.name || draft.slug || `Draft ${id.slice(0, 8)}`,
            scope: 'draft' as const,
            subtitle: 'Unsaved draft',
        }))
}

export function buildAgentSkillItems(
    agent: { skillRefs?: SharedPrimitiveRef[] } | null,
    drafts: Record<string, DraftPrimitive>,
): SkillSearchItem[] {
    return (agent?.skillRefs || [])
        .filter((ref): ref is Extract<SharedPrimitiveRef, { kind: 'registry' }> => ref.kind === 'registry')
        .map((ref) => ({
            key: `agent:${primitiveRefKey(ref)}`,
            ref,
            label: primitiveRefDisplayLabel(ref, drafts),
            scope: 'agent' as const,
            subtitle: ref.urn || '',
        }))
}

export function buildAvailableSkillItems(
    skillPrimitives: PackageLibraryItem[],
    drafts: Record<string, DraftPrimitive>,
    agent: { skillRefs?: SharedPrimitiveRef[] } | null,
): SkillSearchItem[] {
    const draftItems = [
        ...buildAttachedDraftSkillItems(agent, drafts),
        ...buildStandaloneDraftSkillItems(agent, drafts),
    ]
    const agentItems = buildAgentSkillItems(agent, drafts)
    const agentKeys = new Set(
        [...draftItems, ...agentItems]
            .map((item) => primitiveRefKey(item.ref))
            .filter((key): key is string => !!key),
    )

    return skillPrimitives
        .filter((primitive): primitive is PackageLibraryItem => primitive.kind === 'skill')
        .map((primitive) => ({
            key: `${primitive.source || 'local'}:${primitive.urn}`,
            ref: { kind: 'registry', urn: primitive.urn } as const,
            label: primitive.name,
            scope: primitive.source === 'user' ? 'user' as const : 'workspace' as const,
            subtitle: primitive.urn,
        }))
        .filter((item) => !agentKeys.has(primitiveRefKey(item.ref) || ''))
}

export function buildSkillSearchSections(
    skillPrimitives: PackageLibraryItem[],
    skillSlashMatch: string | null,
    drafts: Record<string, DraftPrimitive>,
    agent: { skillRefs?: SharedPrimitiveRef[] } | null,
) {
    const draftItems = [
        ...buildAttachedDraftSkillItems(agent, drafts),
        ...buildStandaloneDraftSkillItems(agent, drafts),
    ]
    const agentItems = buildAgentSkillItems(agent, drafts)
    const availableItems = buildAvailableSkillItems(skillPrimitives, drafts, agent)
    const byQuery = (item: SkillSearchItem) => (
        !skillSlashMatch
        || skillSearchText(item.label, item.subtitle, item.scope).includes(skillSlashMatch)
    )

    return [
        {
            key: 'draft',
            title: 'Draft',
            items: draftItems.filter(byQuery),
        },
        {
            key: 'agent',
            title: 'Studio Agent',
            items: agentItems.filter(byQuery),
        },
        {
            key: 'workspace',
            title: 'Workspace',
            items: availableItems.filter((item) => item.scope === 'workspace').filter(byQuery),
        },
        {
            key: 'user',
            title: 'User',
            items: availableItems.filter((item) => item.scope === 'user').filter(byQuery),
        },
    ].filter((section) => section.items.length > 0)
}

export function formatChatAttachments(attachments: FileMention[]) {
    return attachments.map((attachment) => ({
        type: 'file' as const,
        mime: attachment.type || 'text/plain',
        url: attachment.absolute.startsWith('data:') ? attachment.absolute : `file://${attachment.absolute}`,
        filename: attachment.name,
    }))
}

export function shouldShowChatLoading(messages: Array<{ role: string; content: string }>, isLoading: boolean) {
    if (!isLoading) {
        return false
    }
    const lastMsg = messages[messages.length - 1]
    const hasStreamingContent = lastMsg?.role === 'assistant' && lastMsg.content.trim().length > 0
    return !hasStreamingContent
}
