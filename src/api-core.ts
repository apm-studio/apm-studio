import { StudioApiError } from './lib/api-errors'
import type { StudioApiErrorPayload } from './lib/api-errors'
import {
    isApiErrorStatus,
    isStudioApiErrorAction,
    isStudioApiErrorCode,
} from '../shared/api-contracts'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
let workingDirContext: string | null = null

export function resolveWorkingDirContext() {
    return workingDirContext
}

function withWorkingDirQuery(url: string, workingDir: string | null) {
    if (!workingDir) {
        return url
    }
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}workingDir=${encodeURIComponent(workingDir)}`
}

export function setApiWorkingDirContext(workingDir: string | null) {
    workingDirContext = workingDir?.trim() ? workingDir.trim() : null
}

function withApiBase(url: string) {
    return `${API_BASE}${withWorkingDirQuery(url, resolveWorkingDirContext())}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined
}

function normalizeApiErrorPayload(value: unknown, fallback: string): StudioApiErrorPayload {
    if (!isRecord(value)) {
        return { error: fallback }
    }

    const payload: StudioApiErrorPayload = {
        error: nonEmptyString(value.error) || fallback,
    }
    const detail = nonEmptyString(value.detail)
    if (detail) payload.detail = detail
    if (isStudioApiErrorCode(value.code)) payload.code = value.code
    if (isStudioApiErrorAction(value.action)) payload.action = value.action
    if (typeof value.retryable === 'boolean') payload.retryable = value.retryable
    if (isApiErrorStatus(value.status)) payload.status = value.status
    const providerId = nonEmptyString(value.providerId)
    if (providerId) payload.providerId = providerId
    const modelId = nonEmptyString(value.modelId)
    if (modelId) payload.modelId = modelId
    return payload
}

function parseApiErrorPayload(raw: string, statusText: string): StudioApiErrorPayload {
    const fallback = raw || statusText || 'Request failed.'
    if (!raw) {
        return { error: fallback }
    }

    try {
        return normalizeApiErrorPayload(JSON.parse(raw), fallback)
    } catch {
        return { error: fallback }
    }
}

export async function fetchApiResponse(url: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(withApiBase(url), {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...init?.headers,
        },
    })
    if (!res.ok) {
        const raw = await res.text().catch(() => '')
        const payload = parseApiErrorPayload(raw, res.statusText)
        throw new StudioApiError(payload, res.status)
    }
    return res
}

export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetchApiResponse(url, init)
    return res.json()
}

export function postJSON<T>(url: string, body?: unknown) {
    return fetchJSON<T>(url, {
        method: 'POST',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
}

export function putJSON<T>(url: string, body?: unknown) {
    return fetchJSON<T>(url, {
        method: 'PUT',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
}

export function patchJSON<T>(url: string, body?: unknown) {
    return fetchJSON<T>(url, {
        method: 'PATCH',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
}

export function deleteJSON<T>(url: string, body?: unknown) {
    return fetchJSON<T>(url, {
        method: 'DELETE',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
}

export function createApiEventSource(url: string) {
    return new EventSource(withApiBase(url))
}
