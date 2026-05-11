import { upgradeWebSocket } from '@hono/node-server'
import { Hono } from 'hono'
import type { WSContext, WSMessageReceive } from 'hono/ws'
import type { WebSocket } from 'ws'
import { terminalManager } from '../services/terminal-service.js'
import type { TerminalConnection } from '../services/terminal-service.js'

type ResolveDefaultCwd = string | (() => string)

function resolveDefaultCwd(defaultCwd: ResolveDefaultCwd) {
    return typeof defaultCwd === 'function' ? defaultCwd() : defaultCwd
}

function normalizeMessageData(data: WSMessageReceive): string | null {
    if (typeof data === 'string') return data
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
    if (ArrayBuffer.isView(data)) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
    }
    return null
}

function closeSocket(ws: WSContext<WebSocket>) {
    try {
        ws.close()
    } catch {
        // Best-effort close after a failed terminal startup.
    }
}

export function createTerminalRoutes(defaultCwd: ResolveDefaultCwd) {
    const terminalRoutes = new Hono()

    terminalRoutes.get('/ws/terminal', upgradeWebSocket((c) => {
        const options = terminalManager.normalizeOpenOptions({
            action: c.req.query('action'),
            targetId: c.req.query('id'),
            cwd: c.req.query('cwd') || resolveDefaultCwd(defaultCwd),
        })

        let connection: TerminalConnection | null = null
        let closed = false
        const pendingMessages: string[] = []

        const connectionReady = (ws: WSContext<WebSocket>) => {
            terminalManager.open(ws, options)
                .then((nextConnection) => {
                    if (closed) {
                        nextConnection.close()
                        closeSocket(ws)
                        return
                    }
                    connection = nextConnection
                    for (const message of pendingMessages.splice(0)) {
                        connection.handleMessage(message)
                    }
                })
                .catch((error: unknown) => {
                    const message = error instanceof Error && error.message ? error.message : 'Terminal failed to start.'
                    try {
                        ws.send(JSON.stringify({ type: 'error', message: `Failed: ${message}` }))
                    } catch {
                        // The client may have disconnected while startup was still pending.
                    }
                    closeSocket(ws)
                })
        }

        return {
            onOpen(_event, ws) {
                connectionReady(ws)
            },
            onMessage(event) {
                const message = normalizeMessageData(event.data)
                if (!message) return
                if (connection) {
                    connection.handleMessage(message)
                    return
                }
                pendingMessages.push(message)
            },
            onClose() {
                closed = true
                connection?.close()
                connection = null
                pendingMessages.length = 0
            },
            onError() {
                closed = true
                connection?.close()
                connection = null
                pendingMessages.length = 0
            },
        }
    }))

    return terminalRoutes
}

export default createTerminalRoutes
