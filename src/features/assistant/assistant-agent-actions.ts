import type { AssistantAction } from '../../../shared/assistant-actions'
import { applyAgentFields } from './assistant-action-agent-fields'
import { resolveAgentId } from './assistant-action-resolvers'
import { store, type AssistantRefState } from './assistant-action-state'

export async function applyAssistantAgentAction(
    action: AssistantAction,
    refs: AssistantRefState,
): Promise<{ success: boolean } | null> {
    switch (action.type) {
        case 'createAgent': {
            const agentId = store().addAgent(action.name)
            if (action.ref) refs.agents.set(action.ref, agentId)
            refs.createdAgents.add(agentId)
            await applyAgentFields(agentId, action, refs)
            return { success: true }
        }
        case 'updateAgent': {
            const agentId = resolveAgentId(refs, action)
            if (!agentId) return { success: false }
            if (action.name) store().updateAgentName(agentId, action.name)
            await applyAgentFields(agentId, action, refs)
            return { success: true }
        }
        case 'deleteAgent': {
            const agentId = resolveAgentId(refs, action)
            if (!agentId) return { success: false }
            store().removeAgent(agentId)
            return { success: true }
        }
        default:
            return null
    }
}
