import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
    OpenCodeAgentListResponse,
    ProviderListResponse,
    RuntimeModelListResponse,
    TerminalShellListResponse,
} from '../../../shared/opencode-contracts.js'

const modelCatalogMock = vi.hoisted(() => ({
    listProviderSummaries: vi.fn(),
    listRuntimeModels: vi.fn(),
}))

const opencodeServiceMock = vi.hoisted(() => ({
    getGlobalOpenCodeConfig: vi.fn(),
    getOpenCodeHealth: vi.fn(),
    getOpenCodeUnavailableHealth: vi.fn(),
    getProviderAuthMethods: vi.fn(),
    getVcsStatus: vi.fn(),
    listOpenCodeAgents: vi.fn(),
    listTerminalShells: vi.fn(),
    readProjectConfigSnapshot: vi.fn(),
    restartManagedOpenCode: vi.fn(),
    updateGlobalOpenCodeConfig: vi.fn(),
    updateProjectOpenCodeConfig: vi.fn(),
}))

vi.mock('../../lib/model-catalog.js', () => modelCatalogMock)
vi.mock('../../services/opencode/service.js', () => opencodeServiceMock)
vi.mock('../../lib/runtime-tools.js', () => ({ resolveRuntimeTools: vi.fn() }))
vi.mock('../../services/runtime/reload-service.js', () => ({ applyStudioRuntimeReload: vi.fn() }))

describe('opencode core routes', () => {
    beforeEach(() => {
        Object.values(modelCatalogMock).forEach((mock) => mock.mockReset())
        Object.values(opencodeServiceMock).forEach((mock) => mock.mockReset())
        opencodeServiceMock.getOpenCodeUnavailableHealth.mockImplementation((error: Error) => ({
            connected: false,
            url: '',
            error: error.message,
        }))
    })

    it('wraps terminal shells in the shared list response contract', async () => {
        opencodeServiceMock.listTerminalShells.mockResolvedValueOnce([
            { path: '/bin/zsh', name: 'zsh', acceptable: true },
        ])
        const { default: opencodeCore } = await import('./core.js')

        const res = await opencodeCore.request('http://studio.local/api/opencode/terminal/shells?workingDir=%2Ftmp%2Fworkspace')
        const body = await res.json() as TerminalShellListResponse

        expect(res.status).toBe(200)
        expect(body).toEqual({ shells: [{ path: '/bin/zsh', name: 'zsh', acceptable: true }] })
        expect(opencodeServiceMock.listTerminalShells).toHaveBeenCalledWith('/tmp/workspace')
    })

    it('wraps runtime model summaries in the shared list response contract', async () => {
        modelCatalogMock.listRuntimeModels.mockResolvedValueOnce([
            {
                provider: 'openai',
                providerName: 'OpenAI',
                id: 'gpt-5',
                name: 'GPT-5',
                connected: true,
                context: 128000,
                output: 8192,
                toolCall: true,
                reasoning: true,
                attachment: true,
                temperature: true,
                modalities: { input: ['text'], output: ['text'] },
                variants: [],
            },
        ])
        const { default: opencodeCore } = await import('./core.js')

        const res = await opencodeCore.request('http://studio.local/api/models?workingDir=%2Ftmp%2Fworkspace')
        const body = await res.json() as RuntimeModelListResponse

        expect(res.status).toBe(200)
        expect(body).toEqual({
            models: [
                {
                    provider: 'openai',
                    providerName: 'OpenAI',
                    id: 'gpt-5',
                    name: 'GPT-5',
                    connected: true,
                    context: 128000,
                    output: 8192,
                    toolCall: true,
                    reasoning: true,
                    attachment: true,
                    temperature: true,
                    modalities: { input: ['text'], output: ['text'] },
                    variants: [],
                },
            ],
        })
    })

    it('wraps providers in the shared list response contract', async () => {
        modelCatalogMock.listProviderSummaries.mockResolvedValueOnce([
            {
                id: 'openai',
                name: 'OpenAI',
                source: 'global',
                env: ['OPENAI_API_KEY'],
                connected: true,
                modelCount: 1,
                defaultModel: 'gpt-5',
                hasPaidModels: true,
            },
        ])
        const { default: opencodeCore } = await import('./core.js')

        const res = await opencodeCore.request('http://studio.local/api/providers?workingDir=%2Ftmp%2Fworkspace')
        const body = await res.json() as ProviderListResponse

        expect(res.status).toBe(200)
        expect(body.providers[0]).toEqual(expect.objectContaining({ id: 'openai', name: 'OpenAI' }))
    })

    it('wraps OpenCode agents in the shared list response contract', async () => {
        opencodeServiceMock.listOpenCodeAgents.mockResolvedValueOnce([
            { name: 'reviewer', mode: 'subagent' },
        ])
        const { default: opencodeCore } = await import('./core.js')

        const res = await opencodeCore.request('http://studio.local/api/agents?workingDir=%2Ftmp%2Fworkspace')
        const body = await res.json() as OpenCodeAgentListResponse

        expect(res.status).toBe(200)
        expect(body).toEqual({ agents: [{ name: 'reviewer', mode: 'subagent' }] })
    })

    it('uses list response contracts for recoverable empty runtime lists', async () => {
        opencodeServiceMock.listTerminalShells.mockRejectedValueOnce(new Error('shells unavailable'))
        modelCatalogMock.listRuntimeModels.mockRejectedValueOnce(new Error('models unavailable'))
        opencodeServiceMock.listOpenCodeAgents.mockRejectedValueOnce(new Error('agents unavailable'))
        const { default: opencodeCore } = await import('./core.js')

        const shellsRes = await opencodeCore.request('http://studio.local/api/opencode/terminal/shells')
        const modelsRes = await opencodeCore.request('http://studio.local/api/models')
        const agentsRes = await opencodeCore.request('http://studio.local/api/agents')

        await expect(shellsRes.json()).resolves.toEqual({ shells: [] })
        await expect(modelsRes.json()).resolves.toEqual({ models: [] })
        await expect(agentsRes.json()).resolves.toEqual({ agents: [] })
    })
})
