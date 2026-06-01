import type { TeamSafetyConfig } from './team-types.js'

export type AssistantActionDirection = 'both' | 'one-way'
export type AssistantParticipantEventType = 'runtime.idle'
export const ASSISTANT_MUTATION_TOOL_NAME = 'apply_studio_actions'
export type AssistantStudioNodeType = 'agent' | 'team'
export type AssistantStudioPanel = 'packages' | 'workspaceTracking' | 'terminal'
export type AssistantStudioSurface = 'canvas' | 'editor'
export type AssistantTeamEditorMode = 'team' | 'participant' | 'relation'

export interface AssistantParticipantSubscriptions {
    messagesFrom?: string[]
    messageTags?: string[]
    callboardKeys?: string[]
    eventTypes?: AssistantParticipantEventType[]
}

export interface AssistantParticipantSubscriptionsInput {
    messagesFromParticipantKeys?: string[]
    messagesFromAgentIds?: string[]
    messagesFromAgentRefs?: string[]
    messagesFromAgentNames?: string[]
    messageTags?: string[]
    callboardKeys?: string[]
    eventTypes?: AssistantParticipantEventType[]
}

// ── Blueprint sub-types ──────────────────────────────────────────────────────

export interface AssistantDraftBlueprint {
    ref?: string
    name: string
    content: string
    slug?: string
    description?: string
    tags?: string[]
    openEditor?: boolean
}

export interface AssistantModelBlueprint {
    provider: string
    modelId: string
}

export interface AssistantModelVariantSummary {
    id: string
    summary: string
}

export type AssistantTeamSafetyInput = TeamSafetyConfig

// Fields shared by createAgent (inline) and updateAgent (patch)
export interface AssistantAgentFields {
    model?: AssistantModelBlueprint | null
    modelVariant?: string | null
    description?: string | null
    // Skills to add
    addSkillUrns?: string[]
    addSkillDraftIds?: string[]
    addSkillDraftRefs?: string[]
    addSkillDrafts?: AssistantDraftBlueprint[]
    // Skills to remove  (update only)
    removeSkillUrns?: string[]
    removeSkillDraftIds?: string[]
    // MCP
    addMcpServerNames?: string[]
    removeMcpServerNames?: string[]
}

export interface AssistantTeamRelationBlueprint {
    sourceParticipantKey?: string
    sourceAgentId?: string
    sourceAgentRef?: string
    sourceAgentName?: string
    targetParticipantKey?: string
    targetAgentId?: string
    targetAgentRef?: string
    targetAgentName?: string
    direction?: AssistantActionDirection
    name: string
    description: string
}

// ── Workspace context ────────────────────────────────────────────────────────────

export interface AssistantDraftSummary {
    id: string
    kind: 'instruction' | 'skill'
    name: string
    slug?: string
    description?: string
    tags?: string[]
    saveState: 'unsaved' | 'saved'
}

export interface AssistantAvailableModelSummary {
    provider: string
    providerName: string
    modelId: string
    name: string
    variants?: AssistantModelVariantSummary[]
}

export interface AssistantWorkspaceAgentSummary {
    id: string
    name: string
    description?: string
    position?: { x: number; y: number }
    size?: { width: number; height: number }
    hidden?: boolean
    model: { provider: string; modelId: string } | null
    modelVariant: string | null
    skillUrns: string[]
    skillDraftIds: string[]
}

export interface AssistantWorkspaceTeamParticipantSummary {
    key: string
    agentName: string
    agentId: string | null
    displayName?: string
    description?: string
    subscriptions?: AssistantParticipantSubscriptions
}

export interface AssistantWorkspaceTeamRelationSummary {
    id: string
    name: string
    description?: string
    between: [string, string]
    direction: AssistantActionDirection
}

export interface AssistantWorkspaceTeamSummary {
    id: string
    name: string
    description?: string
    position?: { x: number; y: number }
    size?: { width: number; height: number }
    hidden?: boolean
    teamRules?: string[]
    safety?: AssistantTeamSafetyInput
    participants: AssistantWorkspaceTeamParticipantSummary[]
    relations: AssistantWorkspaceTeamRelationSummary[]
}

export interface AssistantWorkspaceViewSummary {
    selectedAgentId: string | null
    selectedTeamId: string | null
    selectedMarkdownEditorId: string | null
    activeChatAgentId: string | null
    viewMode: 'canvas' | 'full' | 'split'
    panels: {
        packages: boolean
        workspaceTracking: boolean
        terminal: boolean
        assistant: boolean
    }
}

export interface AssistantWorkspaceContext {
    workingDir: string
    view?: AssistantWorkspaceViewSummary
    agents: AssistantWorkspaceAgentSummary[]
    teams: AssistantWorkspaceTeamSummary[]
    drafts: AssistantDraftSummary[]
    availableModels: AssistantAvailableModelSummary[]
}

export interface AssistantStudioNodeFramePatch {
    position?: { x: number; y: number }
    size?: { width: number; height: number }
}

// ── Action types ─────────────────────────────────────────────────────────────

