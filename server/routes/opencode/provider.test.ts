import { beforeEach, describe, expect, it, vi } from 'vitest'

const opencodeServiceMock = vi.hoisted(() => ({
    authorizeProviderOauth: vi.fn(),
    completeProviderOauth: vi.fn(),
    deleteProviderAuth: vi.fn(),
    updateProviderAuth: vi.fn(),
}))

vi.mock('../../services/opencode/service.js', () => opencodeServiceMock)

describe('opencode provider routes', () => {
    beforeEach(() => {
        Object.values(opencodeServiceMock).forEach((mock) => mock.mockReset())
    })

    it('returns Studio ok contracts for provider auth mutations', async () => {
        opencodeServiceMock.updateProviderAuth.mockResolvedValueOnce({ ok: true })
        opencodeServiceMock.deleteProviderAuth.mockResolvedValueOnce({ ok: true })
        const { default: opencodeProvider } = await import('./provider.js')

        const setRes = await opencodeProvider.request('http://studio.local/api/provider/openai/auth?workingDir=%2Ftmp%2Fworkspace', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'api', key: 'test-key' }),
        })
        const clearRes = await opencodeProvider.request('http://studio.local/api/provider/openai/auth?workingDir=%2Ftmp%2Fworkspace', {
            method: 'DELETE',
        })

        await expect(setRes.json()).resolves.toEqual({ ok: true })
        await expect(clearRes.json()).resolves.toEqual({ ok: true })
        expect(opencodeServiceMock.updateProviderAuth).toHaveBeenCalledWith('/tmp/workspace', 'openai', {
            type: 'api',
            key: 'test-key',
        })
        expect(opencodeServiceMock.deleteProviderAuth).toHaveBeenCalledWith('/tmp/workspace', 'openai')
    })

    it('passes provider OAuth authorization responses through their explicit contract', async () => {
        opencodeServiceMock.authorizeProviderOauth.mockResolvedValueOnce({
            method: 'code',
            url: 'https://provider.example/auth',
        })
        opencodeServiceMock.completeProviderOauth.mockResolvedValueOnce({
            method: 'auto',
            instructions: 'Connected.',
        })
        const { default: opencodeProvider } = await import('./provider.js')

        const authorizeRes = await opencodeProvider.request('http://studio.local/api/provider/openai/oauth/authorize?workingDir=%2Ftmp%2Fworkspace', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ method: 0 }),
        })
        const callbackRes = await opencodeProvider.request('http://studio.local/api/provider/openai/oauth/callback?workingDir=%2Ftmp%2Fworkspace', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ method: 0, code: 'oauth-code' }),
        })

        await expect(authorizeRes.json()).resolves.toEqual({
            method: 'code',
            url: 'https://provider.example/auth',
        })
        await expect(callbackRes.json()).resolves.toEqual({
            method: 'auto',
            instructions: 'Connected.',
        })
    })
})
