import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tempDir = ''

async function importStore() {
    vi.resetModules()
    process.env.STUDIO_DIR = tempDir
    return import('./config-store.js')
}

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roster-discord-test-'))
})

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    delete process.env.STUDIO_DIR
})

describe('discord config store', () => {
    it('redacts saved tokens from API-facing config', async () => {
        const store = await importStore()
        const saved = await store.writeDiscordConfig({
            enabled: true,
            token: 'secret-token',
            guildId: 'guild-1',
        })

        expect(store.redactDiscordConfig(saved)).toEqual({
            enabled: true,
            hasToken: true,
            guildId: 'guild-1',
            requireManageGuild: true,
            allowedRoleIds: [],
            allowedUserIds: [],
        })
    })

    it('preserves write-only token when updating other fields', async () => {
        const store = await importStore()
        await store.writeDiscordConfig({ enabled: true, token: 'secret-token' })
        const saved = await store.writeDiscordConfig({ guildId: 'guild-2' })

        expect(saved.token).toBe('secret-token')
        expect(saved.guildId).toBe('guild-2')
    })

    it('writes config and mappings with private file permissions', async () => {
        const store = await importStore()
        await store.writeDiscordConfig({ enabled: true, token: 'secret-token' })
        await store.writeDiscordMappings({ version: 1, workspaces: {}, channels: {} })

        const configStat = await fs.stat(path.join(tempDir, 'discord-config.json'))
        const mappingStat = await fs.stat(path.join(tempDir, 'discord-mappings.json'))

        expect(configStat.mode & 0o777).toBe(0o600)
        expect(mappingStat.mode & 0o777).toBe(0o600)
    })

    it('reads v1 mappings with v2 active-workspace fields defaulted safely', async () => {
        const store = await importStore()
        await fs.writeFile(path.join(tempDir, 'discord-mappings.json'), JSON.stringify({
            version: 1,
            workspaces: {
                'workspace-1': {
                    workingDir: '/tmp/workspace-1',
                    performerChannels: {},
                    actThreadChannels: {},
                    participantRoles: {},
                },
            },
            channels: {},
            roles: {},
        }), 'utf-8')

        const mappings = await store.readDiscordMappings()

        expect(mappings.version).toBe(1)
        expect(mappings.activeWorkspaceId).toBeUndefined()
        expect(mappings.archiveCategoryId).toBeUndefined()
        expect(mappings.performerCategoryId).toBeUndefined()
        expect(mappings.actCategoryId).toBeUndefined()
        expect(mappings.workspaces['workspace-1'].backfilledMessageIds).toEqual({})
        expect('participantRoles' in mappings.workspaces['workspace-1']).toBe(false)
        expect('roles' in mappings).toBe(false)
    })

    it('normalizes pending prompt metadata from mappings', async () => {
        const store = await importStore()
        await fs.writeFile(path.join(tempDir, 'discord-mappings.json'), JSON.stringify({
            version: 2,
            workspaces: {},
            channels: {},
            pendingInteractions: {
                valid: {
                    kind: 'permission',
                    workspaceId: 'workspace-1',
                    channelId: 'channel-1',
                    workingDir: '/tmp/workspace-1',
                    sessionId: 'session-1',
                    request: { id: 'permission-1' },
                    createdAt: 123,
                },
                invalid: {
                    kind: 'other',
                    workspaceId: 'workspace-1',
                    channelId: 'channel-1',
                    workingDir: '/tmp/workspace-1',
                    sessionId: 'session-1',
                    request: { id: 'permission-2' },
                },
            },
        }), 'utf-8')

        const mappings = await store.readDiscordMappings()

        expect(mappings.pendingInteractions).toEqual({
            valid: {
                kind: 'permission',
                workspaceId: 'workspace-1',
                channelId: 'channel-1',
                workingDir: '/tmp/workspace-1',
                sessionId: 'session-1',
                request: { id: 'permission-1' },
                createdAt: 123,
            },
        })
    })

    it('serializes concurrent mapping updates so event handlers do not lose writes', async () => {
        const store = await importStore()
        await store.writeDiscordMappings({ version: 2, workspaces: {}, channels: {}, pendingInteractions: {} })

        let releaseFirst = () => {}
        const firstCanFinish = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        const firstStarted = new Promise<void>((resolve) => {
            void store.updateDiscordMappings(async (mappings) => {
                resolve()
                await firstCanFinish
                mappings.channels['channel-a'] = {
                    kind: 'menu',
                    workspaceId: 'workspace-1',
                    workingDir: '/tmp/workspace-1',
                }
            })
        })
        await firstStarted

        const second = store.updateDiscordMappings((mappings) => {
            mappings.channels['channel-b'] = {
                kind: 'menu',
                workspaceId: 'workspace-1',
                workingDir: '/tmp/workspace-1',
            }
        })

        await new Promise((resolve) => setTimeout(resolve, 10))
        releaseFirst()
        await second

        const mappings = await store.readDiscordMappings()
        expect(Object.keys(mappings.channels).sort()).toEqual(['channel-a', 'channel-b'])
    })
})
