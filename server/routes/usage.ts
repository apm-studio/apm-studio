import { Hono } from 'hono'
import { readStoredProviderAuth } from '../lib/opencode-auth.js'
import { getOpencode } from '../lib/opencode.js'

const usage = new Hono()

// ── Types ────────────────────────────────────────────────

export type QuotaWindow = {
    percentUsed: number      // 0–100
    resetsAt: string | null  // ISO 8601
}

export type ProviderQuota = {
    connected: boolean
    authType: 'oauth' | 'api' | null
    fiveHour?: QuotaWindow
    sevenDay?: QuotaWindow
    weekly?: QuotaWindow
    error?: string
}

export type UsageResponse = {
    studio: { sessionCount: number }
    codex: ProviderQuota
    claudeCode: ProviderQuota
}

// ── Helpers ──────────────────────────────────────────────

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

// ── Claude Code (Anthropic OAuth subscription) ───────────

async function fetchClaudeCodeQuota(accessToken: string): Promise<ProviderQuota> {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'anthropic-beta': 'oauth-2025-04-20',
            'anthropic-version': '2023-06-01',
            'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
            return { connected: true, authType: 'oauth', error: 'token_expired' }
        }
        if (res.status === 429) {
            return { connected: true, authType: 'oauth', error: 'rate_limited' }
        }
        return { connected: true, authType: 'oauth', error: `http_${res.status}` }
    }

    const data = await res.json() as Record<string, unknown>

    const fiveHourRaw = data.five_hour as Record<string, unknown> | undefined
    const fiveHour: QuotaWindow | undefined = fiveHourRaw ? {
        percentUsed: Number(fiveHourRaw.utilization ?? fiveHourRaw.percent_used ?? 0),
        resetsAt: extractResetAt(fiveHourRaw),
    } : undefined

    const sevenDayRaw = data.seven_day as Record<string, unknown> | undefined
    const sevenDay: QuotaWindow | undefined = sevenDayRaw ? {
        percentUsed: Number(sevenDayRaw.utilization ?? sevenDayRaw.percent_used ?? 0),
        resetsAt: extractResetAt(sevenDayRaw),
    } : undefined

    return {
        connected: true,
        authType: 'oauth',
        fiveHour,
        sevenDay,
    }
}

// ── Studio session count ─────────────────────────────────

async function fetchStudioSessionCount(directory: string): Promise<{ sessionCount: number }> {
    try {
        const oc = await getOpencode()
        const res = await oc.session.list({ directory })
        const data = res && typeof res === 'object' && 'data' in res
            ? (res as { data?: unknown[] }).data
            : null
        return { sessionCount: Array.isArray(data) ? data.length : 0 }
    } catch {
        return { sessionCount: 0 }
    }
}

// ── Route ────────────────────────────────────────────────

usage.get('/api/usage', async (c) => {
    const workingDir = c.req.header('x-working-dir') || process.cwd()

    const [openaiAuth, anthropicAuth, studioStats] = await Promise.all([
        readStoredProviderAuth('openai').catch(() => null),
        readStoredProviderAuth('anthropic').catch(() => null),
        fetchStudioSessionCount(workingDir),
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

    // Claude Code quota — Anthropic OAuth subscription
    let claudeCodeQuota: ProviderQuota
    if (!anthropicAuth) {
        claudeCodeQuota = { connected: false, authType: null }
    } else if (anthropicAuth.type === 'oauth') {
        claudeCodeQuota = await fetchClaudeCodeQuota(anthropicAuth.access).catch((err) => ({
            connected: true,
            authType: 'oauth' as const,
            error: err instanceof Error ? err.message : String(err),
        }))
    } else {
        claudeCodeQuota = { connected: true, authType: 'api', error: 'subscription_required' }
    }

    return c.json({
        studio: studioStats,
        codex: codexQuota,
        claudeCode: claudeCodeQuota,
    } satisfies UsageResponse)
})

export default usage
