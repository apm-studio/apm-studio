/**
 * Agent configuration mutations for the workspace slice.
 *
 * Contains all Agent instructions, Skill, Model, MCP, and agent-config setters.
 * Each function produces a Zustand partial that the workspace slice
 * spreads directly into its returned object.
 */

import type { StudioState } from '../types'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts'
import {
    primitiveRefKey,
    isSamePrimitiveRef,
} from '../../lib/agents'
import {
    applyAgentPatch,
    mapAgents,
} from './helpers'
import { buildExitFocusModeState } from './focus-mode-state'
import { isAgentAttachedToTeam } from '../../features/team/team-inspector-helpers'
import {
    resolveFocusTarget,
    resolveNodeBaselineHidden,
    setFocusSnapshotNodeHidden,
} from '../../lib/focus-utils'

type SetFn = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetFn = () => StudioState
const LIVE_TEAM_WORKSPACE_PERSIST_DELAY_MS = 300
const liveTeamWorkspacePersistTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * After a runtime-affecting agent mutation, if the agent participates
 * in a live Team, persist workspace so auto-wake and participant execution
 * read the latest agent config from workspace.json.
 *
 * Agent runtime config changes do not alter Team definitions, so this path
 * intentionally avoids Team runtime-definition sync and only saves workspace.
 */
function scheduleLiveTeamWorkspacePersist(get: GetFn, agentId: string) {
    const state = get()
    const agent = state.agents.find((p) => p.id === agentId)
    if (!agent) return

    const isAttachedToLiveTeam = state.teams.some((team) => {
        if (!isAgentAttachedToTeam(team, agent)) {
            return false
        }
        return (state.teamThreads[team.id] || []).some(
            (thread) => thread.status === 'active' || thread.status === 'idle',
        )
    })

    if (!isAttachedToLiveTeam) {
        const existing = liveTeamWorkspacePersistTimers.get(agentId)
        if (existing) {
            clearTimeout(existing)
            liveTeamWorkspacePersistTimers.delete(agentId)
        }
        return
    }

    const existing = liveTeamWorkspacePersistTimers.get(agentId)
    if (existing) {
        clearTimeout(existing)
    }

    liveTeamWorkspacePersistTimers.set(agentId, setTimeout(() => {
        liveTeamWorkspacePersistTimers.delete(agentId)
        const latest = get()
        const latestAgent = latest.agents.find((p) => p.id === agentId)
        if (!latestAgent) {
            return
        }

        const stillAttachedToLiveTeam = latest.teams.some((team) => {
            if (!isAgentAttachedToTeam(team, latestAgent)) {
                return false
            }
            return (latest.teamThreads[team.id] || []).some(
                (thread) => thread.status === 'active' || thread.status === 'idle',
            )
        })

        if (!stillAttachedToLiveTeam || !latest.workspaceDirty) {
            return
        }

        void latest.saveWorkspace().catch((error) => {
            console.warn('[team-sync] Failed to persist workspace for live Team agent update', error)
        })
    }, LIVE_TEAM_WORKSPACE_PERSIST_DELAY_MS))
}

function markAgentProjectionDirty(get: GetFn, agentId: string) {
    get().recordStudioChange({ kind: 'agent', agentIds: [agentId] })
}

export function setAgentBody(set: SetFn, get: GetFn, agentId: string, agentBody: string | null) {
    const normalizedAgentBody = typeof agentBody === 'string' && agentBody.trim()
        ? agentBody
        : null
    set((s) => ({
        agents: mapAgents(s.agents, agentId, (agent) => applyAgentPatch(agent, { agentBody: normalizedAgentBody })),
        workspaceDirty: true,
    }))
    markAgentProjectionDirty(get, agentId)
    scheduleLiveTeamWorkspacePersist(get, agentId)
}

// ── Skill ───────────────────────────────────────────────

export function addAgentSkill(set: SetFn, get: GetFn, agentId: string, skill: { urn: string }) {
    set((s) => ({
        agents: s.agents.map(a =>
            a.id === agentId && !a.skillRefs.some((ref) => ref.kind === 'registry' && ref.urn === skill.urn)
                ? applyAgentPatch(a, {
                    skillRefs: [...a.skillRefs, { kind: 'registry' as const, urn: skill.urn }],
                })
                : a
        ),
        workspaceDirty: true,
    }))
    markAgentProjectionDirty(get, agentId)
    scheduleLiveTeamWorkspacePersist(get, agentId)
}

