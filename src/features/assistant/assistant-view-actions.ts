import type { AssistantAction } from '../../../shared/assistant-actions'
import {
    applyNodeReveal,
    applyNodeSelection,
    setNodeFrame,
    setNodeVisibility,
} from './assistant-action-canvas'
import {
    getTeamById,
    hasRelation,
    resolveAgentId,
    resolveAnyDraftId,
    resolveStudioNodeId,
    resolveTeamId,
} from './assistant-action-resolvers'
import {
    store,
    type AssistantRefState,
} from './assistant-action-state'

export async function applyAssistantViewAction(
    action: AssistantAction,
    refs: AssistantRefState,
): Promise<{ success: boolean } | null> {
    switch (action.type) {
        case 'showAgent': {
            const agentId = resolveAgentId(refs, action)
            if (!agentId) return { success: false }
            if (action.surface === 'editor') {
                store().openAgentEditor(agentId, action.editorFocus || null)
            } else {
                applyNodeSelection(agentId, 'agent')
            }
            if (action.reveal !== false) {
                applyNodeReveal(agentId, 'agent')
            }
            return { success: true }
        }
        case 'showTeam': {
            const teamId = resolveTeamId(refs, action)
            if (!teamId) return { success: false }
            const team = getTeamById(teamId)
            if (!team) return { success: false }

            store().closeEditor()
            applyNodeSelection(teamId, 'team')
            if (action.reveal !== false) {
                applyNodeReveal(teamId, 'team')
            }
            if (action.surface === 'editor') {
                if (action.editorMode === 'participant') {
                    if (!action.participantKey || !team.participants[action.participantKey]) return { success: false }
                    store().openTeamParticipantEditor(teamId, action.participantKey)
                } else if (action.editorMode === 'relation') {
                    if (!action.relationId || !hasRelation(teamId, action.relationId)) return { success: false }
                    store().openTeamRelationEditor(teamId, action.relationId)
                } else {
                    store().openTeamEditor(teamId, 'team')
                }
            }
            return { success: true }
        }
        case 'showDraft': {
            const draftId = resolveAnyDraftId(refs, action)
            if (!draftId) return { success: false }
            store().closeEditor()
            return { success: store().openDraftEditor(draftId) !== null }
        }
        case 'setStudioNodeVisibility': {
            const nodeId = resolveStudioNodeId(refs, action.nodeType, action)
            if (!nodeId) return { success: false }
            setNodeVisibility(nodeId, action.nodeType, action.visible)
            if (action.visible) {
                applyNodeReveal(nodeId, action.nodeType)
            }
            return { success: true }
        }
        case 'setStudioNodeFrame': {
            const nodeId = resolveStudioNodeId(refs, action.nodeType, action)
            if (!nodeId) return { success: false }
            if (!action.position && !action.size) return { success: false }
            setNodeFrame(nodeId, action.nodeType, {
                ...(action.position ? { position: action.position } : {}),
                ...(action.size ? { size: action.size } : {}),
            })
            applyNodeReveal(nodeId, action.nodeType)
            return { success: true }
        }
        case 'setStudioPanel': {
            switch (action.panel) {
                case 'packages':
                    store().setPackageLibraryOpen(action.open)
                    break
                case 'workspaceTracking':
                    store().setTrackingOpen(action.open)
                    break
                case 'terminal':
                    store().setTerminalOpen(action.open)
                    break
                default:
                    return { success: false }
            }
            return { success: true }
        }
        default:
            return null
    }
}
