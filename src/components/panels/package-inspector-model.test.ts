import { describe, expect, it } from 'vitest'
import type { ApmPrimitiveFileSummary } from '../../../shared/apm-contracts'
import {
    auditStatusLabel,
    auditStatusMessage,
    auditStatusTone,
    canRegenerateLock,
    groupPrimitiveFiles,
    lockStatusLabel,
    lockStatusTone,
    primitiveFileStatus,
} from './package-inspector-model'

function primitive(partial: Partial<ApmPrimitiveFileSummary>): ApmPrimitiveFileSummary {
    return {
        path: '.apm/skills/review/SKILL.md',
        kind: 'skill',
        label: 'review',
        hash: 'sha256:file',
        size: 42,
        ...partial,
    }
}

describe('package inspector model', () => {
    it('groups primitive files in APM element order', () => {
        const groups = groupPrimitiveFiles([
            primitive({ kind: 'hook', path: '.apm/hooks/check.json', label: 'check' }),
            primitive({ kind: 'agent', path: '.apm/agents/planner.agent.md', label: 'planner' }),
            primitive({ kind: 'skill', path: '.apm/skills/review/SKILL.md', label: 'review' }),
        ])

        expect(groups.map((group) => group.label)).toEqual(['Agents', 'Skills', 'Hooks'])
        expect(groups[0].files[0].path).toBe('.apm/agents/planner.agent.md')
    })

    it('labels lock status and regenerate eligibility', () => {
        expect(lockStatusLabel({ state: 'current', manifestHash: 'sha256:a', lockManifestHash: 'sha256:a' })).toBe('Lock current')
        expect(lockStatusTone({ state: 'current', manifestHash: 'sha256:a', lockManifestHash: 'sha256:a' })).toBe('success')
        expect(canRegenerateLock({ state: 'current', manifestHash: 'sha256:a', lockManifestHash: 'sha256:a' })).toBe(false)

        expect(lockStatusLabel({ state: 'stale', manifestHash: 'sha256:b', lockManifestHash: 'sha256:a' })).toBe('Lock stale')
        expect(lockStatusTone({ state: 'stale', manifestHash: 'sha256:b', lockManifestHash: 'sha256:a' })).toBe('warning')
        expect(canRegenerateLock({ state: 'stale', manifestHash: 'sha256:b', lockManifestHash: 'sha256:a' })).toBe(true)

        expect(lockStatusLabel({ state: 'invalid', manifestHash: 'sha256:b' })).toBe('Lock invalid')
        expect(lockStatusTone({ state: 'invalid', manifestHash: 'sha256:b' })).toBe('error')
        expect(canRegenerateLock({ state: 'invalid', manifestHash: 'sha256:b' })).toBe(true)
    })

    it('labels primitive source files as externally edited read-only previews', () => {
        expect(primitiveFileStatus(primitive({ readonlyReason: undefined }))).toBe('Read-only preview. Edit this file externally, then refresh Studio.')
        expect(primitiveFileStatus(primitive({ readonlyReason: 'Generated file.' }))).toBe('Generated file.')
    })

    it('labels upstream APM audit status for inspector display', () => {
        const failedAudit = {
            available: true,
            checkedAt: '2026-06-02T00:00:00.000Z',
            passed: false,
            summary: { total: 3, passed: 2, failed: 1 },
            checks: [{
                name: 'content-integrity',
                passed: false,
                message: 'hash-drift detected',
                details: ['.github/instructions/bar.instructions.md'],
            }],
            drift: [{ path: '.github/instructions/bar.instructions.md', kind: 'modified' }],
        }

        expect(auditStatusLabel(failedAudit)).toBe('APM audit failed')
        expect(auditStatusTone(failedAudit)).toBe('error')
        expect(auditStatusMessage(failedAudit)).toBe('1 of 3 checks failed, 1 drift findings.')
        expect(auditStatusLabel({ ...failedAudit, available: false, skippedReason: 'missing apm' })).toBe('APM audit unavailable')
    })
})
