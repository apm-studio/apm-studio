import type { WakeUpTarget } from './event-router.js'

export interface WakeCascadeResult {
    targets: WakeUpTarget[]
    queued: string[]
    injected: string[]
    errors: string[]
}

export function emptyWakeCascadeResult(): WakeCascadeResult {
    return {
        targets: [],
        queued: [],
        injected: [],
        errors: [],
    }
}

export function mergeWakeCascadeResult(target: WakeCascadeResult, source: WakeCascadeResult) {
    target.injected.push(...source.injected)
    target.queued.push(...source.queued)
    target.errors.push(...source.errors)
}
