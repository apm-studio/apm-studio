import type {
    ApmAuditCheck,
    ApmAuditDriftFinding,
    ApmAuditResponse,
    ApmAuditStatus,
    ApmAuditSummary,
} from '../../../shared/apm-contracts.js'
import {
    runApmCliCommandCapture,
    selectApmCliRunner,
} from './apm-cli-runner.js'

const AUDIT_ARGS = ['audit', '--ci', '--no-policy', '-f', 'json'] as const

type ParsedApmAudit = Pick<ApmAuditStatus, 'passed' | 'summary' | 'checks' | 'drift'>

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown, fallback = '') {
    return typeof value === 'string' ? value : fallback
}

function booleanValue(value: unknown) {
    return typeof value === 'boolean' ? value : undefined
}

function numberValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function stringArray(value: unknown) {
    return Array.isArray(value)
        ? value.map((entry) => stringValue(entry)).filter(Boolean)
        : []
}

function parseJsonObject(output: string): Record<string, unknown> | null {
    const start = output.indexOf('{')
    if (start < 0) return null

    let end = output.lastIndexOf('}')
    while (end >= start) {
        try {
            const parsed = JSON.parse(output.slice(start, end + 1))
            return isRecord(parsed) ? parsed : null
        } catch {
            end = output.lastIndexOf('}', end - 1)
        }
    }
    return null
}

function parseAuditCheck(value: unknown): ApmAuditCheck | null {
    if (!isRecord(value)) return null
    const name = stringValue(value.name).trim()
    if (!name) return null
    return {
        name,
        passed: value.passed === true,
        message: stringValue(value.message),
        details: stringArray(value.details),
    }
}

function parseAuditSummary(value: unknown): ApmAuditSummary | undefined {
    if (!isRecord(value)) return undefined
    return {
        total: numberValue(value.total),
        passed: numberValue(value.passed),
        failed: numberValue(value.failed),
    }
}

function parseDriftFinding(value: unknown): ApmAuditDriftFinding | null {
    if (!isRecord(value)) return null
    const path = stringValue(value.path).trim()
    const kind = stringValue(value.kind).trim()
    if (!path || !kind) return null
    return {
        path,
        kind,
        package: typeof value.package === 'string' ? value.package : null,
        inlineDiff: typeof value.inline_diff === 'string' ? value.inline_diff : null,
    }
}

function parseDrift(value: unknown): ApmAuditDriftFinding[] {
    const driftRows = isRecord(value) ? value.drift : value
    return Array.isArray(driftRows)
        ? driftRows.map(parseDriftFinding).filter((entry): entry is ApmAuditDriftFinding => !!entry)
        : []
}

function truncateOutput(value: string) {
    return value.length > 4000 ? `${value.slice(0, 4000)}\n[truncated]` : value
}

export function parseApmCliAudit(output: string): ParsedApmAudit | null {
    const payload = parseJsonObject(output)
    if (!payload) return null
    const checks = Array.isArray(payload.checks)
        ? payload.checks.map(parseAuditCheck).filter((entry): entry is ApmAuditCheck => !!entry)
        : []
    return {
        passed: booleanValue(payload.passed),
        summary: parseAuditSummary(payload.summary),
        checks,
        drift: parseDrift(payload.drift),
    }
}

export async function runApmAudit(workingDir: string): Promise<ApmAuditResponse> {
    const checkedAt = new Date().toISOString()
    const runner = await selectApmCliRunner()
    if (!runner) {
        return {
            audit: {
                available: false,
                checkedAt,
                checks: [],
                drift: [],
                skippedReason: 'APM CLI is not available.',
            },
        }
    }

    const outcome = await runApmCliCommandCapture(runner, [...AUDIT_ARGS], {
        cwd: workingDir,
        timeout: 120_000,
    })
    const parsed = parseApmCliAudit(outcome.stdout) || parseApmCliAudit(`${outcome.stdout}\n${outcome.stderr}`)

    if (!parsed) {
        return {
            audit: {
                available: true,
                checkedAt,
                command: outcome.command,
                runner: outcome.runner.label,
                exitCode: outcome.exitCode,
                passed: false,
                checks: [],
                drift: [],
                error: outcome.error || 'Unable to parse APM audit JSON output.',
                stderr: truncateOutput(outcome.stderr || outcome.stdout),
            },
        }
    }

    return {
        audit: {
            available: true,
            checkedAt,
            command: outcome.command,
            runner: outcome.runner.label,
            exitCode: outcome.exitCode,
            passed: parsed.passed ?? outcome.exitCode === 0,
            summary: parsed.summary,
            checks: parsed.checks,
            drift: parsed.drift,
            ...(outcome.stderr ? { stderr: truncateOutput(outcome.stderr) } : {}),
        },
    }
}
