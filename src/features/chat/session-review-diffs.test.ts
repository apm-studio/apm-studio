import { describe, expect, it } from 'vitest'
import { normalizeSessionDiffEntries } from './session-review-diffs'

describe('session-review-diffs', () => {
    it('keeps Studio session diff entries in review shape', () => {
        const diffs = normalizeSessionDiffEntries([
            {
                file: 'src/example.ts',
                before: '',
                after: '',
                additions: 1,
                deletions: 1,
                status: 'modified',
                rawDiff: '@@ -1 +1 @@\n-old\n+new',
            },
        ])

        expect(diffs).toEqual([
            {
                file: 'src/example.ts',
                before: '',
                after: '',
                additions: 1,
                deletions: 1,
                status: 'modified',
                rawDiff: '@@ -1 +1 @@\n-old\n+new',
            },
        ])
    })

    it('does not accept raw or inferred diff aliases in the browser review boundary', () => {
        expect(normalizeSessionDiffEntries([
            {
                file: 'src/studio.ts',
                before: 'old',
                after: 'new',
                additions: 1,
                deletions: 1,
                status: 'modified',
            },
            {
                path: 'src/raw.ts',
                diff: '@@ -1 +1 @@\n-old\n+new',
                type: 'update',
            } as never,
            {
                file: 'src/incomplete.ts',
                before: '',
                after: '',
                additions: 1,
                deletions: 0,
            } as never,
        ])).toEqual([
            {
                file: 'src/studio.ts',
                before: 'old',
                after: 'new',
                additions: 1,
                deletions: 1,
                status: 'modified',
            },
        ])
    })
})
