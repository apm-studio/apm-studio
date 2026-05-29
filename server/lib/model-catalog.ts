import { getOpencode } from './opencode.js'
import { readStoredProviderAuthType } from './opencode-auth.js'
import { StudioValidationError } from './opencode-errors.js'
import { buildProviderSnapshots, type ProviderSnapshot } from './model-catalog-normalization.js'
import { pickTitleModel } from './model-catalog-title.js'
import type { RuntimeModelCatalogEntry } from '../../shared/model-variants.js'
import type { ProviderSummary } from '../../shared/provider-auth.js'

function responseData<T>(response: unknown): T | undefined {
    if (!response || typeof response !== 'object' || !('data' in response)) {
        return undefined
    }
    return (response as { data?: T }).data
}

function isOpenAiProvider(providerId: string | null | undefined) {
    return providerId === 'openai'
}

export function isUnsupportedOpenAiChatGptCodexModel(selection: { provider: string; modelId: string } | null | undefined) {
    if (!selection || !isOpenAiProvider(selection.provider)) {
        return false
    }
    return /^gpt-\d+(?:[.-]\d+)?-pro$/i.test(selection.modelId.trim())
}

async function isChatGptOAuthProvider(providerId: string) {
    if (!isOpenAiProvider(providerId)) {
        return false
    }
    return (await readStoredProviderAuthType(providerId).catch(() => null)) === 'oauth'
}

export async function assertRuntimeModelPromptable(
    cwd: string,
    selection: { provider: string; modelId: string } | null,
) {
    void cwd
    if (!selection) {
        return
    }
    if (
        isUnsupportedOpenAiChatGptCodexModel(selection)
        && await isChatGptOAuthProvider(selection.provider)
    ) {
        throw new StudioValidationError(
            `The selected model (${selection.modelId}) is not supported when using Codex with a ChatGPT account. Choose a non-Pro model for this agent and try again.`,
            'choose_model',
        )
    }
}
const CACHE_TTL_MS = 3_000

let _cachedPromise: Promise<ProviderSnapshot[]> | null = null
let _cachedCwd: string | null = null
let _cacheTs = 0

async function fetchProviderSnapshots(cwd: string): Promise<ProviderSnapshot[]> {
    const now = Date.now()
    if (_cachedPromise && _cachedCwd === cwd && now - _cacheTs < CACHE_TTL_MS) {
        return _cachedPromise
    }

    _cachedCwd = cwd
    _cacheTs = now
    _cachedPromise = (async () => {
        const oc = await getOpencode()
        const res = await oc.provider.list({ directory: cwd })
        return buildProviderSnapshots(responseData<unknown>(res))
    })()

    // On failure, clear the cache so the next call retries immediately.
    _cachedPromise.catch(() => {
        _cachedPromise = null
    })

    return _cachedPromise
}

export function invalidateProviderListCache() {
    _cachedPromise = null
    _cachedCwd = null
    _cacheTs = 0
}

export async function listProviderSummaries(cwd: string): Promise<ProviderSummary[]> {
    return (await fetchProviderSnapshots(cwd)).map((provider) => ({
        id: provider.id,
        name: provider.name,
        source: provider.source,
        env: provider.env,
        connected: provider.connected,
        modelCount: provider.models.length,
        defaultModel: provider.defaultModel,
        hasPaidModels: provider.hasPaidModels,
    }))
}

export async function listRuntimeModels(cwd: string): Promise<RuntimeModelCatalogEntry[]> {
    const providers = await fetchProviderSnapshots(cwd)
    const models: RuntimeModelCatalogEntry[] = []
    for (const provider of providers) {
        const hideOpenAiChatGptUnsupportedModels = await isChatGptOAuthProvider(provider.id)
        for (const record of provider.models) {
            if (
                hideOpenAiChatGptUnsupportedModels
                && isUnsupportedOpenAiChatGptCodexModel({ provider: provider.id, modelId: record.id })
            ) {
                continue
            }

            models.push({
                provider: provider.id,
                providerName: provider.name,
                id: record.id,
                name: record.name,
                connected: provider.connected,
                context: record.context,
                output: record.output,
                toolCall: record.toolCall,
                reasoning: record.reasoning,
                attachment: record.attachment,
                temperature: record.temperature,
                modalities: record.modalities,
                variants: record.variants,
            })
        }
    }

    return models
}

export async function resolvePreferredTitleModelId(cwd: string, providerId: string): Promise<string | null> {
    const provider = (await fetchProviderSnapshots(cwd)).find((entry) => entry.id === providerId)
    return pickTitleModel(provider, providerId)
}

export async function resolveRuntimeModel(
    cwd: string,
    selection: { provider: string; modelId: string } | null,
): Promise<RuntimeModelCatalogEntry | null> {
    if (!selection) {
        return null
    }
    const models = await listRuntimeModels(cwd)
    return models.find((model) => (
        model.provider === selection.provider
        && model.id === selection.modelId
    )) || null
}