export function addAgentSkillRef(set: SetFn, get: GetFn, agentId: string, skillRef: SharedPrimitiveRef) {
    set((s) => ({
        agents: mapAgents(s.agents, agentId, (agent) => (
            !agent.skillRefs.some((ref) => isSamePrimitiveRef(ref, skillRef))
                ? applyAgentPatch(agent, {
                    skillRefs: [...agent.skillRefs, skillRef],
                })
                : agent
        )),
        workspaceDirty: true,
    }))
    markAgentProjectionDirty(get, agentId)
    scheduleLiveTeamWorkspacePersist(get, agentId)
}

export function replaceAgentSkillRef(set: SetFn, get: GetFn, agentId: string, currentRef: SharedPrimitiveRef, nextRef: SharedPrimitiveRef) {
    set((s) => ({
        agents: mapAgents(s.agents, agentId, (agent) => applyAgentPatch(agent, {
            skillRefs: agent.skillRefs.map((ref) => (isSamePrimitiveRef(ref, currentRef) ? nextRef : ref)),
        })),
        workspaceDirty: true,
    }))
    markAgentProjectionDirty(get, agentId)
    scheduleLiveTeamWorkspacePersist(get, agentId)
}

export function removeAgentSkill(set: SetFn, get: GetFn, agentId: string, skillKey: string) {
    set((s) => ({
        agents: s.agents.map(a =>
            a.id === agentId
                ? (() => {
                    const skillRefs = a.skillRefs.filter((ref) => (
                        primitiveRefKey(ref) !== skillKey
                        && !(ref.kind === 'registry' && ref.urn === skillKey)
                        && !(ref.kind === 'draft' && ref.draftId === skillKey)
                    ))
                    return applyAgentPatch(a, { skillRefs })
                })()
                : a
        ),
        workspaceDirty: true,
    }))
    markAgentProjectionDirty(get, agentId)
    scheduleLiveTeamWorkspacePersist(get, agentId)
}

// ── Model ───────────────────────────────────────────────

export function setAgentModel(set: SetFn, get: GetFn, agentId: string, model: { provider: string; modelId: string } | null) {
    set((s) => ({
        agents: s.agents.map(a => {
            if (a.id !== agentId) return a
            const sameModel = (
                (a.model?.provider || null) === (model?.provider || null)
                && (a.model?.modelId || null) === (model?.modelId || null)
            )
            return applyAgentPatch(a, {
                model,
                modelVariant: sameModel ? (a.modelVariant || null) : null,
                modelPlaceholder: null,
            })
        }),
        workspaceDirty: true,
    }))
    markAgentProjectionDirty(get, agentId)
    scheduleLiveTeamWorkspacePersist(get, agentId)
}

export function setAgentModelVariant(set: SetFn, get: GetFn, agentId: string, modelVariant: string | null) {
    set((s) => ({
        agents: mapAgents(s.agents, agentId, (agent) => applyAgentPatch(agent, { modelVariant: modelVariant || null })),
        workspaceDirty: true,
    }))
    markAgentProjectionDirty(get, agentId)
    scheduleLiveTeamWorkspacePersist(get, agentId)
}

// ── Agent ───────────────────────────────────────────────

export function setAgentRuntimeId(set: SetFn, get: GetFn, agentId: string, runtimeAgentId: string | null) {
    set((s) => ({
        agents: s.agents.map(a => {
            if (a.id !== agentId) return a
            return applyAgentPatch(a, {
                runtimeAgentId: runtimeAgentId || null,
                planMode: runtimeAgentId === 'plan',
            })
        }),
        workspaceDirty: true,
    }))
    markAgentProjectionDirty(get, agentId)
    scheduleLiveTeamWorkspacePersist(get, agentId)
}

// ── MCP ─────────────────────────────────────────────────

