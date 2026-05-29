import type { IDisposable, IPty } from '@lydell/node-pty'

export interface TerminalSessionSummary {
    id: string
    title: string
    connected: boolean
}

export interface TerminalShellOption {
    path: string
    name: string
    acceptable: boolean
}

export interface TerminalSocket {
    readyState: number
    send(data: string | Uint8Array | ArrayBuffer): void
    close(code?: number, reason?: string): void
}

export interface TerminalOpenOptions {
    action: 'create' | 'attach'
    cwd: string
    targetId?: string
}

export interface TerminalSessionClient {
    socket: TerminalSocket
    setSession(sessionId: string | null): void
    send(payload: Record<string, unknown>): void
    sendOutput(data: string): void
}

export type TerminalProcess = Pick<IPty, 'pid' | 'onData' | 'onExit' | 'resize' | 'write' | 'kill'>

export type TerminalProcessFactoryInput = {
    command: string
    args: string[]
    cwd: string
    env: Record<string, string | undefined>
    cols: number
    rows: number
}

export type TerminalProcessFactory = (input: TerminalProcessFactoryInput) => TerminalProcess

export type ShellResolver = () => Promise<{ command: string; args: string[] }>

export interface TerminalManagerOptions {
    createProcess?: TerminalProcessFactory
    resolveShell?: ShellResolver
}

export interface TerminalSession {
    id: string
    title: string
    cwd: string
    process: TerminalProcess
    pid: number
    clients: Set<TerminalSessionClient>
    buffer: string
    dataDisposable: IDisposable
    exitDisposable: IDisposable
    closing: boolean
}
