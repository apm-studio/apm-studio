import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import type { AssistantModelSelection } from '../../store/assistant/types'
import type { ChatSessionState } from '../../store/session/chat-session-state'

export type AssistantActionApplySummary = {
    applied: number
    failed: number
}

export type AssistantActionStatusView = {
    toneClass: 'assistant-action-status--success' | 'assistant-action-status--warning' | 'assistant-action-status--error'
    label: string
}

export function groupAssistantModelsByProvider(models: RuntimeModelCatalogEntry[]) {
    return models.reduce<Record<string, RuntimeModelCatalogEntry[]>>((acc, model) => {
        if (!acc[model.providerName]) acc[model.providerName] = []
        acc[model.providerName].push(model)
        return acc
    }, {})
}

export function resolveAssistantModelLabel(
    assistantModel: AssistantModelSelection | null,
    selectedConnectedModel: RuntimeModelCatalogEntry | null | undefined,
) {
    return assistantModel
        ? (selectedConnectedModel?.name || assistantModel.modelId)
        : null
}

export function resolveAssistantStatusLabel(input: {
    isLoading: boolean
    activityKind: ChatSessionState['activityKind']
    sessionId: string | null
    sessionStatusType?: ChatSessionState['status']['type']
}) {
    if (input.isLoading) return 'Thinking'
    if (input.activityKind === 'interactive') return 'Needs input'
    if (input.activityKind === 'parked') return 'Waiting'
    if (!input.sessionId) return 'Ready'
    if (input.sessionStatusType === 'error') return 'Needs attention'
    return 'Ready'
}

export function buildAssistantActionStatusView(
    result: AssistantActionApplySummary | null | undefined,
): AssistantActionStatusView | null {
    if (!result) return null
    if (result.failed > 0 && result.applied > 0) {
        return {
            toneClass: 'assistant-action-status--warning',
            label: `Applied ${result.applied}, failed ${result.failed}`,
        }
    }
    if (result.failed > 0) {
        return {
            toneClass: 'assistant-action-status--error',
            label: `No changes applied (${result.failed} failed)`,
        }
    }
    return {
        toneClass: 'assistant-action-status--success',
        label: `Applied ${result.applied} change${result.applied === 1 ? '' : 's'}`,
    }
}
