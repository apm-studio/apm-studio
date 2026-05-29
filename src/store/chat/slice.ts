/**
 * Chat slice — thin composition root.
 *
 * Domain logic is split into:
 *   - chat-internals.ts   — shared helpers (sync, system messages)
 *   - chat-approvals.ts   — permission / question handlers
 *
 * This file owns agent standalone chat, session management, and slash commands.
 */
import type { StateCreator } from 'zustand'
import type { StudioState } from '../types'
import type { ChatSlice } from './types'
import {
    appendChatMessage as appendChatMessageHelper,
} from './chat-internals'
import { createChatApprovals } from './chat-approvals'
import { createChatSessionActions } from './chat-session-actions'

export const createChatSlice: StateCreator<
    StudioState,
    [],
    [],
    ChatSlice
> = (set, get) => {
    const approvals = createChatApprovals(set, get)
    const sessionActions = createChatSessionActions(set, get)

    return {
        activeChatAgentId: null,
        sessions: [],

        setActiveChatAgent: (agentId) => set({ activeChatAgentId: agentId }),

        addChatMessage: (chatKey, msg) => appendChatMessageHelper(set, get, chatKey, msg),

        // ── Approvals (delegated) ───────────────────
        ...approvals,
        ...sessionActions,
    }
}
