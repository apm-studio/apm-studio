import type {
    AgentDraftContent,
    TeamDraftContent,
} from '../../../shared/draft-contracts'
import type {
    WorkspaceAgentNode,
    WorkspaceTeamParticipantBinding,
} from '../../../shared/workspace-contracts'
import {
    AGENT_DEFAULT_HEIGHT,
    AGENT_DEFAULT_WIDTH,
    createAgentNode,
} from '../../lib/agents'
import {
    collectVisibleCanvasNodeRects,
    resolveCanvasNodeSpawnPosition,
} from '../../lib/canvas-node-layout'
import {
    TEAM_DEFAULT_EXPANDED_HEIGHT,
    TEAM_DEFAULT_WIDTH,
} from '../../lib/team-layout'
import { createTeamParticipantKey } from '../team/participant-bindings'
import type { StudioState } from '../types'
import { resolveCanvasSpawnPosition } from './helpers'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

export function addAgentFromDraftImpl(
    get: GetState,
    set: SetState,
    agentIdCounter: { value: number },
    name: string,
    draftContent: AgentDraftContent,
    description?: string,
) {
    agentIdCounter.value++
    const id = `agent-${agentIdCounter.value}`
    const state = get()
    const spawnPosition = resolveCanvasNodeSpawnPosition({
        canvasCenter: state.canvasCenter,
        occupiedRects: collectVisibleCanvasNodeRects(state.agents, state.teams),
        width: AGENT_DEFAULT_WIDTH,
        height: AGENT_DEFAULT_HEIGHT,
    })
    const authoringDescription = description?.trim()

    const node = createAgentNode({
        id,
        name,
        x: spawnPosition.x,
        y: spawnPosition.y,
        agentBody: draftContent.agentBody || null,
        skillRefs: draftContent.skillRefs || [],
        model: draftContent.model || null,
        modelVariant: draftContent.modelVariant || null,
        mcpServerNames: draftContent.mcpServerNames || [],
        mcpBindingMap: draftContent.mcpBindingMap || {},
        planMode: draftContent.planMode || false,
        ...(authoringDescription
            ? {
                meta: {
                    authoring: {
                        description: authoringDescription,
                    },
                },
            }
            : {}),
    })

    set((state: StudioState) => ({
        agents: [...state.agents, node],
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

export function importTeamFromDraftImpl(
    get: GetState,
    set: SetState,
    makeId: (prefix: string) => string,
    name: string,
    draftContent: TeamDraftContent,
) {
    const teamId = makeId('team')
    const centerX = get().canvasCenter?.x ?? 200
    const centerY = get().canvasCenter?.y ?? 200
    const teamPosition = resolveCanvasSpawnPosition({
        canvasCenter: get().canvasCenter,
        existingCount: get().teams.length,
        width: TEAM_DEFAULT_WIDTH,
        height: TEAM_DEFAULT_EXPANDED_HEIGHT,
    })

    const participants: Record<string, WorkspaceTeamParticipantBinding> = {}
    const keyMapping: Record<string, string> = {}
    for (const originalKey of Object.keys(draftContent.participants)) {
        keyMapping[originalKey] = originalKey.startsWith('participant-')
            ? originalKey
            : createTeamParticipantKey()
    }
    let index = 0
    for (const [key, participant] of Object.entries(draftContent.participants)) {
        const internalKey = keyMapping[key]
        participants[internalKey] = {
            agentRef: participant.agentRef,
            displayName: participant.displayName || key,
            subscriptions: participant.subscriptions
                ? {
                    ...participant.subscriptions,
                    ...(participant.subscriptions.messagesFrom
                        ? {
                            messagesFrom: participant.subscriptions.messagesFrom.map((entry) => keyMapping[entry] || entry),
                        }
                        : {}),
                }
                : undefined,
            position: participant.position || { x: centerX + index * 300, y: centerY },
        }
        index++
    }

    const nextTeam = {
        id: teamId,
        name,
        description: draftContent.description,
        teamRules: draftContent.teamRules,
        position: draftContent.position || teamPosition,
        width: draftContent.width || TEAM_DEFAULT_WIDTH,
        height: draftContent.height || TEAM_DEFAULT_EXPANDED_HEIGHT,
        participants,
        relations: draftContent.relations.map((relation) => ({
            ...relation,
            between: relation.between.map((entry) => keyMapping[entry] || entry) as [string, string],
        })),
        createdAt: Date.now(),
        safety: draftContent.safety,
        hidden: draftContent.hidden || undefined,
        meta: draftContent.meta,
    }

    const existingAgents = get().agents
    const loadedDrafts = get().drafts
    const materializedAgents: WorkspaceAgentNode[] = []
    const materializedDraftIds = new Set<string>()

    for (const [key, binding] of Object.entries(participants)) {
        if (binding.agentRef.kind !== 'draft' || !binding.agentRef.draftId) continue

        const draftId = binding.agentRef.draftId
        const derivedTag = `draft:${draftId}`
        const alreadyOnCanvas = existingAgents.some((agent) => agent.meta?.derivedFrom === derivedTag)
        if (alreadyOnCanvas || materializedDraftIds.has(draftId)) continue

        const agentDraft = loadedDrafts[draftId]
        const agentContent = (agentDraft?.content && typeof agentDraft.content === 'object')
            ? agentDraft.content as AgentDraftContent
            : null
        const spawnPosition = resolveCanvasSpawnPosition({
            canvasCenter: get().canvasCenter,
            existingCount: existingAgents.length + materializedAgents.length,
            width: 320,
            height: 400,
            centerOffset: { x: 0, y: 260 },
        })

        const node = createAgentNode({
            id: makeId('agent'),
            name: agentDraft?.name || key,
            x: spawnPosition.x,
            y: spawnPosition.y,
            agentBody: agentContent?.agentBody || null,
            skillRefs: agentContent?.skillRefs || [],
            model: agentContent?.model || null,
            modelVariant: agentContent?.modelVariant || null,
            mcpServerNames: agentContent?.mcpServerNames || [],
            mcpBindingMap: agentContent?.mcpBindingMap || {},
            planMode: agentContent?.planMode || false,
            meta: { derivedFrom: derivedTag },
        })

        materializedAgents.push(node)
        materializedDraftIds.add(draftId)
    }

    set((state: StudioState) => ({
        teams: [...state.teams, nextTeam],
        agents: [...state.agents, ...materializedAgents],
        selectedTeamId: teamId,
        workspaceDirty: true,
    }))
    get().recordStudioChange({
        kind: 'team',
        teamIds: [teamId],
        agentIds: materializedAgents.map((agent) => agent.id),
    })
}
