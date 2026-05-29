import type { AssistantAction } from '../../../shared/assistant-actions'
import {
    makeRefs,
    store,
    type AssistantRefState,
} from './assistant-action-state'
import { applyAssistantAgentAction } from './assistant-agent-actions'
import { applyAssistantDraftAction } from './assistant-draft-actions'
import { applyAssistantTeamAction } from './assistant-team-actions'
import { applyAssistantViewAction } from './assistant-view-actions'

type AssistantActionResult = { success: boolean }
type AssistantActionHandler = (
    action: AssistantAction,
    refs: AssistantRefState,
) => Promise<AssistantActionResult | null>

const ASSISTANT_ACTION_HANDLERS: AssistantActionHandler[] = [
    applyAssistantDraftAction,
    applyAssistantAgentAction,
    applyAssistantTeamAction,
    applyAssistantViewAction,
]

export async function applyAssistantAction(
    action: AssistantAction,
    refs: AssistantRefState = makeRefs(),
): Promise<AssistantActionResult> {
    try {
        for (const handler of ASSISTANT_ACTION_HANDLERS) {
            const result = await handler(action, refs)
            if (result) {
                return result
            }
        }
        return { success: false }
    } catch (err) {
        console.error(`[Assistant] Failed to apply ${(action as AssistantAction).type}:`, err)
        return { success: false }
    }
}

export async function applyAssistantActions(actions: AssistantAction[]) {
    const expectedWorkingDir = store().workingDir
    const refs = makeRefs()
    let applied = 0
    let failed = 0
    for (const action of actions) {
        if (store().workingDir !== expectedWorkingDir) {
            break
        }
        const result = await applyAssistantAction(action, refs)
        if (result.success) applied++
        else failed++
    }
    return { applied, failed }
}
