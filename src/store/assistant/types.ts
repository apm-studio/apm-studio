export type AssistantModelSelection = {
    provider: string
    modelId: string
}

export type AssistantAvailableModel = {
    provider: string
    providerName: string
    modelId: string
    name: string
    variants?: Array<{
        id: string
        summary: string
    }>
}

export interface AssistantSlice {
    isAssistantOpen: boolean
    assistantModel: AssistantModelSelection | null
    assistantAvailableModels: AssistantAvailableModel[]
    appliedAssistantActionMessageIds: Record<string, true>
    assistantActionResults: Record<string, { applied: number; failed: number }>

    toggleAssistant: () => void
    setAssistantModel: (model: AssistantModelSelection | null) => void
    setAssistantAvailableModels: (models: AssistantAvailableModel[]) => void
    markAssistantActionsApplied: (messageId: string) => void
    recordAssistantActionResult: (messageId: string, result: { applied: number; failed: number }) => void
    resetAssistantRuntimeState: () => void
}
