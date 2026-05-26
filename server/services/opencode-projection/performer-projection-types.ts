import type { ModelSelection } from '../../../shared/model-types.js'

export type AssetRef =
    | { kind: 'registry'; urn: string }
    | { kind: 'draft'; draftId: string }

export interface PerformerProjectionInput {
    performerId: string
    performerName: string
    talRef: AssetRef | null
    inlineInstruction?: string | null
    danceRefs: AssetRef[]
    model: ModelSelection
    modelVariant?: string | null
    mcpServerNames: string[]
    workingDir: string
    requestTargets?: Array<{
        performerId: string
        performerName: string
        description?: string
    }>
    scope?: 'workspace' | 'act'
    actId?: string
    extraTools?: Array<{
        name: string
        content: string
    }>
}

export type CodexProjectionPerformerSnapshot = {
    id?: string
    name?: string
    model?: ModelSelection | null
    modelVariant?: string | null
    talRef?: AssetRef | null
    inlineInstruction?: string | null
    danceRefs?: AssetRef[]
    mcpServerNames?: string[]
}
