import { Hono } from 'hono'
import type {
    ProviderAuthInput,
    ProviderOauthAuthorization,
    ProviderOauthAuthorizeRequest,
    ProviderOauthCallbackRequest,
} from '../../../shared/provider-auth.js'
import type { ProviderAuthClearResponse, ProviderAuthStatusResponse } from '../../../shared/opencode-contracts.js'
import { jsonOpencodeError } from '../../lib/opencode-errors.js'
import {
    authorizeProviderOauth,
    completeProviderOauth,
    deleteProviderAuth,
    updateProviderAuth,
} from '../../services/opencode/service.js'
import { requestWorkingDir } from '../route-errors.js'

const opencodeProvider = new Hono()

opencodeProvider.post('/api/provider/:id/oauth/authorize', async (c) => {
    const { method, inputs } = await c.req.json<ProviderOauthAuthorizeRequest>()
    try {
        const response: ProviderOauthAuthorization = await authorizeProviderOauth(requestWorkingDir(c), c.req.param('id'), method, inputs)
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencodeProvider.post('/api/provider/:id/oauth/callback', async (c) => {
    const { method, code } = await c.req.json<ProviderOauthCallbackRequest>()
    try {
        const response: ProviderOauthAuthorization = await completeProviderOauth(requestWorkingDir(c), c.req.param('id'), method, code)
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencodeProvider.put('/api/provider/:id/auth', async (c) => {
    const auth = await c.req.json<ProviderAuthInput>()
    try {
        const response = await updateProviderAuth(requestWorkingDir(c), c.req.param('id'), auth)
        return c.json(response satisfies ProviderAuthStatusResponse)
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

opencodeProvider.delete('/api/provider/:id/auth', async (c) => {
    try {
        const response = await deleteProviderAuth(requestWorkingDir(c), c.req.param('id'))
        return c.json(response satisfies ProviderAuthClearResponse)
    } catch (err) {
        return jsonOpencodeError(c, err, { providerId: c.req.param('id'), defaultStatus: 500 })
    }
})

export default opencodeProvider
