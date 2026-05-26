import fs from 'fs/promises'
import { parseDocument, stringify } from 'yaml'

export function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error
}

export async function readText(filePath: string) {
    try {
        return await fs.readFile(filePath, 'utf-8')
    } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') return null
        throw error
    }
}

export function parseYamlRecord<T extends Record<string, unknown>>(raw: string, label: string): T {
    const document = parseDocument(raw)
    if (document.errors.length > 0) {
        throw new Error(`${label} has invalid YAML: ${document.errors[0].message}`)
    }
    const parsed = document.toJS()
    if (!isRecord(parsed)) {
        throw new Error(`${label} must be a YAML mapping.`)
    }
    return parsed as T
}

export function yamlString(value: unknown) {
    return stringify(value, {
        sortMapEntries: true,
        lineWidth: 100,
    })
}
