/**
 * team-context-builder.ts — Collaboration system prompt construction
 *
 * PRD §9: Stable collaboration context is injected as a turn-scoped system prompt.
 * Includes: goal, participants, collaboration tools, relations, coordination signals, and rules.
 */

import type { TeamDefinition } from '../../../shared/team-types.js'

function participantDisplayName(teamDefinition: TeamDefinition, participantKey: string) {
    return teamDefinition.participants[participantKey]?.displayName || participantKey
}

function participantDescription(teamDefinition: TeamDefinition, participantKey: string) {
    const description = teamDefinition.participants[participantKey]?.description?.trim()
    return description ? description : null
}

function directConnectionKeys(teamDefinition: TeamDefinition, participantKey: string): string[] {
    const partners = new Set<string>()

    for (const rel of teamDefinition.relations) {
        if (!rel.between.includes(participantKey)) continue
        const partner = rel.between[0] === participantKey ? rel.between[1] : rel.between[0]
        if (partner) partners.add(partner)
    }

    return [...partners]
}

function messageablePartnerKeys(teamDefinition: TeamDefinition, participantKey: string): string[] {
    const partners = new Set<string>()

    for (const rel of teamDefinition.relations) {
        const [left, right] = rel.between
        if (rel.direction === 'one-way') {
            if (left === participantKey && right) {
                partners.add(right)
            }
            continue
        }

        if (left === participantKey && right) {
            partners.add(right)
        } else if (right === participantKey && left) {
            partners.add(left)
        }
    }

    return [...partners]
}

function coordinationSignalLines(
    teamDefinition: TeamDefinition,
    participantKeys: string[],
): string[] {
    const lines: string[] = []

    for (const partnerKey of participantKeys) {
        const partnerName = participantDisplayName(teamDefinition, partnerKey)
        const subscriptions = teamDefinition.participants[partnerKey]?.subscriptions
        if (!subscriptions) continue

        if (subscriptions.messageTags?.length) {
            lines.push(`- Message tags for ${partnerName}: ${subscriptions.messageTags.join(', ')}`)
        }
        if (subscriptions.callboardKeys?.length) {
            lines.push(`- Shared note keys for ${partnerName}: ${subscriptions.callboardKeys.join(', ')}`)
        }
    }

    return lines
}

function listOrNone(items: string[]) {
    return items.length > 0 ? items.join(', ') : 'none'
}

/**
 * Build markdown Team context for a participant's system prompt.
 */
export function buildTeamContext(
    teamDefinition: TeamDefinition,
    participantKey: string,
): string {
    const lines: string[] = []
    const selfName = participantDisplayName(teamDefinition, participantKey)
    const directPartners = directConnectionKeys(teamDefinition, participantKey)
    const messageablePartners = messageablePartnerKeys(teamDefinition, participantKey)
    const teammateNames = messageablePartners.map((key) => participantDisplayName(teamDefinition, key))

    lines.push('# Team Runtime Context')
    if (teamDefinition.description) {
        lines.push(`- Goal: ${teamDefinition.description}`)
    }
    lines.push(`- Team: ${teamDefinition.name}`)
    lines.push(`- Your role: ${selfName}`)
    const selfDescription = participantDescription(teamDefinition, participantKey)
    if (selfDescription) {
        lines.push(`- Your focus: ${selfDescription}`)
    }
    lines.push('')

    lines.push('# Runtime Tools')
    lines.push('- `message_teammate({recipient,message,tag?})`: send one direct update. `recipient` must be one of the messageable names below; do not use relation names like `participant_1_to_participant_2`.')
    lines.push('- `update_shared_board({entryKey,entryType,content,mode?})`: publish compact Markdown for decisions, findings, tasks, status, and handoffs. Use `entryType`: `artifact`, `finding`, or `task`; prefer `mode:"replace"`.')
    lines.push('- `list_shared_board({kind?,mode?})`: inspect existing notes before choosing a key. Defaults to summaries; use `mode:"full"` only for a necessary resync.')
    lines.push('- `get_shared_board_entry({entryKey})`: read one exact key. Never pass placeholders like `recent` or category names like `artifact` as the key.')
    lines.push('- `wait_until({resumeWith,conditionJson})`: park yourself until future input. `conditionJson` must be JSON using `message_received`, `board_key_exists`, `wake_at`, `all_of`, or `any_of`.')
    lines.push('- Condition shapes: `{"type":"message_received","from":"Teammate","tag":"handoff"}`, `{"type":"board_key_exists","key":"review-summary"}`, `{"type":"wake_at","at":1735689600000}`. Use a direct connection display name for `from`.')
    lines.push('- After `wait_until`, end the turn immediately; do not call another runtime tool until resumed.')
    lines.push('')

    lines.push('# Messageable Teammates')
    lines.push(`- Valid ` + '`recipient`' + ` values: ${listOrNone(teammateNames)}`)
    lines.push('')

    const myRelations = teamDefinition.relations.filter((rel) => rel.between.includes(participantKey))
    if (myRelations.length > 0) {
        lines.push('# Direct Connections')
        for (const rel of myRelations) {
            const partner = rel.between[0] === participantKey ? rel.between[1] : rel.between[0]
            const partnerName = participantDisplayName(teamDefinition, partner)
            const partnerDescription = participantDescription(teamDefinition, partner)
            const dirLabel = rel.direction === 'one-way'
                ? (rel.between[0] === participantKey ? '→' : '←')
                : '↔'
            lines.push(`- ${selfName} ${dirLabel} ${partnerName}: ${rel.name}${rel.description ? ` — ${rel.description}` : ''}`)
            if (partnerDescription) {
                lines.push(`  Partner focus: ${partnerName} — ${partnerDescription}`)
            }
        }
        lines.push('')
    } else {
        lines.push('# Direct Connections')
        lines.push('- No direct participant relations are configured for you.')
        lines.push('')
    }

    const signalLines = coordinationSignalLines(teamDefinition, directPartners)
    if (signalLines.length > 0) {
        lines.push('# Teammate Wake Hints')
        lines.push(...signalLines)
        lines.push('- Reuse these tags or shared note keys when they fit. If you invent a new key or tag, make the message self-explanatory.')
        lines.push('')
    }

    lines.push('# Operating Rules')
    lines.push('- Before acting on a wake event, inspect only the sender, message, or shared note key relevant to that event.')
    lines.push('- Reuse the same shared note key for the same deliverable, decision, finding set, or task; create a new key only when the workstream splits.')
    lines.push('- Shared board notes are not final deliverable storage. Save real artifacts in the working directory or proper destination, then post a short handoff summary.')
    lines.push('- Use `wait_until` instead of polling when blocked on a teammate message, shared note, or scheduled self-wake.')

    if (teamDefinition.teamRules && teamDefinition.teamRules.length > 0) {
        for (const rule of teamDefinition.teamRules) {
            lines.push(`- ${rule}`)
        }
    }
    lines.push('')

    return lines.join('\n')
}
