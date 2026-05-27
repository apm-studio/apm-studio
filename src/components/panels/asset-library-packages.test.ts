import { describe, expect, it } from 'vitest'
import {
    apmPackagePrimitiveSummary,
    apmPackageTitle,
    filterApmPackages,
    scopeApmPackages,
} from './asset-library-packages'
import { buildApmPackageDragPayload } from './asset-library-utils'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'

const stagePackage: ApmPackageSummary = {
    packageId: 'agent-reviewer',
    name: 'reviewer',
    description: 'Review agent',
    kind: 'agent',
    agentName: 'Reviewer',
    source: 'apm',
    manifestPath: '.apm-studio/packages/agent-reviewer/apm.yml',
    microsoftApm: {
        packageRoot: '.apm-studio/packages/agent-reviewer',
        sourceDir: '.apm-studio/packages/agent-reviewer/.apm',
        installCommand: 'apm install .apm-studio/packages/agent-reviewer --target codex',
        validateCommand: 'apm validate .apm-studio/packages/agent-reviewer',
        packCommand: 'apm pack .apm-studio/packages/agent-reviewer',
        primitiveCounts: { agents: 1, instructions: 0, skills: 2 },
        primitivePaths: [],
        warnings: [],
    },
}

const globalPackage: ApmPackageSummary = {
    packageId: 'skill-plan',
    name: 'planning-skill',
    kind: 'skill',
    source: 'apm',
}

describe('asset-library-packages', () => {
    it('adds workspace and global scope labels to APM packages', () => {
        expect(scopeApmPackages([stagePackage], [globalPackage])).toMatchObject([
            { packageId: 'agent-reviewer', scope: 'stage' },
            { packageId: 'skill-plan', scope: 'global' },
        ])
    })

    it('filters by scope and package search fields', () => {
        const packages = scopeApmPackages([stagePackage], [globalPackage])

        expect(filterApmPackages(packages, 'stage', '')).toHaveLength(1)
        expect(filterApmPackages(packages, 'global', '')).toHaveLength(1)
        expect(filterApmPackages(packages, 'all', 'review')).toHaveLength(1)
        expect(filterApmPackages(packages, 'all', '2 skills')).toHaveLength(1)
    })

    it('formats title and primitive summaries for package rows', () => {
        const [pkg] = scopeApmPackages([stagePackage], [])

        expect(apmPackageTitle(pkg)).toBe('Reviewer')
        expect(apmPackagePrimitiveSummary(pkg)).toBe('1 agent · 2 skills')
    })

    it('builds draggable package payloads with scope and primitive metadata', () => {
        const [pkg] = scopeApmPackages([stagePackage], [])

        expect(buildApmPackageDragPayload(pkg)).toMatchObject({
            kind: 'apm-package',
            packageId: 'agent-reviewer',
            packageKind: 'agent',
            scope: 'stage',
            source: 'stage',
            name: 'Reviewer',
            primitiveCounts: { agents: 1, instructions: 0, skills: 2 },
        })
    })
})
