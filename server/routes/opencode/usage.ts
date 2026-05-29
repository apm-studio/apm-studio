import { Hono } from 'hono'
import { readStoredProviderAuth } from '../../lib/opencode-auth.js'
import { getOpencode } from '../../lib/opencode.js'
import type { ProviderQuota, QuotaWindow, UsageResponse } from '../../../shared/opencode-contracts.js'

const usage = new Hono()

// ── Helpers ──────────────────────────────────────────────

type UsageTokenPart = {
    cost?: number
    tokens?: {
        input?: number
        output?: number
        reasoning?: number
    }
}

type UsageMessage = {
    parts: UsageTokenPart[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseResetTime(value: unknown): string | null {
    if (!value) return null
    if (typeof value === 'string') {
        // ISO string
        const d = new Date(value)
        return isNaN(d.getTime()) ? null : d.toISOString()
    }
    if (typeof value === 'number') {
        // Unix seconds vs ms — ms is > year 2001 in seconds (> 1e9 * 1000)
        const d = value > 1e12 ? new Date(value) : new Date(value * 1000)
        return isNaN(d.getTime()) ? null : d.toISOString()
    }
    return null
}

function extractResetAt(obj: Record<string, unknown>): string | null {
    return parseResetTime(obj.resets_at ?? obj.reset_at ?? obj.resetAt ?? obj.reset_time_ms ?? null)
}

// ── Codex (ChatGPT OAuth subscription) ──────────────────

function toFinite(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
        const n = Number(value)
        if (Number.isFinite(n)) return n
    }
    return fallback
}

function finiteNumberField(record: Record<string, unknown>, key: string): number | undefined {
    const value = record[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeUsageTokenPart(value: unknown): UsageTokenPart | null {
    if (!isRecord(value)) {
        return null
    }
    const cost = finiteNumberField(value, 'cost')
    const rawTokens = isRecord(value.tokens) ? value.tokens : null
    const tokens = rawTokens
        ? {
            input: finiteNumberField(rawTokens, 'input'),
            output: finiteNumberField(rawTokens, 'output'),
            reasoning: finiteNumberField(rawTokens, 'reasoning'),
        }
        : null
    const normalized: UsageTokenPart = {
        ...(cost !== undefined ? { cost } : {}),
        ...(tokens && Object.values(tokens).some((entry) => entry !== undefined) ? { tokens } : {}),
    }
    return Object.keys(normalized).length > 0 ? normalized : null
}

function normalizeUsageMessages(value: unknown): UsageMessage[] {
    if (!Array.isArray(value)) {
        return []
    }
    return value
        .map((message) => {
            if (!isRecord(message) || !Array.isArray(message.parts)) {
                return null
            }
            const parts = message.parts
                .map(normalizeUsageTokenPart)
                .filter((part): part is UsageTokenPart => !!part)
            return parts.length > 0 ? { parts } : null
        })
        .filter((message): message is UsageMessage => !!message)
}

function normalizeSessionIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }
    return value
        .map((session) => (isRecord(session) && typeof session.id === 'string' ? session.id : null))
        .filter((id): id is string => !!id)
}

function parseCodexWindow(raw: Record<string, unknown>): QuotaWindow {
    // Unwrap nested rate_limit if present
    const body = raw.rate_limit && typeof raw.rate_limit === 'object'
        ? raw.rate_limit as Record<string, unknown>
        : raw
    const used = Math.max(0, Math.min(100, toFinite(body.used_percent ?? body.percent_used, 0)))
    return {
        percentUsed: used,
        resetsAt: extractResetAt(body),
    }
}

function extractCodexWindows(rlBody: Record<string, unknown>, snapshot: Record<string, unknown>) {
    const primary =
        rlBody.primary_window ?? rlBody.primary ??
        snapshot.primary_window ?? snapshot.primary
    const secondary =
        rlBody.secondary_window ?? rlBody.secondary ??
        snapshot.secondary_window ?? snapshot.secondary
    return {
        primary: primary && typeof primary === 'object' ? primary as Record<string, unknown> : null,
        secondary: secondary && typeof secondary === 'object' ? secondary as Record<string, unknown> : null,
    }
}

async function fetchCodexQuota(accessToken: string): Promise<ProviderQuota> {
    const res = await fetch('https://chatgpt.com/backend-api/wham/usage', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Origin': 'https://chatgpt.com',
            'Referer': 'https://chatgpt.com/',
        },
        signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
            return { connected: true, authType: 'oauth', error: 'token_expired' }
        }
        return { connected: true, authType: 'oauth', error: `http_${res.status}` }
    }

    const data = await res.json() as Record<string, unknown>

    // rate_limit > rate_limits > rate_limits_by_limit_id.codex
    const snapshot = (
        data.rate_limit
        ?? data.rate_limits
        ?? (data.rate_limits_by_limit_id as Record<string, unknown>)?.codex
        ?? {}
    ) as Record<string, unknown>

    // Unwrap nested rate_limit body
    const rlBody = snapshot.rate_limit && typeof snapshot.rate_limit === 'object'
        ? snapshot.rate_limit as Record<string, unknown>
        : snapshot

    const { primary, secondary } = extractCodexWindows(rlBody, snapshot)

    return {
        connected: true,
        authType: 'oauth',
        // primary = session/5-hour window, secondary = weekly window
        fiveHour: primary ? parseCodexWindow(primary) : undefined,
        weekly: secondary ? parseCodexWindow(secondary) : undefined,
    }
}

