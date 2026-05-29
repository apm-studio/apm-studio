import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { SavedWorkspaceSnapshot, WorkspaceAgentNode } from '../../../shared/workspace-contracts.js'

const pruneStaleAgentProjectionsMock = vi.fn()
const ensureAssistantAgentMock = vi.fn()

vi.mock('../opencode-projection/workspace-agent-projection-service.js', () => ({
    pruneStaleAgentProjections: pruneStaleAgentProjectionsMock,
}))

vi.mock('.../studio-assistant/assistant-service.js', () => ({
    ensureAssistantAgent: ensureAssistantAgentMock,
}))

function workspaceAgent(overrides: Partial<WorkspaceAgentNode> & { id: string }): WorkspaceAgentNode {
    const { id, ...rest } = overrides
    return {
        ...rest,
        id,
        name: overrides.name || id,
        position: overrides.position || { x: 0, y: 0 },
        scope: overrides.scope || 'shared',
        model: overrides.model === undefined ? null : overrides.model,
        instructionRef: overrides.instructionRef || null,
        skillRefs: overrides.skillRefs || [],
        mcpServerNames: overrides.mcpServerNames || [],
    }
}

function workspace(
    workingDir: string,
    agents: WorkspaceAgentNode[],
    overrides: Partial<SavedWorkspaceSnapshot> = {},
): SavedWorkspaceSnapshot {
    return {
        schemaVersion: 1,
        workingDir,
        agents,
        teams: [],
        markdownEditors: [],
        ...overrides,
    }
}

