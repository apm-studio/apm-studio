export interface ChatMessageToolInfo {
    name: string
    callId: string
    status: 'pending' | 'running' | 'completed' | 'error'
    title?: string
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
    output?: string
    error?: string
    time?: { start: number; end?: number }
}

export interface ChatMessagePart {
    id: string
    type: 'text' | 'reasoning' | 'tool' | 'step-start' | 'step-finish' | 'compaction'
    content?: string
    tool?: ChatMessageToolInfo
    step?: {
        reason?: string
        cost?: number
        tokens?: { input: number; output: number; reasoning: number }
    }
    compaction?: {
        auto: boolean
        overflow?: boolean
        summary?: string
    }
}

export interface ChatMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
    parts?: ChatMessagePart[]
    attachments?: Array<{ type: string; filename?: string; mime?: string }>
    metadata?: {
        agentName?: string
        modelId?: string
        provider?: string
        variant?: string
        isWakeUp?: boolean
    }
}
