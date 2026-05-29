import type { AssistantSlice } from './assistant/types'
import type { ChatSlice } from './chat/types'
import type { IntegrationSlice } from './integration/types'
import type { SessionSlice } from './session/types'
import type { TeamSlice } from './team/types'
import type { WorkspaceSlice } from './workspace/types'

export type StudioState = WorkspaceSlice & ChatSlice & IntegrationSlice & TeamSlice & AssistantSlice & SessionSlice
