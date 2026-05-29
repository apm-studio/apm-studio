import {
    normalizeRuntimeVariants,
    type RuntimeModelVariant,
} from '../../shared/model-variants.js'

type UnknownRecord = { [key: string]: unknown }

export type ProviderModelSnapshot = {
    id: string
    name: string
    context: number
    output: number
    costInput: number | null
    toolCall: boolean
    reasoning: boolean
    attachment: boolean
    temperature: boolean
    modalities: {
        input: string[]
        output: string[]
    }
    variants: RuntimeModelVariant[]
}

export type ProviderSnapshot = {
    id: string
    name: string
    source: string
    env: string[]
    region: string | null
    connected: boolean
    defaultModel: string | null
    models: ProviderModelSnapshot[]
    hasPaidModels: boolean
}

function isRecord(value: unknown): value is UnknownRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): UnknownRecord {
    return isRecord(value) ? value : {}
}

function stringField(record: UnknownRecord, key: string): string | undefined {
    const value = record[key]
    return typeof value === 'string' && value.trim() ? value : undefined
}

function numberField(record: UnknownRecord, key: string): number | undefined {
    const value = record[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readStringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function readStringMap(value: unknown): Record<string, string> {
    if (!isRecord(value)) {
        return {}
    }
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
}

function readCapabilityFlag(model: UnknownRecord, ...keys: string[]) {
    const capabilityRecord = asRecord(model.capabilities)

    for (const key of keys) {
        if (typeof capabilityRecord[key] === 'boolean') {
            return capabilityRecord[key] as boolean
        }
        if (typeof model[key] === 'boolean') {
            return model[key] as boolean
        }
    }

    return false
}

function readModalities(model: UnknownRecord) {
    const capabilityRecord = asRecord(model.capabilities)
    const modalityRecord = asRecord(model.modalities)

    const input = Array.isArray(capabilityRecord.input)
        ? capabilityRecord.input.filter((value): value is string => typeof value === 'string')
        : Array.isArray(modalityRecord.input)
            ? modalityRecord.input.filter((value: unknown): value is string => typeof value === 'string')
            : ['text']
    const output = Array.isArray(capabilityRecord.output)
        ? capabilityRecord.output.filter((value): value is string => typeof value === 'string')
        : Array.isArray(modalityRecord.output)
            ? modalityRecord.output.filter((value: unknown): value is string => typeof value === 'string')
            : ['text']

    return { input, output }
}

function normalizeProviderModel(idFromKey: string, value: unknown): ProviderModelSnapshot | null {
    const model = asRecord(value)
    const id = stringField(model, 'id') || idFromKey
    if (!id) {
        return null
    }
    const cost = asRecord(model.cost)
    const limit = asRecord(model.limit)
    return {
        id,
        name: stringField(model, 'name') || id,
        context: numberField(limit, 'context') ?? 0,
        output: numberField(limit, 'output') ?? 0,
        costInput: numberField(cost, 'input') ?? null,
        toolCall: readCapabilityFlag(model, 'toolcall', 'toolCall', 'tool_call'),
        reasoning: readCapabilityFlag(model, 'reasoning'),
        attachment: readCapabilityFlag(model, 'attachment'),
        temperature: readCapabilityFlag(model, 'temperature'),
        modalities: readModalities(model),
        variants: normalizeRuntimeVariants(model.variants),
    }
}

function readProviderModels(value: unknown): ProviderModelSnapshot[] {
    if (!isRecord(value)) {
        return []
    }
    return Object.entries(value)
        .map(([modelId, model]) => normalizeProviderModel(modelId, model))
        .filter((model): model is ProviderModelSnapshot => !!model)
}

function normalizeProviderSnapshot(
    provider: unknown,
    connectedProviderIds: ReadonlySet<string>,
    defaultModels: Readonly<Record<string, string>>,
): ProviderSnapshot | null {
    const record = asRecord(provider)
    const id = stringField(record, 'id') || ''
    if (!id) {
        return null
    }

    const models = readProviderModels(record.models)
    const options = asRecord(record.options)

    return {
        id,
        name: stringField(record, 'name') || id,
        source: stringField(record, 'source') || 'builtin',
        env: readStringArray(record.env),
        region: stringField(options, 'region') || null,
        connected: connectedProviderIds.has(id),
        defaultModel: defaultModels[id] || null,
        models,
        hasPaidModels: models.some((model) => typeof model.costInput === 'number' && model.costInput > 0),
    }
}

export function buildProviderSnapshots(data: unknown): ProviderSnapshot[] {
    const record = asRecord(data)
    if (!Array.isArray(record.all)) {
        return []
    }

    const connectedProviderIds = new Set(readStringArray(record.connected))
    const defaultModels = readStringMap(record.default)

    return record.all
        .map((provider) => normalizeProviderSnapshot(provider, connectedProviderIds, defaultModels))
        .filter((provider): provider is ProviderSnapshot => Boolean(provider))
}
