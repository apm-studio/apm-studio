import {
    AGENT_DEFAULT_HEIGHT,
    AGENT_DEFAULT_WIDTH,
    createAgentNode,
    createAgentNodeFromPrimitive,
    normalizeAgentPrimitiveInput,
} from '../../lib/agents'
import {
    collectVisibleCanvasNodeRects,
    resolveCanvasNodeSpawnPosition,
} from '../../lib/canvas-node-layout'
import { scheduleTeamRuntimeSync } from '../team/team-thread-sync'
import {
    collectAgentSessionTargets,
    deleteSessionTargetsRemotely,
    detachSessionTargets,
} from '../session/session-lifecycle'
import type { StudioState } from '../types'
import { buildAgentDeleteCascade } from './cascade-cleanup'
import { buildExitFocusModeState } from './focus-mode-state'
import { applyAgentPatch } from './helpers'
import type { WorkspaceSlice } from './types'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState
type AgentPrimitiveInput = Parameters<WorkspaceSlice['addAgentFromPrimitive']>[0]

function uniqueAgentName(desired: string, existingNames: string[]): string {
    if (!existingNames.includes(desired)) return desired
    let i = 2
    while (existingNames.includes(`${desired} (${i})`)) i++
    return `${desired} (${i})`
}

export function addAgentImpl(
    get: GetState,
    set: SetState,
    agentIdCounter: { value: number },
    name: string,
    x?: number,
    y?: number,
) {
    agentIdCounter.value++
    const id = `agent-${agentIdCounter.value}`
    const state = get()
    const safeName = uniqueAgentName(name, state.agents.map((agent) => agent.name))
    const spawnPosition = resolveCanvasNodeSpawnPosition({
        canvasCenter: state.canvasCenter,
        occupiedRects: collectVisibleCanvasNodeRects(state.agents, state.teams),
        width: AGENT_DEFAULT_WIDTH,
        height: AGENT_DEFAULT_HEIGHT,
    })

    set((state) => ({
        agents: [
            ...state.agents,
            createAgentNode({
                id,
                name: safeName,
                x: x ?? spawnPosition.x,
                y: y ?? spawnPosition.y,
            }),
        ],
        editingTarget: null,
        selectedAgentId: id,
        selectedAgentSessionId: null,
        selectedMarkdownEditorId: null,
        activeChatAgentId: id,
        canvasRevealTarget: {
            id,
            type: 'agent',
            nonce: (state.canvasRevealTarget?.nonce || 0) + 1,
        },
        inspectorFocus: null,
        workspaceDirty: true,
    }))
    get().recordStudioChange({ kind: 'agent', agentIds: [id] })
    return id
}

export function addAgentFromPrimitiveImpl(
    get: GetState,
    set: SetState,
    agentIdCounter: { value: number },
    primitive: AgentPrimitiveInput,
    x?: number,
    y?: number,
) {
    agentIdCounter.value++
    const id = `agent-${agentIdCounter.value}`
    const state = get()
    const safeName = uniqueAgentName(primitive.name, state.agents.map((agent) => agent.name))
    const spawnPosition = resolveCanvasNodeSpawnPosition({
        canvasCenter: state.canvasCenter,
        occupiedRects: collectVisibleCanvasNodeRects(state.agents, state.teams),
        width: AGENT_DEFAULT_WIDTH,
        height: AGENT_DEFAULT_HEIGHT,
    })

    set((state) => ({
        agents: [
            ...state.agents,
            createAgentNodeFromPrimitive({
                id,
                primitive: { ...primitive, name: safeName },
                x: x ?? spawnPosition.x,
                y: y ?? spawnPosition.y,
            }),
        ],
        editingTarget: null,
        selectedAgentId: id,
        selectedAgentSessionId: null,
        selectedMarkdownEditorId: null,
        activeChatAgentId: id,
        canvasRevealTarget: {
            id,
            type: 'agent',
            nonce: (state.canvasRevealTarget?.nonce || 0) + 1,
        },
        inspectorFocus: null,
        workspaceDirty: true,
    }))
    get().recordStudioChange({ kind: 'agent', agentIds: [id] })
}

export function applyAgentPrimitiveImpl(
    get: GetState,
    set: SetState,
    agentId: string,
    primitive: Parameters<WorkspaceSlice['applyAgentPrimitive']>[1],
) {
    set((state) => {
        const normalized = normalizeAgentPrimitiveInput(primitive)
        return {
            agents: state.agents.map((agent) => {
                if (agent.id !== agentId) {
                    return agent
                }
                return applyAgentPatch(agent, {
                    skillRefs: normalized.skillRefs,
                    model: normalized.model,
                    modelPlaceholder: normalized.modelPlaceholder,
                    modelVariant: normalized.modelVariant,
                    agentBody: normalized.agentBody,
                    runtimeAgentId: normalized.runtimeAgentId,
                    planMode: normalized.planMode,
                    mcpServerNames: normalized.mcpServerNames,
                    mcpBindingMap: normalized.mcpBindingMap,
                    declaredMcpConfig: normalized.declaredMcpConfig,
                    meta: normalized.meta,
                })
            }),
            workspaceDirty: true,
        }
    })
    get().recordStudioChange({ kind: 'agent', agentIds: [agentId] })
}

