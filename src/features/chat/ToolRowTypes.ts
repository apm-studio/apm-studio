import type { ChatMessageToolInfo } from '../../store/session/chat-message-types'

export type ToolRowProps = {
    tool: ChatMessageToolInfo
    pending: boolean
    isError: boolean
}
