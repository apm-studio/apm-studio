// Canonical ModelSelection type shared by client and server.

export type ModelSelection = {
    provider: string
    modelId: string
} | null

export type ModelConfigV1 = {
    provider: string
    modelId: string
}

export interface ModelCapabilities {
    toolCall: boolean
    reasoning: boolean
    attachment: boolean
    temperature: boolean
    modalities: {
        input: string[]
        output: string[]
    }
}