export type AssistantAction =
    // ── Instruction draft CRUD ──────────────────────────
    | {
        type: 'createInstructionDraft'
        ref?: string
        name: string
        content: string
        slug?: string
        description?: string
        tags?: string[]
        openEditor?: boolean
    }
    | {
        type: 'updateInstructionDraft'
        draftId?: string
        draftRef?: string
        draftName?: string
        name?: string
        content?: string
        description?: string
        tags?: string[]
    }
    | {
        type: 'deleteInstructionDraft'
        draftId?: string
        draftRef?: string
        draftName?: string
    }
    // ── Skill draft CRUD ───────────────────────────────
    | {
        type: 'createSkillDraft'
        ref?: string
        name: string
        content: string
        slug?: string
        description?: string
        tags?: string[]
        openEditor?: boolean
    }
    | {
        type: 'updateSkillDraft'
        draftId?: string
        draftRef?: string
        draftName?: string
        name?: string
        content?: string
        description?: string
        tags?: string[]
    }
    | {
        type: 'deleteSkillDraft'
        draftId?: string
        draftRef?: string
        draftName?: string
    }
    | {
        type: 'upsertSkillBundleFile'
        draftId?: string
        draftRef?: string
        draftName?: string
        path: string
        content: string
    }
    | {
        type: 'deleteSkillBundleEntry'
        draftId?: string
        draftRef?: string
        draftName?: string
        path: string
    }
    // ── Agent CRUD ─────────────────────────────────────
    | ({
        type: 'createAgent'
        ref?: string
        name: string
    } & AssistantAgentFields)
    | ({
        type: 'updateAgent'
        agentId?: string
        agentRef?: string
        agentName?: string
        name?: string
    } & AssistantAgentFields)
    | {
        type: 'deleteAgent'
        agentId?: string
        agentRef?: string
        agentName?: string
    }
    // ── Team CRUD ──────────────────────────────────────
    | {
        type: 'createTeam'
        ref?: string
        name: string
        description?: string
        teamRules?: string[]
        safety?: AssistantTeamSafetyInput
        // Inline participants + relations
        participantAgentIds?: string[]
        participantAgentRefs?: string[]
        participantAgentNames?: string[]
        relations?: AssistantTeamRelationBlueprint[]
    }
    | {
        type: 'updateTeam'
        teamId?: string
        teamRef?: string
        teamName?: string
        name?: string
        description?: string
        teamRules?: string[]
        safety?: AssistantTeamSafetyInput | null
    }
    | {
        type: 'deleteTeam'
        teamId?: string
        teamRef?: string
        teamName?: string
    }
    // ── Participant management ─────────────────────────
    | {
        type: 'attachAgentToTeam'
        teamId?: string
        teamRef?: string
        teamName?: string
        agentId?: string
        agentRef?: string
        agentName?: string
    }
    | {
        type: 'detachParticipantFromTeam'
        teamId?: string
        teamRef?: string
        teamName?: string
        participantKey?: string
        agentId?: string
        agentRef?: string
        agentName?: string
    }
    | {
        type: 'updateParticipantSubscriptions'
        teamId?: string
        teamRef?: string
        teamName?: string
        participantKey?: string
        agentId?: string
        agentRef?: string
        agentName?: string
        subscriptions: AssistantParticipantSubscriptionsInput | null
    }
    // ── Relation management ────────────────────────────
    | {
        type: 'connectAgents'
        teamId?: string
        teamRef?: string
        teamName?: string
        sourceParticipantKey?: string
        sourceAgentId?: string
        sourceAgentRef?: string
        sourceAgentName?: string
        targetParticipantKey?: string
        targetAgentId?: string
        targetAgentRef?: string
        targetAgentName?: string
        direction?: AssistantActionDirection
        name: string
        description: string
    }
    | {
        type: 'updateRelation'
        teamId?: string
        teamRef?: string
        teamName?: string
        relationId: string
        name?: string
        description?: string
        direction?: AssistantActionDirection
    }
    | {
        type: 'removeRelation'
        teamId?: string
        teamRef?: string
        teamName?: string
        relationId: string
    }
    // ── Studio UI and canvas operations ─────────────────
    | {
        type: 'showAgent'
        agentId?: string
        agentRef?: string
        agentName?: string
        surface?: AssistantStudioSurface
        reveal?: boolean
        editorFocus?: string
    }
    | {
        type: 'showTeam'
        teamId?: string
        teamRef?: string
        teamName?: string
        surface?: AssistantStudioSurface
        reveal?: boolean
        editorMode?: AssistantTeamEditorMode
        participantKey?: string
        relationId?: string
    }
    | {
        type: 'showDraft'
        draftId?: string
        draftRef?: string
        draftName?: string
        kind?: 'instruction' | 'skill'
    }
    | ({
        type: 'setStudioNodeVisibility'
        nodeType: 'agent'
        visible: boolean
    } & {
        agentId?: string
        agentRef?: string
        agentName?: string
    })
    | ({
        type: 'setStudioNodeVisibility'
        nodeType: 'team'
        visible: boolean
    } & {
        teamId?: string
        teamRef?: string
        teamName?: string
    })
    | ({
        type: 'setStudioNodeFrame'
        nodeType: 'agent'
    } & AssistantStudioNodeFramePatch & {
        agentId?: string
        agentRef?: string
        agentName?: string
    })
    | ({
        type: 'setStudioNodeFrame'
        nodeType: 'team'
    } & AssistantStudioNodeFramePatch & {
        teamId?: string
        teamRef?: string
        teamName?: string
    })
    | {
        type: 'setStudioPanel'
        panel: AssistantStudioPanel
        open: boolean
    }

export interface AssistantActionEnvelope {
    version: 1
    actions: AssistantAction[]
}
