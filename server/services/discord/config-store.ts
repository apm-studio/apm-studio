import fs from 'fs/promises'
import path from 'path'
import type {
    DiscordConfigUpdateRequest,
    DiscordIntegrationConfig,
    DiscordMappings,
    DiscordPendingInteraction,
    DiscordWorkspaceMapping,
    RedactedDiscordIntegrationConfig,
} from '../../../shared/discord-contracts.js'
import { STUDIO_DIR } from '../../lib/config.js'

const CONFIG_PATH = path.join(STUDIO_DIR, 'discord-config.json')
const MAPPINGS_PATH = path.join(STUDIO_DIR, 'discord-mappings.json')
const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
let mappingsUpdateQueue: Promise<unknown> = Promise.resolve()

function normalizeIdList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }
    return Array.from(new Set(
        value
            .map((entry) => typeof entry === 'string' ? entry.trim() : '')
            .filter(Boolean),
    ))
}

async function ensurePrivateParent(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: PRIVATE_DIR_MODE })
    await fs.chmod(path.dirname(filePath), PRIVATE_DIR_MODE).catch(() => {})
}

async function writePrivateJson(filePath: string, payload: unknown) {
    await ensurePrivateParent(filePath)
    const stat = await fs.lstat(filePath).catch(() => null)
    if (stat?.isSymbolicLink()) {
        throw new Error(`Refusing to write Discord config through symlink: ${filePath}`)
    }
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), { encoding: 'utf-8', mode: PRIVATE_FILE_MODE })
    await fs.chmod(tempPath, PRIVATE_FILE_MODE).catch(() => {})
    await fs.rename(tempPath, filePath)
    await fs.chmod(filePath, PRIVATE_FILE_MODE).catch(() => {})
}

export function redactDiscordConfig(config: DiscordIntegrationConfig): RedactedDiscordIntegrationConfig {
    return {
        enabled: config.enabled === true,
        hasToken: !!config.token?.trim(),
        ...(config.guildId?.trim() ? { guildId: config.guildId.trim() } : {}),
        requireManageGuild: config.requireManageGuild !== false,
        allowedRoleIds: normalizeIdList(config.allowedRoleIds),
        allowedUserIds: normalizeIdList(config.allowedUserIds),
    }
}

export async function readDiscordConfig(): Promise<DiscordIntegrationConfig> {
    try {
        const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
        const parsed = JSON.parse(raw) as Partial<DiscordIntegrationConfig>
        return {
            enabled: parsed.enabled === true,
            ...(typeof parsed.token === 'string' && parsed.token.trim() ? { token: parsed.token.trim() } : {}),
            ...(typeof parsed.guildId === 'string' && parsed.guildId.trim() ? { guildId: parsed.guildId.trim() } : {}),
            requireManageGuild: parsed.requireManageGuild !== false,
            allowedRoleIds: normalizeIdList(parsed.allowedRoleIds),
            allowedUserIds: normalizeIdList(parsed.allowedUserIds),
        }
    } catch {
        return { enabled: false, requireManageGuild: true, allowedRoleIds: [], allowedUserIds: [] }
    }
}

export async function writeDiscordConfig(
    patch: DiscordConfigUpdateRequest,
): Promise<DiscordIntegrationConfig> {
    const current = await readDiscordConfig()
    const next: DiscordIntegrationConfig = {
        ...current,
        ...(typeof patch.enabled === 'boolean' ? { enabled: patch.enabled } : {}),
        ...(typeof patch.requireManageGuild === 'boolean' ? { requireManageGuild: patch.requireManageGuild } : {}),
    }

    if (patch.clearToken) {
        delete next.token
    } else if (typeof patch.token === 'string' && patch.token.trim()) {
        next.token = patch.token.trim()
    }

    if (typeof patch.guildId === 'string') {
        const guildId = patch.guildId.trim()
        if (guildId) {
            next.guildId = guildId
        } else {
            delete next.guildId
        }
    }

    if (Array.isArray(patch.allowedRoleIds)) {
        next.allowedRoleIds = normalizeIdList(patch.allowedRoleIds)
    }
    if (Array.isArray(patch.allowedUserIds)) {
        next.allowedUserIds = normalizeIdList(patch.allowedUserIds)
    }

    next.requireManageGuild = next.requireManageGuild !== false
    next.allowedRoleIds = normalizeIdList(next.allowedRoleIds)
    next.allowedUserIds = normalizeIdList(next.allowedUserIds)

    await writePrivateJson(CONFIG_PATH, next)
    return next
}

