import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalManager, type TerminalSocket } from './terminal-service.js'

type DataListener = (value: string) => void
type ExitListener = (value: { exitCode: number }) => void

class FakeTerminalProcess {
    pid = 4242
    killed = false
    writes: string[] = []
    resizes: Array<{ cols: number; rows: number }> = []
    private dataListeners = new Set<DataListener>()
    private exitListeners = new Set<ExitListener>()

    onData(listener: DataListener) {
        this.dataListeners.add(listener)
        return { dispose: () => this.dataListeners.delete(listener) }
    }

    onExit(listener: ExitListener) {
        this.exitListeners.add(listener)
        return { dispose: () => this.exitListeners.delete(listener) }
    }

    resize(cols: number, rows: number) {
        this.resizes.push({ cols, rows })
    }

    write(data: string | Buffer) {
        this.writes.push(String(data))
    }

    kill() {
        this.killed = true
    }

    emitData(value: string) {
        for (const listener of this.dataListeners) {
            listener(value)
        }
    }

    emitExit(exitCode = 0) {
        for (const listener of this.exitListeners) {
            listener({ exitCode })
        }
    }
}

class FakeSocket implements TerminalSocket {
    readyState = 1
    sent: string[] = []
    closed = false

    send(data: string | Uint8Array | ArrayBuffer) {
        this.sent.push(String(data))
    }

    close() {
        this.closed = true
        this.readyState = 3
    }

    jsonMessages() {
        return this.sent.map((entry) => JSON.parse(entry) as Record<string, unknown>)
    }
}

function createHarness() {
    const processes: FakeTerminalProcess[] = []
    const manager = new TerminalManager({
        resolveShell: async () => ({ command: '/bin/zsh', args: ['-l'] }),
        createProcess: vi.fn((input) => {
            expect(input.command).toBe('/bin/zsh')
            expect(input.args).toEqual(['-l'])
            expect(input.env.EIGHTPM_STUDIO_TERMINAL).toBe('1')
            const proc = new FakeTerminalProcess()
            processes.push(proc)
            return proc
        }),
    })

    return { manager, processes }
}

describe('TerminalManager', () => {
    const managers: TerminalManager[] = []

    afterEach(() => {
        for (const manager of managers.splice(0)) {
            manager.disposeAll()
        }
    })

    it('keeps a Studio-owned terminal process alive across WebSocket disconnect and attach', async () => {
        const { manager, processes } = createHarness()
        managers.push(manager)
        const firstSocket = new FakeSocket()
        const firstConnection = await manager.open(firstSocket, { action: 'create', cwd: '/tmp/workspace' })
        const sessionId = firstSocket.jsonMessages().find((msg) => msg.type === 'connected')?.id

        expect(typeof sessionId).toBe('string')
        expect(processes).toHaveLength(1)

        processes[0].emitData('hello\n')
        firstConnection.close()

        expect(processes[0].killed).toBe(false)

        const secondSocket = new FakeSocket()
        await manager.open(secondSocket, {
            action: 'attach',
            cwd: '/tmp/workspace',
            targetId: String(sessionId),
        })

        const secondMessages = secondSocket.jsonMessages()
        expect(secondMessages.some((msg) => msg.type === 'output' && msg.data === 'hello\n')).toBe(true)
        expect(secondMessages.some((msg) => msg.type === 'attached' && msg.id === sessionId)).toBe(true)
    })

    it('forwards input and resize messages to the local PTY', async () => {
        const { manager, processes } = createHarness()
        managers.push(manager)
        const socket = new FakeSocket()
        const connection = await manager.open(socket, { action: 'create', cwd: '/tmp/workspace' })

        connection.handleMessage(JSON.stringify({ type: 'input', data: 'pwd\r' }))
        connection.handleMessage(JSON.stringify({ type: 'resize', cols: 88, rows: 24 }))

        expect(processes[0].writes).toEqual(['pwd\r'])
        expect(processes[0].resizes).toEqual([{ cols: 88, rows: 24 }])
    })

    it('kills only the requested Studio terminal session', async () => {
        const { manager, processes } = createHarness()
        managers.push(manager)
        const socket = new FakeSocket()
        const connection = await manager.open(socket, { action: 'create', cwd: '/tmp/workspace' })
        const sessionId = socket.jsonMessages().find((msg) => msg.type === 'connected')?.id

        connection.handleMessage(JSON.stringify({ type: 'kill', id: sessionId }))

        expect(processes[0].killed).toBe(true)
        expect(manager.listSessions('/tmp/workspace')).toEqual([])
        expect(socket.jsonMessages().some((msg) => msg.type === 'exit' && msg.id === sessionId)).toBe(true)
    })
})
