import { Hono } from 'hono'
import { readStoredProviderApiKey } from '../lib/opencode-auth.js'
import { getOpencode } from '../lib/opencode.js'

const usage = new Hono()

type OpenAIUsageBucketResult = {
    object: string
    input_tokens: number
    output_tokens: number
    num_model_requests: number
    model_id?: string | null
    project_id?: string | null
}

type OpenAIUsageBucket = {
    object: string
    start_time: number
    end_time: number
    results: OpenAIUsageBucketResult[]
}

type OpenAIUsageResponse = {
    object: string
    data: OpenAIUsageBucket[]
    has_more?: boolean
}

type DailyUsage = {
    date: string
    inputTokens: number
    outputTokens: number
    requests: number
}

type ModelSummary = {
    modelId: string
    inputTokens: number
    outputTokens: number
    requests: number
}

async function fetchOpenAIUsage(apiKey: string, isOAuth: boolean): Promise<{
    daily: DailyUsage[]
    byModel: ModelSummary[]
    totalInputTokens: number
    totalOutputTokens: number
    totalRequests: number
    error?: string
}> {
    const now = Math.floor(Date.now() / 1000)
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60

    const params = new URLSearchParams({
        start_time: String(thirtyDaysAgo),
        end_time: String(now),
        bucket_width: '1d',
        limit: '31',
        group_by: 'model',
    })

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }

    if (isOAuth) {
        headers['Authorization'] = `Bearer ${apiKey}`
    } else {
        headers['Authorization'] = `Bearer ${apiKey}`
    }

    const res = await fetch(
        `https://api.openai.com/v1/organization/usage/completions?${params.toString()}`,
        { headers },
    )

    if (!res.ok) {
        const errText = await res.text().catch(() => '')
        if (res.status === 403 || res.status === 401) {
            return { daily: [], byModel: [], totalInputTokens: 0, totalOutputTokens: 0, totalRequests: 0, error: 'insufficient_permissions' }
        }
        return { daily: [], byModel: [], totalInputTokens: 0, totalOutputTokens: 0, totalRequests: 0, error: errText || String(res.status) }
    }

    const json = await res.json() as OpenAIUsageResponse

    const dailyMap = new Map<string, DailyUsage>()
    const modelMap = new Map<string, ModelSummary>()

    for (const bucket of (json.data || [])) {
        const date = new Date(bucket.start_time * 1000).toISOString().slice(0, 10)
        const day = dailyMap.get(date) || { date, inputTokens: 0, outputTokens: 0, requests: 0 }

        for (const result of (bucket.results || [])) {
            day.inputTokens += result.input_tokens || 0
            day.outputTokens += result.output_tokens || 0
            day.requests += result.num_model_requests || 0

            const modelId = result.model_id || 'unknown'
            const model = modelMap.get(modelId) || { modelId, inputTokens: 0, outputTokens: 0, requests: 0 }
            model.inputTokens += result.input_tokens || 0
            model.outputTokens += result.output_tokens || 0
            model.requests += result.num_model_requests || 0
            modelMap.set(modelId, model)
        }

        dailyMap.set(date, day)
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
    const byModel = Array.from(modelMap.values()).sort((a, b) => b.requests - a.requests)

    const totalInputTokens = daily.reduce((s, d) => s + d.inputTokens, 0)
    const totalOutputTokens = daily.reduce((s, d) => s + d.outputTokens, 0)
    const totalRequests = daily.reduce((s, d) => s + d.requests, 0)

    return { daily, byModel, totalInputTokens, totalOutputTokens, totalRequests }
}

async function fetchStudioSessionCount(directory: string): Promise<{ sessionCount: number }> {
    try {
        const oc = await getOpencode()
        const res = await oc.session.list({ directory })
        const data = res && typeof res === 'object' && 'data' in res ? (res as { data?: unknown[] }).data : null
        const count = Array.isArray(data) ? data.length : 0
        return { sessionCount: count }
    } catch {
        return { sessionCount: 0 }
    }
}

usage.get('/api/usage', async (c) => {
    const workingDir = c.req.header('x-working-dir') || process.cwd()

    const [openaiKey, studioStats] = await Promise.all([
        readStoredProviderApiKey('openai').catch(() => null),
        fetchStudioSessionCount(workingDir),
    ])

    if (!openaiKey) {
        return c.json({
            studio: studioStats,
            codex: null,
            error: 'no_openai_key',
        })
    }

    const isOAuth = openaiKey.startsWith('ey') || openaiKey.length > 100
    const codexUsage = await fetchOpenAIUsage(openaiKey, isOAuth).catch((err) => ({
        daily: [] as DailyUsage[],
        byModel: [] as ModelSummary[],
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalRequests: 0,
        error: err instanceof Error ? err.message : String(err),
    }))

    return c.json({
        studio: studioStats,
        codex: codexUsage,
    })
})

export default usage
