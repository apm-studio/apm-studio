import { getOpencode } from '../../lib/opencode.js'
import { StudioValidationError, unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { invalidateProviderListCache } from '../../lib/model-catalog.js'
import { clearStoredProviderAuth } from '../../lib/opencode-auth.js'
import type {
    ProviderAuthInput,
    ProviderAuthMethodMap,
    ProviderOauthAuthorization,
} from '../../../shared/provider-auth.js'
import type {
    ProviderAuthClearResponse,
    ProviderAuthStatusResponse,
} from '../../../shared/opencode-contracts.js'

function isProviderAuthInput(value: unknown): value is ProviderAuthInput {
    if (!value || typeof value !== 'object') return false
    const auth = value as Record<string, unknown>
    if (auth.type === 'oauth') {
        return typeof auth.refresh === 'string' && typeof auth.access === 'string' && typeof auth.expires === 'number'
    }
    if (auth.type === 'api') {
        return typeof auth.key === 'string'
            && (auth.metadata === undefined || isStringRecord(auth.metadata))
    }
    if (auth.type === 'wellknown') {
        return typeof auth.key === 'string' && typeof auth.token === 'string'
    }
    return false
}

function isStringRecord(value: unknown): value is Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false
    }
    return Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'string')
}

function sanitizePromptInputs(inputs: unknown): Record<string, string> | undefined {
    if (!isStringRecord(inputs)) {
        return undefined
    }

    const entries = Object.entries(inputs)
        .map(([key, value]) => [key.trim(), value] as const)
        .filter(([key]) => key.length > 0)

    return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export async function getProviderAuthMethods(directory: string): Promise<ProviderAuthMethodMap> {
    const oc = await getOpencode()
    return unwrapOpencodeResult<ProviderAuthMethodMap>(await oc.provider.auth({ directory })) || {}
}

export async function authorizeProviderOauth(directory: string, providerId: string, method: number, inputs?: unknown) {
    const oc = await getOpencode()
    const promptInputs = sanitizePromptInputs(inputs)
    return unwrapOpencodeResult<ProviderOauthAuthorization>(await oc.provider.oauth.authorize({
        providerID: providerId,
        directory,
        method,
        ...(promptInputs ? { inputs: promptInputs } : {}),
    }))
}

export async function completeProviderOauth(directory: string, providerId: string, method: number, code?: string) {
    const oc = await getOpencode()
    const data = unwrapOpencodeResult<ProviderOauthAuthorization>(await oc.provider.oauth.callback({
        providerID: providerId,
        directory,
        method,
        ...(code ? { code } : {}),
    }))
    await oc.global.dispose()
    invalidateProviderListCache()
    return data
}

export async function updateProviderAuth(
    _directory: string,
    providerId: string,
    auth: unknown,
): Promise<ProviderAuthStatusResponse> {
    if (!isProviderAuthInput(auth)) {
        throw new StudioValidationError('Invalid provider auth payload.')
    }
    const oc = await getOpencode()
    unwrapOpencodeResult<unknown>(await oc.auth.set({
        providerID: providerId,
        auth,
    }))
    await oc.global.dispose()
    invalidateProviderListCache()
    return { ok: true }
}

export async function deleteProviderAuth(_directory: string, providerId: string): Promise<ProviderAuthClearResponse> {
    const oc = await getOpencode()
    await clearStoredProviderAuth(providerId)
    await oc.global.dispose()
    invalidateProviderListCache()
    return { ok: true as const }
}