export function removeAgentImpl(get: GetState, set: SetState, id: string) {
    const agent = get().agents.find((entry) => entry.id === id)
    if (!agent) {
        return
    }
    const sessionTargets = collectAgentSessionTargets(get(), agent)
    detachSessionTargets(set, get, sessionTargets)

    set((state) => {
        const focusExit = buildExitFocusModeState(state)
        const baseTeams = (focusExit?.teams as StudioState['teams'] | undefined) || state.teams
        const baseAgents = (focusExit?.agents as StudioState['agents'] | undefined) || state.agents
        const teamCascade = buildAgentDeleteCascade(agent, baseTeams)
        return {
            ...focusExit,
            agents: baseAgents.filter((entry) => entry.id !== id),
            teams: teamCascade.teams || baseTeams,
            selectedAgentId: state.selectedAgentId === id ? null : state.selectedAgentId,
            selectedAgentSessionId: state.selectedAgentId === id ? null : state.selectedAgentSessionId,
            selectedMarkdownEditorId: state.selectedMarkdownEditorId,
            editingTarget: state.editingTarget?.type === 'agent' && state.editingTarget.id === id ? null : state.editingTarget,
            activeChatAgentId: state.activeChatAgentId === id ? null : state.activeChatAgentId,
            workspaceDirty: true,
        }
    })

    deleteSessionTargetsRemotely(sessionTargets, {
        title: 'Thread cleanup failed',
        dedupeKey: `agent:delete-session-cleanup:${id}`,
    })
    void get().listSessions()

    get().recordStudioChange({ kind: 'agent', agentIds: [id], workspaceWide: true })
}

export function updateAgentPositionImpl(set: SetState, id: string, x: number, y: number) {
    set((state) => ({
        agents: state.agents.map((agent) => agent.id === id ? { ...agent, position: { x, y } } : agent),
        workspaceDirty: true,
    }))
}

export function updateAgentSizeImpl(set: SetState, id: string, width: number, height: number) {
    set((state) => ({
        agents: state.agents.map((agent) => agent.id === id ? { ...agent, width, height } : agent),
        workspaceDirty: true,
    }))
}

export function updateAgentNameImpl(get: GetState, set: SetState, id: string, name: string) {
    const state = get()
    const agent = state.agents.find((entry) => entry.id === id)
    if (!agent) return
    const safeName = uniqueAgentName(name, state.agents.filter((entry) => entry.id !== id).map((entry) => entry.name))
    const affectedTeamIds: string[] = []
    set((state) => {
        const nextTeams = state.teams.map((team) => {
            let changed = false
            const nextParticipants = Object.fromEntries(
                Object.entries(team.participants).map(([participantKey, binding]) => {
                    const matchesDraft = binding.agentRef.kind === 'draft' && binding.agentRef.draftId === id
                    const matchesRegistry = binding.agentRef.kind === 'registry'
                        && !!agent.meta?.derivedFrom
                        && binding.agentRef.urn === agent.meta.derivedFrom
                    if (!matchesDraft && !matchesRegistry) {
                        return [participantKey, binding]
                    }
                    changed = true
                    return [participantKey, { ...binding, displayName: safeName }]
                }),
            )

            if (changed) {
                affectedTeamIds.push(team.id)
                return { ...team, participants: nextParticipants }
            }

            return team
        })
        return {
            agents: state.agents.map((entry) => entry.id === id ? applyAgentPatch(entry, { name: safeName }) : entry),
            teams: nextTeams,
            workspaceDirty: true,
        }
    })
    get().recordStudioChange({
        kind: 'team',
        agentIds: [id],
        teamIds: affectedTeamIds,
    })
    for (const teamId of affectedTeamIds) {
        scheduleTeamRuntimeSync(get, set, teamId)
    }
}

export function selectAgentImpl(set: SetState, id: string | null) {
    set((state) => ({
        selectedAgentId: id,
        selectedAgentSessionId: null,
        selectedMarkdownEditorId: null,
        selectedTeamId: id ? null : state.selectedTeamId,
        teamEditorState: id ? null : state.teamEditorState,
        inspectorFocus: null,
    }))
}

export function selectAgentSessionImpl(set: SetState, sessionId: string | null) {
    set({ selectedAgentSessionId: sessionId, selectedMarkdownEditorId: null })
}