export function addAgentMcp(set: SetFn, get: GetFn, agentId: string, mcp: { name: string }) {
    const serverName = mcp.name.trim()
    if (!serverName) {
        return
    }
    let changed = false
    set((s) => {
        const agents = s.agents.map(a => {
            if (a.id !== agentId || a.mcpServerNames.includes(serverName)) {
                return a
            }
            changed = true
            return applyAgentPatch(a, { mcpServerNames: [...a.mcpServerNames, serverName] })
        })
        return changed ? { agents, workspaceDirty: true } : {}
    })
    if (changed) {
        markAgentProjectionDirty(get, agentId)
        scheduleLiveTeamWorkspacePersist(get, agentId)
    }
}

export function removeAgentMcp(set: SetFn, get: GetFn, agentId: string, mcpName: string) {
    const serverName = mcpName.trim()
    if (!serverName) {
        return
    }
    let changed = false
    set((s) => {
        const agents = s.agents.map(a =>
            a.id === agentId
                ? (() => {
                    const mcpServerNames = a.mcpServerNames.filter(name => name !== serverName)
                    const mcpBindingMap = Object.fromEntries(
                        Object.entries(a.mcpBindingMap || {}).filter(([, mappedName]) => mappedName !== serverName),
                    )
                    if (
                        mcpServerNames.length === a.mcpServerNames.length
                        && Object.keys(mcpBindingMap).length === Object.keys(a.mcpBindingMap || {}).length
                    ) {
                        return a
                    }
                    changed = true
                    return applyAgentPatch(a, { mcpServerNames, mcpBindingMap })
                })()
                : a
        )
        return changed ? { agents, workspaceDirty: true } : {}
    })
    if (changed) {
        markAgentProjectionDirty(get, agentId)
        scheduleLiveTeamWorkspacePersist(get, agentId)
    }
}

export function setAgentMcpBinding(set: SetFn, get: GetFn, agentId: string, placeholderName: string, serverName: string | null) {
    const placeholder = placeholderName.trim()
    if (!placeholder) {
        return
    }
    const nextServerName = serverName?.trim() || null
    let changed = false
    set((s) => {
        const agents = s.agents.map((agent) => {
            if (agent.id !== agentId) {
                return agent
            }
            const currentServerName = agent.mcpBindingMap?.[placeholder] || null
            if (currentServerName === nextServerName) {
                return agent
            }
            const mcpBindingMap = {
                ...(agent.mcpBindingMap || {}),
            }
            if (nextServerName) {
                mcpBindingMap[placeholder] = nextServerName
            } else {
                delete mcpBindingMap[placeholder]
            }
            changed = true
            return applyAgentPatch(agent, { mcpBindingMap })
        })
        return changed ? { agents, workspaceDirty: true } : {}
    })
    if (changed) {
        markAgentProjectionDirty(get, agentId)
        scheduleLiveTeamWorkspacePersist(get, agentId)
    }
}

// ── Metadata & visibility ───────────────────────────────

export function updateAgentAuthoringMeta(set: SetFn, get: GetFn, agentId: string, patch: Record<string, unknown>) {
    set((s) => ({
        agents: s.agents.map((a) => (
            a.id === agentId
                ? {
                    ...a,
                    meta: {
                        ...a.meta,
                        authoring: {
                            ...(a.meta?.authoring || {}),
                            ...patch,
                        },
                    },
                }
                : a
        )),
        workspaceDirty: true,
    }))
    markAgentProjectionDirty(get, agentId)
    scheduleLiveTeamWorkspacePersist(get, agentId)
}

export function toggleAgentVisibility(set: SetFn, _get: GetFn, id: string) {
    set((state) => {
        const focusedTarget = resolveFocusTarget(state.focusSnapshot)
        const currentHidden = resolveNodeBaselineHidden(
            state.focusSnapshot,
            id,
            'agent',
            !!state.agents.find((agent) => agent.id === id)?.hidden,
        )
        const nextHidden = !currentHidden

        if (state.focusSnapshot && (focusedTarget?.id !== id || focusedTarget?.type !== 'agent')) {
            return {
                focusSnapshot: setFocusSnapshotNodeHidden(state.focusSnapshot, id, 'agent', nextHidden),
                workspaceDirty: true,
            }
        }

        const focusExit = buildExitFocusModeState(state)
        const agents = (focusExit?.agents as StudioState['agents'] | undefined) || state.agents

        return {
            ...focusExit,
            agents: agents.map((agent) => (
                agent.id === id
                    ? { ...agent, hidden: nextHidden }
                    : agent
            )),
            workspaceDirty: true,
        }
    })
}
