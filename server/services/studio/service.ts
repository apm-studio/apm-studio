import { execFile } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import open from 'open'
import path from 'path'
import { promisify } from 'util'
import { ensureApmStudioDir } from '../../lib/apm-studio-paths.js'
import {
    getActiveProjectDir,
    getExplicitActiveProjectDir,
    setActiveProjectDir,
    readStudioConfig,
    writeStudioConfig,
} from '../../lib/config.js'
import type {
    StudioActivateResponse,
    StudioConfig,
    StudioConfigPatch,
    StudioConfigResponse,
    StudioOpenPathResponse,
    StudioPickDirectoryResponse,
} from '../../../shared/studio-contracts.js'
import type { ApiServiceFailure } from '../../../shared/api-contracts.js'
import { invalidateAll } from '../../lib/cache.js'
import { apiServiceFailure } from '../../lib/api-service-failure.js'

const execFileAsync = promisify(execFile)

async function pickDirectoryMac(prompt: string) {
    const escapedPrompt = prompt
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
    const { stdout } = await execFileAsync('osascript', [
        '-e',
        `POSIX path of (choose folder with prompt "${escapedPrompt}")`,
    ])
    return stdout.trim()
}

async function pickDirectoryWindows(prompt: string) {
    const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        `$dialog.Description = ${JSON.stringify(prompt)}`,
        '$dialog.ShowNewFolderButton = $true',
        'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
        '  [Console]::Out.Write($dialog.SelectedPath)',
        '  exit 0',
        '}',
        'exit 1',
    ].join('; ')

    const candidates = ['powershell.exe', 'pwsh.exe', 'pwsh', 'powershell']
    let lastError: unknown = null

    for (const command of candidates) {
        try {
            const { stdout } = await execFileAsync(command, [
                '-NoProfile',
                '-STA',
                '-Command',
                script,
            ], {
                windowsHide: true,
            })
            const selectedPath = stdout.trim()
            if (selectedPath) {
                return selectedPath
            }
        } catch (error) {
            lastError = error
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Windows folder picker failed')
}

export async function pickDirectory(prompt: string): Promise<StudioPickDirectoryResponse> {
    const title = String(prompt || 'Select Folder')

    if (process.platform === 'darwin') {
        return { path: await pickDirectoryMac(title) }
    }

    if (process.platform === 'win32') {
        return { path: await pickDirectoryWindows(title) }
    }

    throw new Error(`Folder picker is not available on ${os.platform()}. Enter a path manually.`)
}

export async function pickWorkingDirectory(): Promise<StudioPickDirectoryResponse> {
    return pickDirectory('Select Working Directory for Workspace')
}

export async function getStudioConfig(): Promise<StudioConfigResponse> {
    const config = await readStudioConfig()
    const activeProjectDir = getExplicitActiveProjectDir()
    return activeProjectDir
        ? { ...config, projectDir: activeProjectDir }
        : config
}

export async function updateStudioConfig(patch: StudioConfigPatch): Promise<StudioConfig> {
    return writeStudioConfig(patch)
}

export async function initializeStudioProject(workingDir: string) {
    const resolved = path.resolve(workingDir)
    await ensureApmStudioDir(resolved)
    setActiveProjectDir(resolved)
    invalidateAll()
    return getActiveProjectDir()
}

export async function activateStudioProject(workingDir: string): Promise<StudioActivateResponse | ApiServiceFailure> {
    if (!workingDir) {
        return apiServiceFailure(400, 'workingDir is required')
    }

    const resolved = path.resolve(workingDir)

    try {
        const stat = await fs.stat(resolved)
        if (!stat.isDirectory()) {
            return apiServiceFailure(400, 'workingDir is not a directory')
        }
    } catch {
        return apiServiceFailure(400, `Directory not found: ${resolved}`)
    }

    const activeProjectDir = await initializeStudioProject(resolved)

    import('../studio-assistant/assistant-service.js').then(({ ensureAssistantAgent }) =>
        ensureAssistantAgent(resolved).catch(() => {}),
    )

    return {
        ok: true as const,
        activeProjectDir,
    }
}

export async function openStudioPath(targetPath: string): Promise<StudioOpenPathResponse | ApiServiceFailure> {
    if (!targetPath) {
        return apiServiceFailure(400, 'path is required')
    }

    const resolved = path.resolve(targetPath)

    try {
        await fs.stat(resolved)
    } catch {
        return apiServiceFailure(404, `Path not found: ${resolved}`)
    }

    try {
        await open(resolved)
        return {
            ok: true as const,
            path: resolved,
        }
    } catch (error) {
        return apiServiceFailure(500, error instanceof Error ? error.message : 'Failed to open path')
    }
}
