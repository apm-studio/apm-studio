// Server Configuration & Studio Config Helpers

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createHash } from 'crypto'
import {
    STUDIO_DEV_API_PORT,
    STUDIO_DEV_OPENCODE_PORT,
    STUDIO_RELEASE_APP_PORT,
    STUDIO_RELEASE_OPENCODE_PORT,
} from '../../shared/default-ports.js'

const MIN_PORT = 1
const MAX_PORT = 65535

function resolvePort(name: 'PORT' | 'OPENCODE_PORT', value: string | undefined, fallback: number) {
    const trimmed = value?.trim()
    if (!trimmed) {
        return fallback
    }

    if (!/^\d+$/.test(trimmed)) {
        throw new Error(`Invalid ${name}: ${value}. Expected an integer from ${MIN_PORT} to ${MAX_PORT}.`)
    }

    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
        throw new Error(`Invalid ${name}: ${value}. Expected an integer from ${MIN_PORT} to ${MAX_PORT}.`)
    }

    return parsed
}

function resolveDefaultProjectDir() {
    if (process.env.PROJECT_DIR) {
        return path.resolve(process.env.PROJECT_DIR)
    }

    if (resolveProductionMode()) {
        return path.resolve(process.cwd())
    }

    return path.resolve(process.cwd(), '..')
}

function resolveProductionMode() {
    const explicit = process.env.AGENT_ROASTER_PRODUCTION?.trim()
    if (explicit) {
        return explicit === '1'
    }

    return process.env.DOT_STUDIO_PRODUCTION === '1'
}

// ── Constants ───────────────────────────────────────────
export const IS_PRODUCTION = resolveProductionMode()
const DEFAULT_PORT = IS_PRODUCTION ? STUDIO_RELEASE_APP_PORT : STUDIO_DEV_API_PORT
const DEFAULT_OPENCODE_PORT = IS_PRODUCTION ? STUDIO_RELEASE_OPENCODE_PORT : STUDIO_DEV_OPENCODE_PORT

export const PORT = resolvePort('PORT', process.env.PORT, DEFAULT_PORT)
export const DEFAULT_PROJECT_DIR = resolveDefaultProjectDir()
export const STUDIO_DIR = process.env.STUDIO_DIR || path.join(os.homedir(), '.agent-roaster')
export const STUDIO_OPENCODE_CONFIG_DIR = path.join(STUDIO_DIR, 'opencode')
export const OPENCODE_PORT = resolvePort('OPENCODE_PORT', process.env.OPENCODE_PORT, DEFAULT_OPENCODE_PORT)
export const OPENCODE_URL = `http://localhost:${OPENCODE_PORT}`
export const STUDIO_CONFIG_PATH = path.join(STUDIO_DIR, 'studio-config.json')

// ── Mutable Active Project Dir ──────────────────────────
let _activeProjectDir: string | null = null

export function getActiveProjectDir(): string {
    return _activeProjectDir || DEFAULT_PROJECT_DIR
}

export function getExplicitActiveProjectDir(): string | null {
    return _activeProjectDir
}

export function setActiveProjectDir(dir: string): void {
    _activeProjectDir = dir
}

// ── Studio Config ───────────────────────────────────────
export interface StudioConfig {
    theme?: 'light' | 'dark'
    lastWorkspaceId?: string
}

export async function readStudioConfig(): Promise<StudioConfig> {
    try {
        const raw = await fs.readFile(STUDIO_CONFIG_PATH, 'utf-8')
        const parsed = JSON.parse(raw) as { theme?: 'light' | 'dark'; lastWorkspaceId?: string; lastStage?: string }
        return {
            theme: parsed.theme,
            lastWorkspaceId: parsed.lastWorkspaceId ?? parsed.lastStage,
        }
    } catch {
        return {}
    }
}

export async function writeStudioConfig(partial: Partial<StudioConfig>): Promise<StudioConfig> {
    await fs.mkdir(STUDIO_DIR, { recursive: true })
    const current = await readStudioConfig()
    const merged = { ...current, ...partial }
    await fs.writeFile(STUDIO_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8')
    return merged
}

// ── Workspaces Dir ──────────────────────────────────────
export function workspacesDir(): string {
    return path.join(STUDIO_DIR, 'workspaces')
}

export function workspaceDir(workspaceId: string): string {
    return path.join(STUDIO_DIR, 'workspaces', workspaceId)
}

export function workspaceActRuntimeDir(workspaceId: string, actId: string, threadId: string): string {
    return path.join(STUDIO_DIR, 'workspaces', workspaceId, 'act-runtime', actId, threadId)
}

export function workspaceIdForDir(workingDir: string): string {
    return createHash('sha1').update(workingDir).digest('hex').slice(0, 16)
}
