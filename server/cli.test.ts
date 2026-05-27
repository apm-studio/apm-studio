import { execFile } from 'child_process'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const serverDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.dirname(serverDir)
const tsxCli = path.join(path.dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs')
const cliPath = path.join(repoRoot, 'cli.ts')

function runCli(args: string[], env: Record<string, string> = {}) {
    return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const childEnv = { ...process.env, ...env }
        if (!('PORT' in env)) {
            delete childEnv.PORT
        }
        if (!('OPENCODE_PORT' in env)) {
            delete childEnv.OPENCODE_PORT
        }

        execFile(process.execPath, [tsxCli, cliPath, ...args], {
            cwd: repoRoot,
            env: childEnv,
        }, (error, stdout, stderr) => {
            const code = error && typeof (error as { code?: unknown }).code === 'number'
                ? (error as { code: number }).code
                : 0
            resolve({ code, stdout, stderr })
        })
    })
}

describe('apm-studio CLI', () => {
    it('rejects malformed port strings instead of truncating them', async () => {
        const result = await runCli(['doctor', '.', '--port', '12abc'])

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('Invalid port for --port: 12abc')
        expect(result.stdout).not.toContain('Port 12 is available')
    })

    it('rejects out-of-range ports without leaking socket stack traces', async () => {
        const result = await runCli(['doctor', '.', '--port', '99999'])

        expect(result.code).toBe(1)
        expect(result.stderr).toContain('Invalid port for --port: 99999')
        expect(result.stderr).not.toContain('ERR_SOCKET_BAD_PORT')
    })

    it('treats a custom OPENCODE_PORT as reserved for the managed sidecar', async () => {
        const result = await runCli(['doctor', '.', '--port', '43110'], {
            OPENCODE_PORT: '43110',
        })

        expect(result.code).toBe(1)
        expect(result.stdout).toContain('FAIL Studio port: Port 43110 is reserved for the managed OpenCode sidecar')
    })

    it('does not document removed startup shortcuts in help', async () => {
        const result = await runCli(['--help'])

        expect(result.code).toBe(0)
        expect(result.stdout).not.toContain('--openai-oauth')
        expect(result.stdout).not.toContain('--agent')
        expect(result.stdout).not.toContain('--team')
        expect(result.stdout).not.toContain('--performer')
        expect(result.stdout).not.toContain('--act')
    })

    it.each(['--openai-oauth', '--agent', '--team', '--performer', '--act'])('rejects removed option %s', async (option) => {
        const args = option === '--openai-oauth'
            ? [option]
            : [option, 'performer/@acme/workflows/reviewer']
        const result = await runCli(args)

        expect(result.code).toBe(1)
        expect(result.stderr).toContain(`Unknown option: ${option}`)
    })
})
