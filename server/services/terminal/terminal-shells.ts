import fs from 'node:fs'
import path from 'node:path'
import { readGlobalConfigFile } from '../../lib/global-config.js'
import type { TerminalShellOption } from './terminal-types.js'

function shellName(shellPath: string) {
    return path.basename(shellPath) || shellPath
}

function isExecutable(filePath: string) {
    try {
        fs.accessSync(filePath, fs.constants.X_OK)
        return true
    } catch {
        return false
    }
}

function uniqueShellOptions(paths: string[]) {
    const seen = new Set<string>()
    return paths
        .map((entry) => entry.trim())
        .filter(Boolean)
        .filter((entry) => {
            if (seen.has(entry)) return false
            seen.add(entry)
            return true
        })
        .map((entry) => ({
            path: entry,
            name: shellName(entry),
            acceptable: path.isAbsolute(entry) ? isExecutable(entry) : true,
        }))
}

export async function resolveTerminalShell(): Promise<{ command: string; args: string[] }> {
    const explicitShell = process.env.APM_STUDIO_TERMINAL_SHELL?.trim()
    if (explicitShell) {
        return { command: explicitShell, args: process.platform === 'win32' ? [] : ['-l'] }
    }

    const config = await readGlobalConfigFile().catch(() => ({} as Record<string, unknown>))
    const configuredShell = typeof config.shell === 'string' ? config.shell.trim() : ''
    if (configuredShell) {
        return { command: configuredShell, args: process.platform === 'win32' ? [] : ['-l'] }
    }

    if (process.platform === 'win32') {
        return { command: process.env.ComSpec || 'cmd.exe', args: [] }
    }

    return { command: process.env.SHELL || '/bin/zsh', args: ['-l'] }
}

export async function listStudioTerminalShells(): Promise<TerminalShellOption[]> {
    if (process.platform === 'win32') {
        return uniqueShellOptions([
            process.env.ComSpec || 'cmd.exe',
            'powershell.exe',
            'pwsh.exe',
        ])
    }

    const candidates: string[] = []
    if (process.env.SHELL) {
        candidates.push(process.env.SHELL)
    }

    try {
        const shellFile = fs.readFileSync('/etc/shells', 'utf8')
        for (const line of shellFile.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (trimmed && !trimmed.startsWith('#')) {
                candidates.push(trimmed)
            }
        }
    } catch {
        // /etc/shells is not guaranteed in minimal environments.
    }

    candidates.push('/bin/zsh', '/bin/bash', '/bin/sh')
    return uniqueShellOptions(candidates)
}
