import crypto from 'crypto'
import type { ApmPackageManifest } from '../../../shared/apm-contracts.js'
import { isRecord } from './yaml-io.js'

function sortForHash(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortForHash)
    }
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, sortForHash(value[key])]),
        )
    }
    return value
}

export function hashManifest(manifest: ApmPackageManifest) {
    return `sha256:${crypto.createHash('sha256').update(JSON.stringify(sortForHash(manifest))).digest('hex')}`
}

export function hashText(value: string) {
    return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`
}

export function hashStructuredValue(value: unknown) {
    return `sha256:${crypto.createHash('sha256').update(JSON.stringify(sortForHash(value))).digest('hex')}`
}
