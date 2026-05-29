// APM Studio — Global Store (Zustand)

import { create } from 'zustand'
import type { StudioState } from './types'
import { createWorkspaceSlice } from './workspace/slice'
import { createChatSlice } from './chat/slice'
import { createIntegrationSlice } from './integration/slice'
import { createTeamSlice } from './team/slice'
import { createAssistantSlice } from './assistant/slice'
import { createSessionSlice } from './session/session-entity-store'
import { initDraftAutoSave } from './workspace/draft-auto-save'

export const useStudioStore = create<StudioState>()((...a) => ({
    ...createWorkspaceSlice(...a),
    ...createChatSlice(...a),
    ...createIntegrationSlice(...a),
    ...createTeamSlice(...a),
    ...createAssistantSlice(...a),
    ...createSessionSlice(...a),
}))

// Auto-save agent drafts when config changes on derived-from-primitive agents
initDraftAutoSave(useStudioStore.subscribe)
