import type {
    ApmAuditStatus,
    ApmPackageLockStatus,
    ApmPrimitiveFileKind,
    ApmPrimitiveFileSummary,
} from '../../../shared/apm-contracts'

export type InspectorTone = 'success' | 'error' | 'info' | 'warning'

export function lockStatusLabel(status?: ApmPackageLockStatus) {
    if (!status) return 'Lock unknown'
    if (status.state === 'current') return 'Lock current'
    if (status.state === 'missing') return 'Lock missing'
    if (status.state === 'stale') return 'Lock stale'
    return 'Lock invalid'
}

export function lockStatusTone(status?: ApmPackageLockStatus): InspectorTone {
    if (!status) return 'info'
    if (status.state === 'current') return 'success'
    if (status.state === 'missing' || status.state === 'stale') return 'warning'
    return 'error'
}

export function canRegenerateLock(status?: ApmPackageLockStatus) {
    return status?.state === 'missing' || status?.state === 'stale' || status?.state === 'invalid'
}

export function primitiveKindLabel(kind: ApmPrimitiveFileKind) {
    if (kind === 'agent') return 'Agents'
    if (kind === 'instruction') return 'Instructions'
    if (kind === 'skill') return 'Skills'
    if (kind === 'prompt') return 'Prompts'
    if (kind === 'command') return 'Commands'
    return 'Hooks'
}

const primitiveKindOrder: ApmPrimitiveFileKind[] = ['agent', 'instruction', 'skill', 'prompt', 'command', 'hook']

export function groupPrimitiveFiles(files: ApmPrimitiveFileSummary[]) {
    return primitiveKindOrder
        .map((kind) => ({
            kind,
            label: primitiveKindLabel(kind),
            files: files.filter((file) => file.kind === kind),
        }))
        .filter((group) => group.files.length > 0)
}

export function primitiveFileStatus(file?: ApmPrimitiveFileSummary | null) {
    if (!file) return 'Select a primitive source file.'
    return file.readonlyReason || 'Read-only preview. Edit this file externally, then refresh Studio.'
}

export function auditStatusLabel(audit?: ApmAuditStatus | null) {
    if (!audit) return 'Audit not run'
    if (!audit.available) return 'APM audit unavailable'
    if (audit.error) return 'APM audit error'
    if (audit.passed === false) return 'APM audit failed'
    if (audit.passed === true) return 'APM audit passed'
    return 'APM audit complete'
}

export function auditStatusTone(audit?: ApmAuditStatus | null): InspectorTone {
    if (!audit) return 'info'
    if (!audit.available) return 'warning'
    if (audit.error || audit.passed === false) return 'error'
    if (audit.passed === true) return 'success'
    return 'info'
}

export function auditStatusMessage(audit?: ApmAuditStatus | null) {
    if (!audit) return 'Not checked yet.'
    if (!audit.available) return audit.skippedReason || 'APM CLI is not available.'
    if (audit.error) return audit.error
    const failed = audit.summary?.failed || audit.checks.filter((check) => !check.passed).length
    const total = audit.summary?.total || audit.checks.length
    const driftCount = audit.drift.length
    if (failed > 0) return `${failed} of ${total} checks failed${driftCount ? `, ${driftCount} drift findings` : ''}.`
    return `${total} checks passed${driftCount ? ` with ${driftCount} drift findings` : ''}.`
}
