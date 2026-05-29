import type { WorkspaceAgentNode } from '../../../shared/workspace-contracts'
/**
 * draft-auto-save.ts — Zustand subscriber that auto-saves
 * agent config changes as drafts when the agent is
 * derived from a named primitive.
 *
 * Import this module in the store index to activate.
 */

import { draftApi } from '../../api-clients/drafts'
import type { StudioState } from '../types'

const _timers = new Map<string, ReturnType<typeof setTimeout>>()
const _hashes = new Map<string, string>()
const DEBOUNCE_MS = 2000

function configHash(p: WorkspaceAgentNode): string {
    return JSON.stringify({
        instructionRef: p.instructionRef,
        skillRefs: p.skillRefs,
        model: p.model,
        modelVariant: p.modelVariant,
        mcpServerNames: p.mcpServerNames,
        mcpBindingMap: p.mcpBindingMap,
        planMode: p.planMode,
        runtimeAgentId: p.runtimeAgentId,
    })
}

/**
 * Initialize the auto-save subscriber. Call once after the store is created.
 */
export function initDraftAutoSave(
    subscribe: (listener: (state: StudioState, prevState: StudioState) => void) => () => void,
) {
    subscribe((state: StudioState, prevState: StudioState) => {
        if (state.agents === prevState.agents) return

        const currentIds = new Set<string>()

        for (const agent of state.agents as WorkspaceAgentNode[]) {
            currentIds.add(agent.id)

            const derivedFrom = agent.meta?.derivedFrom
            if (!derivedFrom) continue

            const hash = configHash(agent)
            const prev = _hashes.get(agent.id)

            if (prev === undefined) {
                _hashes.set(agent.id, hash)
                continue
            }
            if (hash === prev) continue

            _hashes.set(agent.id, hash)

            const existing = _timers.get(agent.id)
            if (existing) clearTimeout(existing)

            _timers.set(agent.id, setTimeout(() => {
                _timers.delete(agent.id)

                const description = agent.meta?.authoring?.description || agent.name

                const content = {
                    instructionRef: agent.instructionRef || null,
                    agentBody: agent.agentBody || null,
                    skillRefs: agent.skillRefs || [],
                    model: agent.model || null,
                    modelVariant: agent.modelVariant || null,
                    mcpServerNames: agent.mcpServerNames || [],
                    mcpBindingMap: agent.mcpBindingMap || {},
                    planMode: agent.planMode || false,
                    runtimeAgentId: agent.runtimeAgentId || null,
                }

                const draftId = `auto-${agent.id}`

                draftApi.update('agent', draftId, {
                    name: `${agent.name} (modified)`,
                    content,
                    description,
                    derivedFrom,
                }).catch(() => {
                    draftApi.create({
                        kind: 'agent',
                        id: draftId,
                        name: `${agent.name} (modified)`,
                        content,
                        description,
                        derivedFrom,
                    }).catch((err) => {
                        console.warn('[auto-save] Failed to save agent draft', err)
                    })
                })
            }, DEBOUNCE_MS))
        }

        // Clean up stale entries for removed agents
        for (const id of _hashes.keys()) {
            if (!currentIds.has(id)) {
                _hashes.delete(id)
                const timer = _timers.get(id)
                if (timer) {
                    clearTimeout(timer)
                    _timers.delete(id)
                }
            }
        }
    })
}
