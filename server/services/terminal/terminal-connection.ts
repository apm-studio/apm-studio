import type { TerminalSocket } from './terminal-types.js'

export const SOCKET_OPEN = 1

export interface TerminalConnectionOwner {
    handleClientMessage(connection: TerminalConnection, raw: string): void
    detachConnection(connection: TerminalConnection): void
}

export class TerminalConnection {
    private sessionId: string | null = null
    private readonly manager: TerminalConnectionOwner
    readonly socket: TerminalSocket
    readonly cwd: string

    constructor(
        manager: TerminalConnectionOwner,
        socket: TerminalSocket,
        cwd: string,
    ) {
        this.manager = manager
        this.socket = socket
        this.cwd = cwd
    }

    get currentSessionId() {
        return this.sessionId
    }

    setSession(sessionId: string | null) {
        this.sessionId = sessionId
    }

    send(payload: Record<string, unknown>) {
        if (this.socket.readyState !== SOCKET_OPEN) return
        try {
            this.socket.send(JSON.stringify(payload))
        } catch {
            this.close()
        }
    }

    sendOutput(data: string) {
        this.send({ type: 'output', data })
    }

    handleMessage(raw: string) {
        this.manager.handleClientMessage(this, raw)
    }

    close() {
        this.manager.detachConnection(this)
    }
}
