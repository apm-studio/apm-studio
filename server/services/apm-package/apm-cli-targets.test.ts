import { describe, expect, it } from 'vitest'
import { parseApmCliTargets } from './apm-cli-targets.js'

describe('APM CLI targets', () => {
    it('parses upstream apm targets JSON rows into Studio target status', () => {
        const targets = parseApmCliTargets(JSON.stringify([
            {
                target: 'codex',
                status: 'active',
                source: '.codex/',
                deploy_dir: '.codex/',
                needs: null,
            },
            {
                target: 'gemini',
                status: 'inactive',
                source: null,
                deploy_dir: '.gemini/',
                needs: 'GEMINI.md',
            },
            {
                target: 'unknown-target',
                status: 'active',
                source: '.unknown/',
                deploy_dir: '.unknown/',
                needs: null,
            },
        ]))

        expect(targets.get('codex')).toEqual({
            target: 'codex',
            status: 'active',
            source: '.codex/',
            deployDir: '.codex/',
            needs: null,
        })
        expect(targets.get('gemini')).toEqual({
            target: 'gemini',
            status: 'inactive',
            source: null,
            deployDir: '.gemini/',
            needs: 'GEMINI.md',
        })
        expect(targets.has('unknown-target' as never)).toBe(false)
    })
})
