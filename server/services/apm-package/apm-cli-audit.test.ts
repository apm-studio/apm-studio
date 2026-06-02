import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExecFileException } from 'node:child_process'
import { parseApmCliAudit } from './apm-cli-audit.js'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('child_process', () => ({
    execFile: execFileMock,
}))

type ExecCallback = (error: ExecFileException | null, stdout?: string, stderr?: string) => void

describe('APM CLI audit', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        execFileMock.mockReset()
        vi.resetModules()
    })

    it('parses upstream apm audit JSON checks and drift findings', () => {
        const audit = parseApmCliAudit(JSON.stringify({
            passed: false,
            checks: [{
                name: 'content-integrity',
                passed: false,
                message: 'hash-drift detected',
                details: ['.github/instructions/bar.instructions.md'],
            }],
            summary: {
                total: 1,
                passed: 0,
                failed: 1,
            },
            drift: {
                drift: [{
                    path: '.github/instructions/bar.instructions.md',
                    kind: 'modified',
                    package: null,
                    inline_diff: '@@ diff',
                }],
            },
        }))

        expect(audit).toEqual({
            passed: false,
            checks: [{
                name: 'content-integrity',
                passed: false,
                message: 'hash-drift detected',
                details: ['.github/instructions/bar.instructions.md'],
            }],
            summary: {
                total: 1,
                passed: 0,
                failed: 1,
            },
            drift: [{
                path: '.github/instructions/bar.instructions.md',
                kind: 'modified',
                package: null,
                inlineDiff: '@@ diff',
            }],
        })
    })

    it('preserves failing audit JSON instead of treating exit code 1 as a transport failure', async () => {
        execFileMock.mockImplementation((command: string, args: string[], _options: unknown, callback: ExecCallback) => {
            if (command === 'apm' && args.includes('audit')) {
                const error = new Error('audit failed') as ExecFileException
                error.code = 1
                const stdout = JSON.stringify({
                    passed: false,
                    checks: [{
                        name: 'content-integrity',
                        passed: false,
                        message: 'hash-drift detected',
                        details: ['.github/instructions/bar.instructions.md'],
                    }],
                    summary: { total: 1, passed: 0, failed: 1 },
                    drift: { drift: [] },
                })
                ;(error as ExecFileException & { stdout: string; stderr: string }).stdout = stdout
                ;(error as ExecFileException & { stdout: string; stderr: string }).stderr = ''
                callback(error, stdout, '')
                return
            }
            callback(command === 'apm' ? null : new Error('missing') as ExecFileException, 'apm 1.2.3', '')
        })
        const { runApmAudit } = await import('./apm-cli-audit.js')

        const response = await runApmAudit('/tmp/workspace')

        expect(response.audit).toEqual(expect.objectContaining({
            available: true,
            passed: false,
            exitCode: 1,
            command: 'apm audit --ci --no-policy -f json',
        }))
        expect(response.audit.checks[0]).toEqual(expect.objectContaining({
            name: 'content-integrity',
            passed: false,
        }))
    })

    it('reports audit as unavailable when no APM CLI runner can be selected', async () => {
        execFileMock.mockImplementation((_command: string, _args: string[], _options: unknown, callback: ExecCallback) => {
            callback(new Error('missing') as ExecFileException)
        })
        const { runApmAudit } = await import('./apm-cli-audit.js')

        const response = await runApmAudit('/tmp/workspace')

        expect(response.audit.available).toBe(false)
        expect(response.audit.skippedReason).toBe('APM CLI is not available.')
    })
})
