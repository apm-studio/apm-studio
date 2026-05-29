import { useEffect, useMemo } from 'react'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import {
    isAssistantCompatibleModel,
    pickPreferredAssistantModel,
    toAssistantAvailableModels,
} from '../../lib/assistant-models'
import type { AssistantAvailableModel, AssistantModelSelection } from '../../store/assistant/types'

function findSelectedConnectedModel(
    models: RuntimeModelCatalogEntry[],
    assistantModel: AssistantModelSelection | null,
) {
    if (!assistantModel) {
        return null
    }

    return models.find((model) => (
        model.provider === assistantModel.provider
        && model.id === assistantModel.modelId
    )) || null
}

export function useAssistantModels({
    models,
    assistantModel,
    setAssistantModel,
    setAssistantAvailableModels,
}: {
    models: RuntimeModelCatalogEntry[] | undefined
    assistantModel: AssistantModelSelection | null
    setAssistantModel: (model: AssistantModelSelection | null) => void
    setAssistantAvailableModels: (models: AssistantAvailableModel[]) => void
}) {
    const connectedModels = useMemo(
        () => (models ?? []).filter(isAssistantCompatibleModel),
        [models],
    )
    const selectedConnectedModel = useMemo(
        () => findSelectedConnectedModel(connectedModels, assistantModel),
        [assistantModel, connectedModels],
    )
    const availableAssistantModels = useMemo(
        () => toAssistantAvailableModels(connectedModels),
        [connectedModels],
    )

    useEffect(() => {
        setAssistantAvailableModels(availableAssistantModels)
    }, [availableAssistantModels, setAssistantAvailableModels])

    useEffect(() => {
        if (connectedModels.length === 0) {
            if (assistantModel) {
                setAssistantModel(null)
            }
            return
        }

        if (!selectedConnectedModel) {
            const preferredModel = pickPreferredAssistantModel(availableAssistantModels)
            setAssistantModel(
                preferredModel
                    ? { provider: preferredModel.provider, modelId: preferredModel.modelId }
                    : null,
            )
        }
    }, [assistantModel, availableAssistantModels, connectedModels, selectedConnectedModel, setAssistantModel])

    return {
        connectedModels,
        hasModels: connectedModels.length > 0,
        selectedConnectedModel,
    }
}
