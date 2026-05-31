import { describe, expect, it } from 'vitest'
import { parseSource } from './source-ref.js'

describe('GitHub source parser', () => {
    it('parses GitHub blob URLs with the selected path preserved', () => {
        expect(parseSource('https://github.com/acme/agent-kit/blob/main/skills/research/SKILL.md')).toMatchObject({
            type: 'github',
            owner: 'acme',
            repo: 'agent-kit',
            ref: 'main',
            subpath: 'skills/research/SKILL.md',
            refPath: 'main/skills/research/SKILL.md',
            sourcePathKind: 'blob',
            url: 'https://github.com/acme/agent-kit.git',
        })
    })

    it('parses raw GitHub URLs with the selected path preserved', () => {
        expect(parseSource('https://raw.githubusercontent.com/acme/agent-kit/main/.codex/agents/reviewer.toml')).toMatchObject({
            type: 'github',
            owner: 'acme',
            repo: 'agent-kit',
            ref: 'main',
            subpath: '.codex/agents/reviewer.toml',
            refPath: 'main/.codex/agents/reviewer.toml',
            sourcePathKind: 'raw',
        })
    })

    it('parses shorthand refs and GitHub SSH URLs', () => {
        expect(parseSource('acme/agent-kit@dev')).toMatchObject({
            owner: 'acme',
            repo: 'agent-kit',
            ref: 'dev',
        })
        expect(parseSource('git@github.com:acme/agent-kit.git')).toMatchObject({
            owner: 'acme',
            repo: 'agent-kit',
            url: 'https://github.com/acme/agent-kit.git',
        })
    })

    it('rejects path traversal in source subpaths', () => {
        expect(() => parseSource('acme/agent-kit/../secret')).toThrow('Unsafe subpath')
    })
})