describe('saveWorkspaceSnapshot', () => {
    let studioDir: string

    beforeEach(async () => {
        studioDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-workspace-'))
        process.env.APM_STUDIO_HOME = studioDir
        pruneStaleAgentProjectionsMock.mockReset().mockResolvedValue(false)
        ensureAssistantAgentMock.mockReset().mockResolvedValue('studio-assistant')
        vi.resetModules()
    })

    afterEach(async () => {
        delete process.env.APM_STUDIO_HOME
        await fs.rm(studioDir, { recursive: true, force: true }).catch(() => {})
        vi.clearAllMocks()
    })

    it('prunes stale agent projections using the saved agent ids', async () => {
        const { saveWorkspaceSnapshot } = await import('./service.js')
        const workingDir = path.join(studioDir, 'project')

        const result = await saveWorkspaceSnapshot(workspace(workingDir, [
            workspaceAgent({ id: 'agent-1' }),
            workspaceAgent({ id: 'agent-2' }),
        ]))

        expect(result.ok).toBe(true)
        expect(pruneStaleAgentProjectionsMock).toHaveBeenCalledWith(workingDir, ['agent-1', 'agent-2'])
    })

    it('lists workspace agents from the saved workspace snapshot', async () => {
        const { saveWorkspaceSnapshot, listWorkspaceAgentsForDir } = await import('./service.js')
        const workingDir = path.join(studioDir, 'project')

        await saveWorkspaceSnapshot(workspace(workingDir, [
            workspaceAgent({ id: 'agent-1', name: 'Agent 1', model: { provider: 'openai', modelId: 'gpt-5' } }),
            workspaceAgent({ id: 'agent-2', name: 'Agent 2', model: null }),
        ]))

        await expect(listWorkspaceAgentsForDir(workingDir)).resolves.toEqual([
            expect.objectContaining({ id: 'agent-1', name: 'Agent 1', model: { provider: 'openai', modelId: 'gpt-5' } }),
            expect.objectContaining({ id: 'agent-2', name: 'Agent 2', model: null }),
        ])
    })

    it('stores saved workspace snapshots as current Studio documents', async () => {
        const { getSavedWorkspace, saveWorkspaceSnapshot } = await import('./service.js')
        const workingDir = path.join(studioDir, 'project')

        const saved = await saveWorkspaceSnapshot(workspace(workingDir, [
            workspaceAgent({ id: 'agent-1', name: 'Agent 1', model: null }),
        ]))

        expect(saved.ok).toBe(true)
        if (!saved.ok) {
            return
        }

        const raw = JSON.parse(await fs.readFile(path.join(studioDir, 'workspaces', saved.id, 'workspace.json'), 'utf-8'))
        expect(raw).toEqual(expect.objectContaining({
            schemaVersion: 1,
            product: 'APM Studio',
            workingDir,
            workspace: expect.objectContaining({
                workingDir,
                agents: [expect.objectContaining({ id: 'agent-1' })],
            }),
        }))

        const loaded = await getSavedWorkspace(saved.id)
        expect(loaded.ok).toBe(true)
        if (!loaded.ok) {
            return
        }
        expect(loaded.workspace).toEqual(expect.objectContaining({
            workingDir,
            agents: [expect.objectContaining({ id: 'agent-1' })],
        }))
        expect(loaded.workspace.schemaVersion).toBe(1)
    })

    it('does not list raw workspace snapshots outside the current saved document schema', async () => {
        const { listSavedWorkspaces } = await import('./service.js')
        const workspaceId = 'raw-workspace'
        const dir = path.join(studioDir, 'workspaces', workspaceId)
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(path.join(dir, 'workspace.json'), JSON.stringify({
            workingDir: path.join(studioDir, 'project'),
            agents: [],
        }), 'utf-8')

        await expect(listSavedWorkspaces(true)).resolves.toEqual([])
    })

    it('returns saved workspaces with APM manifests as the package source of truth', async () => {
        const { getSavedWorkspace, saveWorkspaceSnapshot } = await import('./service.js')
        const { readApmPackage, writeApmPackage } = await import('../apm-package/repository.js')
        const workingDir = path.join(studioDir, 'project')

        const saved = await saveWorkspaceSnapshot(workspace(workingDir, [
            workspaceAgent({
                id: 'agent-1',
                name: 'Workspace Copy',
                model: null,
                agentBody: 'Stale workspace instruction.',
            }),
        ]))

        expect(saved.ok).toBe(true)
        if (!saved.ok) {
            return
        }

        const pkg = await readApmPackage(workingDir, 'agent-1')
        expect(pkg).not.toBeNull()
        if (!pkg) return

        const agent = pkg.manifest['x-apm']?.agent
        expect(agent).toBeTruthy()
        if (!agent) return

        await writeApmPackage(workingDir, 'agent-1', {
            ...pkg.manifest,
            'x-apm': {
                ...pkg.manifest['x-apm'],
                schemaVersion: 1,
                packageId: 'agent-1',
                kind: 'agent',
                agent: {
                    ...agent,
                    agentName: 'Manifest Agent',
                    agentBody: 'Manifest instruction wins.',
                },
            },
        })

        const loaded = await getSavedWorkspace(saved.id)
        expect(loaded.ok).toBe(true)
        if (!loaded.ok) {
            return
        }

        expect(loaded.workspace.agents?.[0]).toEqual(expect.objectContaining({
            id: 'agent-1',
            name: 'Manifest Agent',
            agentBody: 'Manifest instruction wins.',
        }))
    })

    it('fails workspace save when APM package state cannot be written', async () => {
        const { saveWorkspaceSnapshot } = await import('./service.js')
        const workingDir = path.join(studioDir, 'project-file')
        await fs.writeFile(workingDir, '')

        const result = await saveWorkspaceSnapshot(workspace(workingDir, [
            workspaceAgent({ id: 'agent-1', name: 'Agent 1', model: null }),
        ]))

        expect(result).toEqual({
            ok: false,
            status: 500,
            error: 'Failed to write APM package state',
        })
    })

    it('preserves hiddenFromList when saving an already-hidden workspace without that field', async () => {
        const { getSavedWorkspace, saveWorkspaceSnapshot, setSavedWorkspaceHidden } = await import('./service.js')
        const workingDir = path.join(studioDir, 'project')

        const initialSave = await saveWorkspaceSnapshot(workspace(workingDir, [
            workspaceAgent({ id: 'agent-1' }),
        ]))

        expect(initialSave.ok).toBe(true)
        if (!initialSave.ok) {
            return
        }

        await setSavedWorkspaceHidden(initialSave.id, true)
        await saveWorkspaceSnapshot(workspace(workingDir, [
            workspaceAgent({ id: 'agent-1' }),
            workspaceAgent({ id: 'agent-2' }),
        ]))

        const savedWorkspace = await getSavedWorkspace(initialSave.id)
        expect(savedWorkspace.ok).toBe(true)
        if (!savedWorkspace.ok) {
            return
        }

        expect(savedWorkspace.workspace.hiddenFromList).toBe(true)
    })
})
