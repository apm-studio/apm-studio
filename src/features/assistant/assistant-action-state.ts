import type { StudioState } from '../../store/types'
import { useStudioStore } from '../../store'

type DraftRef = { kind: 'instruction' | 'skill'; id: string }

export type AssistantRefState = {
    agents: Map<string, string>
    teams: Map<string, string>
    drafts: Map<string, DraftRef>
    createdAgents: Set<string>
}

export function makeRefs(): AssistantRefState {
    return {
        agents: new Map(),
        teams: new Map(),
        drafts: new Map(),
        createdAgents: new Set(),
    }
}

export function store(): StudioState {
    return useStudioStore.getState()
}