export async function readDiscordMappings(): Promise<DiscordMappings> {
    try {
        const raw = await fs.readFile(MAPPINGS_PATH, 'utf-8')
        const parsed = JSON.parse(raw) as Partial<DiscordMappings>
        if (parsed.version !== 2) {
            return emptyDiscordMappings()
        }
        return {
            version: 2,
            ...(typeof parsed.activeWorkspaceId === 'string' && parsed.activeWorkspaceId ? { activeWorkspaceId: parsed.activeWorkspaceId } : {}),
            ...(typeof parsed.activeCategoryId === 'string' && parsed.activeCategoryId ? { activeCategoryId: parsed.activeCategoryId } : {}),
            ...(typeof parsed.archiveCategoryId === 'string' && parsed.archiveCategoryId ? { archiveCategoryId: parsed.archiveCategoryId } : {}),
            ...(typeof parsed.menuChannelId === 'string' && parsed.menuChannelId ? { menuChannelId: parsed.menuChannelId } : {}),
            workspaces: normalizeWorkspaceMappings(parsed.workspaces),
            channels: parsed.channels && typeof parsed.channels === 'object' ? parsed.channels : {},
            pendingInteractions: normalizePendingInteractions(parsed.pendingInteractions),
        }
    } catch {
        return emptyDiscordMappings()
    }
}

function emptyDiscordMappings(): DiscordMappings {
    return {
        version: 2,
        workspaces: {},
        channels: {},
        pendingInteractions: {},
    }
}

function normalizePendingInteractions(value: unknown): Record<string, DiscordPendingInteraction> {
    if (!value || typeof value !== 'object') {
        return {}
    }
    return Object.fromEntries(
        Object.entries(value as Record<string, Partial<DiscordPendingInteraction>>)
            .map(([id, raw]) => {
                if (!raw || typeof raw !== 'object') {
                    return null
                }
                if (raw.kind !== 'permission' && raw.kind !== 'question') {
                    return null
                }
                if (typeof raw.workspaceId !== 'string' || typeof raw.channelId !== 'string' || typeof raw.workingDir !== 'string' || typeof raw.sessionId !== 'string') {
                    return null
                }
                if (!raw.request || typeof raw.request !== 'object') {
                    return null
                }
                return [id, {
                    kind: raw.kind,
                    workspaceId: raw.workspaceId,
                    channelId: raw.channelId,
                    workingDir: raw.workingDir,
                    sessionId: raw.sessionId,
                    request: raw.request,
                    ...(typeof raw.createdAt === 'number' ? { createdAt: raw.createdAt } : {}),
                } satisfies DiscordPendingInteraction] as const
            })
            .filter((entry): entry is readonly [string, DiscordPendingInteraction] => !!entry),
    )
}

function normalizeWorkspaceMappings(value: unknown): Record<string, DiscordWorkspaceMapping> {
    if (!value || typeof value !== 'object') {
        return {}
    }
    return Object.fromEntries(
        Object.entries(value as Record<string, Partial<DiscordWorkspaceMapping>>).map(([workspaceId, raw]) => {
            const mapping: DiscordWorkspaceMapping = {
                workingDir: typeof raw.workingDir === 'string' ? raw.workingDir : '',
                ...(typeof raw.categoryId === 'string' ? { categoryId: raw.categoryId } : {}),
                ...(typeof raw.menuChannelId === 'string' ? { menuChannelId: raw.menuChannelId } : {}),
                agentCategories: raw.agentCategories && typeof raw.agentCategories === 'object' ? raw.agentCategories : {},
                teamCategories: raw.teamCategories && typeof raw.teamCategories === 'object' ? raw.teamCategories : {},
                agentChannels: raw.agentChannels && typeof raw.agentChannels === 'object' ? raw.agentChannels : {},
                agentThreadChannels: raw.agentThreadChannels && typeof raw.agentThreadChannels === 'object' ? raw.agentThreadChannels : {},
                teamThreadChannels: raw.teamThreadChannels && typeof raw.teamThreadChannels === 'object' ? raw.teamThreadChannels : {},
                backfilledMessageIds: raw.backfilledMessageIds && typeof raw.backfilledMessageIds === 'object' ? raw.backfilledMessageIds : {},
            }
            return [workspaceId, mapping]
        }),
    )
}

export async function writeDiscordMappings(mappings: DiscordMappings) {
    await writePrivateJson(MAPPINGS_PATH, { ...mappings, version: 2 })
}

export async function updateDiscordMappings(updater: (current: DiscordMappings) => DiscordMappings | void | Promise<DiscordMappings | void>) {
    const run = async () => {
        const current = await readDiscordMappings()
        const updated = (await updater(current)) || current
        await writeDiscordMappings(updated)
        return updated
    }
    const result = mappingsUpdateQueue.then(run, run)
    mappingsUpdateQueue = result.catch(() => undefined)
    return result
}

export function getOrCreateWorkspaceMapping(
    mappings: DiscordMappings,
    workspaceId: string,
    workingDir: string,
): DiscordWorkspaceMapping {
    const existing = mappings.workspaces[workspaceId]
    if (existing) {
        existing.workingDir = workingDir
        existing.agentCategories ||= {}
        existing.teamCategories ||= {}
        existing.agentChannels ||= {}
        existing.agentThreadChannels ||= {}
        existing.teamThreadChannels ||= {}
        existing.backfilledMessageIds ||= {}
        return existing
    }

    const created: DiscordWorkspaceMapping = {
        workingDir,
        agentCategories: {},
        teamCategories: {},
        agentChannels: {},
        agentThreadChannels: {},
        teamThreadChannels: {},
        backfilledMessageIds: {},
    }
    mappings.workspaces[workspaceId] = created
    return created
}
