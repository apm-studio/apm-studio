import type { ProviderSnapshot } from './model-catalog-normalization.js'

function titleModelPriority(providerId: string) {
    const basePriority = [
        'claude-haiku-4-5',
        'claude-haiku-4.5',
        '3-5-haiku',
        '3.5-haiku',
        'gemini-3-flash',
        'gemini-2.5-flash',
        'gpt-5-nano',
    ]
    if (providerId.startsWith('opencode')) {
        return ['gpt-5-nano']
    }
    if (providerId.startsWith('github-copilot')) {
        return ['gpt-5-mini', 'claude-haiku-4.5', ...basePriority]
    }
    return basePriority
}

function pickBedrockTitleModel(provider: ProviderSnapshot, candidate: string): string | null {
    const crossRegionPrefixes = ['global.', 'us.', 'eu.']
    const modelIds = provider.models.map((model) => model.id)
    const matches = modelIds.filter((modelId) => modelId.includes(candidate))
    const globalMatch = matches.find((modelId) => modelId.startsWith('global.'))
    if (globalMatch) {
        return globalMatch
    }

    const regionPrefix = provider.region?.split('-')[0]
    if (regionPrefix === 'us' || regionPrefix === 'eu') {
        const regionalMatch = matches.find((modelId) => modelId.startsWith(`${regionPrefix}.`))
        if (regionalMatch) {
            return regionalMatch
        }
    }

    return matches.find((modelId) => !crossRegionPrefixes.some((prefix) => modelId.startsWith(prefix))) || null
}

export function pickTitleModel(provider: ProviderSnapshot | undefined, providerId: string): string | null {
    if (!provider) {
        return null
    }

    const modelIds = provider.models.map((model) => model.id)
    for (const candidate of titleModelPriority(providerId)) {
        if (providerId === 'amazon-bedrock') {
            const match = pickBedrockTitleModel(provider, candidate)
            if (match) {
                return match
            }
            continue
        }

        const match = modelIds.find((modelId) => modelId.includes(candidate))
        if (match) {
            return match
        }
    }

    return null
}
