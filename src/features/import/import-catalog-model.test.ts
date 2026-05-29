import { describe, expect, it } from 'vitest'
import type { ApmGitHubImportCandidate } from '../../../shared/apm-contracts'
import {
    candidateInstallKey,
    filterImportCandidates,
    scopeLabel,
} from './import-catalog-model'

function candidate(overrides: Partial<ApmGitHubImportCandidate> & { id: string; name: string; kind: ApmGitHubImportCandidate['kind'] }): ApmGitHubImportCandidate {
    return {
        id: overrides.id,
        name: overrides.name,
        description: overrides.description || '',
        kind: overrides.kind,
        format: overrides.format || 'apm',
        sourcePath: overrides.sourcePath || `${overrides.name}.md`,
        packageId: overrides.packageId || overrides.id,
        targets: overrides.targets || ['codex'],
        primitiveCounts: overrides.primitiveCounts || {},
    }
}

describe('import catalog model', () => {
    it('filters candidates by kind and searchable metadata', () => {
        const candidates = [
            candidate({
                id: 'agent-1',
                name: 'Code Reviewer',
                kind: 'agent',
                description: 'Review code for bugs',
                sourcePath: 'agents/reviewer.md',
                targets: ['codex', 'claude'],
            }),
            candidate({
                id: 'skill-1',
                name: 'Docx Writer',
                kind: 'skill',
                format: 'skill-md',
                sourcePath: 'skills/docx/SKILL.md',
            }),
            candidate({
                id: 'mcp-1',
                name: 'Filesystem',
                kind: 'mcp',
                format: 'mcp-config',
                sourcePath: 'mcp.json',
            }),
        ]

        expect(filterImportCandidates(candidates, 'claude', 'all').map((entry) => entry.id)).toEqual(['agent-1'])
        expect(filterImportCandidates(candidates, 'skill.md', 'skill').map((entry) => entry.id)).toEqual(['skill-1'])
        expect(filterImportCandidates(candidates, 'review', 'skill')).toEqual([])
    })

    it('keeps install labels and keys stable by scope', () => {
        expect(scopeLabel('workspace')).toBe('Workspace')
        expect(scopeLabel('user')).toBe('User Scope')
        expect(candidateInstallKey('user', 'candidate-1')).toBe('user:candidate-1')
    })
})