// ── Studio token usage ───────────────────────────────────

function emptyStudioUsage(): UsageResponse['studio'] {
    return {
        totalCostUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
    }
}

function readResponseHeader(result: unknown, name: string): string | null {
    if (!result || typeof result !== 'object') {
        return null
    }

    const response = (result as { response?: { headers?: { get?: (name: string) => string | null } } }).response
    if (!response?.headers || typeof response.headers.get !== 'function') {
        return null
    }

    const value = response.headers.get(name)
    if (!value) {
        return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

async function listSessionMessagesForUsage(
    oc: Awaited<ReturnType<typeof getOpencode>>,
    directory: string,
    sessionID: string,
): Promise<UsageMessage[]> {
    const messages: UsageMessage[] = []
    const seenCursors = new Set<string>()
    let before: string | null = null

    while (true) {
        const params: {
            directory: string
            sessionID: string
            limit: number
            before?: string
        } = {
            directory,
            sessionID,
            limit: 100,
        }
        if (before) {
            params.before = before
        }

        const messageRes = await oc.session.messages(params)
        const page = messageRes && typeof messageRes === 'object' && 'data' in messageRes
            ? (messageRes as { data?: unknown }).data
            : null
        messages.push(...normalizeUsageMessages(page))

        const nextCursor = readResponseHeader(messageRes, 'x-next-cursor')
        if (!nextCursor || seenCursors.has(nextCursor)) {
            break
        }
        seenCursors.add(nextCursor)
        before = nextCursor
    }

    return messages
}

async function fetchStudioUsage(directory: string): Promise<UsageResponse['studio']> {
    try {
        const oc = await getOpencode()
        const totals = emptyStudioUsage()
        const listRes = await oc.session.list({ directory })
        const sessions = listRes && typeof listRes === 'object' && 'data' in listRes
            ? (listRes as { data?: unknown }).data
            : null
        const sessionIds = normalizeSessionIds(sessions)
        if (sessionIds.length === 0) {
            return totals
        }

        await Promise.all(sessionIds.map(async (id) => {
            const messages = await listSessionMessagesForUsage(oc, directory, id).catch(() => [])

            for (const message of messages) {
                for (const part of message.parts) {
                    if (part.cost !== undefined) {
                        totals.totalCostUsd += part.cost
                    }
                    const tokens = part.tokens
                    if (!tokens) continue
                    if (tokens.input !== undefined) totals.inputTokens += tokens.input
                    if (tokens.output !== undefined) totals.outputTokens += tokens.output
                    if (tokens.reasoning !== undefined) totals.reasoningTokens += tokens.reasoning
                }
            }
        }))

        return {
            totalCostUsd: Number(totals.totalCostUsd.toFixed(6)),
            inputTokens: totals.inputTokens,
            outputTokens: totals.outputTokens,
            reasoningTokens: totals.reasoningTokens,
        }
    } catch {
        return emptyStudioUsage()
    }
}

// ── Route ────────────────────────────────────────────────

usage.get('/api/usage', async (c) => {
    const workingDir = c.req.query('workingDir') || c.req.header('x-working-dir') || process.cwd()

    const [openaiAuth, studioStats] = await Promise.all([
        readStoredProviderAuth('openai').catch(() => null),
        fetchStudioUsage(workingDir),
    ])

    // Codex quota — only meaningful when signed in via OAuth (ChatGPT subscription)
    let codexQuota: ProviderQuota
    if (!openaiAuth) {
        codexQuota = { connected: false, authType: null }
    } else if (openaiAuth.type === 'oauth') {
        codexQuota = await fetchCodexQuota(openaiAuth.access).catch((err) => ({
            connected: true,
            authType: 'oauth' as const,
            error: err instanceof Error ? err.message : String(err),
        }))
    } else {
        // API key — wham/usage requires OAuth session token
        codexQuota = { connected: true, authType: 'api', error: 'subscription_required' }
    }

    return c.json({
        studio: studioStats,
        codex: codexQuota,
    } satisfies UsageResponse)
})

export default usage
