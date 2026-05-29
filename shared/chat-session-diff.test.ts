import { describe, expect, it } from 'vitest'
import { normalizeChatSessionDiffEntries } from './chat-session-diff.js'

describe('chat session diff normalization', () => {
    it('normalizes unified-diff-only OpenCode entries to the Studio contract', () => {
        expect(normalizeChatSessionDiffEntries([
            {
                post_name: 'src/example.ts',
                diff: [
                    '--- a/src/example.ts',
                    '+++ b/src/example.ts',
                    '@@ -1 +1 @@',
                    '-old',
                    '+new',
                ].join('\n'),
                extra: 'ignored',
            },
        ])).toEqual([
            {
                file: 'src/example.ts',
                before: '',
                after: '',
                additions: 1,
                deletions: 1,
                status: 'modified',
                rawDiff: expect.stringContaining('+++ b/src/example.ts'),
            },
        ])
    })
})
