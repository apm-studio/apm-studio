import type {
    FileListEntry,
    FileStatusSummary,
    FindSymbolMatch,
    FindTextMatch,
    OpenCodeAgentSummary,
    VcsStatusResponse,
} from '../../../shared/opencode-contracts.js'
import {
    booleanField,
    hasFields,
    numberField,
    recordFromUnknown,
    stringField,
} from './response-data.js'

export function normalizeFileListEntry(value: unknown): FileListEntry | null {
    const record = recordFromUnknown(value)
    if (!record) return null
    const entry: FileListEntry = {
        ...(stringField(record, 'name') ? { name: stringField(record, 'name') } : {}),
        ...(stringField(record, 'path') ? { path: stringField(record, 'path') } : {}),
        ...(stringField(record, 'absolute') ? { absolute: stringField(record, 'absolute') } : {}),
        ...(stringField(record, 'type') ? { type: stringField(record, 'type') } : {}),
        ...(booleanField(record, 'isDirectory') !== undefined ? { isDirectory: booleanField(record, 'isDirectory') } : {}),
        ...(numberField(record, 'size') !== undefined ? { size: numberField(record, 'size') } : {}),
        ...(numberField(record, 'modified') !== undefined ? { modified: numberField(record, 'modified') } : {}),
    }
    return hasFields(entry) ? entry : null
}

export function normalizeFindTextMatch(value: unknown): FindTextMatch | null {
    const record = recordFromUnknown(value)
    if (!record) return null
    const match: FindTextMatch = {
        ...(stringField(record, 'path') ? { path: stringField(record, 'path') } : {}),
        ...(numberField(record, 'line') !== undefined ? { line: numberField(record, 'line') } : {}),
        ...(numberField(record, 'column') !== undefined ? { column: numberField(record, 'column') } : {}),
        ...(stringField(record, 'text') ? { text: stringField(record, 'text') } : {}),
        ...(stringField(record, 'match') ? { match: stringField(record, 'match') } : {}),
        ...(stringField(record, 'preview') ? { preview: stringField(record, 'preview') } : {}),
    }
    return hasFields(match) ? match : null
}

export function normalizeFindSymbolMatch(value: unknown): FindSymbolMatch | null {
    const record = recordFromUnknown(value)
    if (!record) return null
    const match: FindSymbolMatch = {
        ...(stringField(record, 'name') ? { name: stringField(record, 'name') } : {}),
        ...(stringField(record, 'path') ? { path: stringField(record, 'path') } : {}),
        ...(stringField(record, 'kind') ? { kind: stringField(record, 'kind') } : {}),
        ...(numberField(record, 'line') !== undefined ? { line: numberField(record, 'line') } : {}),
        ...(numberField(record, 'column') !== undefined ? { column: numberField(record, 'column') } : {}),
        ...(stringField(record, 'containerName') ? { containerName: stringField(record, 'containerName') } : {}),
    }
    return hasFields(match) ? match : null
}

export function normalizeOpenCodeAgentSummary(value: unknown): OpenCodeAgentSummary | null {
    const record = recordFromUnknown(value)
    if (!record) return null
    const name = stringField(record, 'name') || stringField(record, 'id')
    if (!name) return null
    const mode = stringField(record, 'mode')
    return {
        name,
        ...(stringField(record, 'model') ? { model: stringField(record, 'model') } : {}),
        ...(stringField(record, 'description') ? { description: stringField(record, 'description') } : {}),
        ...(stringField(record, 'color') ? { color: stringField(record, 'color') } : {}),
        ...(mode === 'subagent' || mode === 'primary' || mode === 'all' ? { mode } : {}),
        ...(booleanField(record, 'hidden') !== undefined ? { hidden: booleanField(record, 'hidden') } : {}),
        ...(booleanField(record, 'native') !== undefined ? { native: booleanField(record, 'native') } : {}),
        ...(stringField(record, 'variant') ? { variant: stringField(record, 'variant') } : {}),
    }
}

export function normalizeFileStatusSummary(value: unknown): FileStatusSummary | null {
    const record = recordFromUnknown(value)
    if (!record) return null
    const path = stringField(record, 'path')
    const status = stringField(record, 'status')
    if (!path || (status !== 'added' && status !== 'deleted' && status !== 'modified')) {
        return null
    }
    return {
        path,
        added: numberField(record, 'added') ?? 0,
        removed: numberField(record, 'removed') ?? 0,
        status,
    }
}

export function normalizeFindFilePath(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null
}

export function normalizeVcsStatus(value: unknown): VcsStatusResponse {
    const record = recordFromUnknown(value)
    if (!record) return {}
    const branch = record.branch
    return typeof branch === 'string' || branch === null ? { branch } : {}
}
