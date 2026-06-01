import { describe, expect, it } from 'vitest'
import {
    apmPackagePrimitiveSummary,
    apmPackageTitle,
    filterApmPackages,
    packageMatchesPrimitiveSection,
    scopeApmPackages,
} from './package-library-packages'
import { buildApmPackageDragPayload } from './package-library-utils'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'

const workspacePackage: ApmPackageSummary = {
    packageId: 'agent-reviewer',
    name: 'reviewer',
    description: 'Review agent',
    kind: 'agent',
    agentName: 'Reviewer',
    source: 'apm',
    manifestPath: 'packages/agent-reviewer/apm.yml',
    microsoftApm: {
        packageRoot: 'packages/agent-reviewer',
        sourceDir: 'packages/agent-reviewer/.apm',
        installCommand: 'apm install ./packages/agent-reviewer --target codex',
        validateCommand: 'apm validate packages/agent-reviewer',
        packCommand: 'apm pack packages/agent-reviewer',
        primitiveCounts: { agents: 1, instructions: 0, skills: 2 },
        primitivePaths: [],
        warnings: [],
    },
}

const userPackage: ApmPackageSummary = {
    packageId: 'skill-plan',
    name: 'planning-skill',
    kind: 'skill',
    source: 'apm',
    microsoftApm: {
        packageRoot: 'packages/skill-plan',
        sourceDir: 'packages/skill-plan/.apm',
        installCommand: 'apm install ./packages/skill-plan',
        validateCommand: 'apm validate packages/skill-plan',
        packCommand: 'apm pack packages/skill-plan',
        primitiveCounts: { agents: 0, instructions: 0, skills: 1 },
        primitivePaths: [],
        warnings: [],
    },
}

describe('package-library-packages', () => {
    it('adds workspace and user scope labels to APM packages', () => {
        expect(scopeApmPackages([workspacePackage], [userPackage])).toMatchObject([
            { packageId: 'agent-reviewer', scope: 'workspace' },
            { packageId: 'skill-plan', scope: 'user' },
        ])
    })

    it('filters by scope and package search fields', () => {
        const packages = scopeApmPackages([workspacePackage], [userPackage])

        expect(filterApmPackages(packages, 'workspace', '')).toHaveLength(1)
        expect(filterApmPackages(packages, 'user', '')).toHaveLength(1)
        expect(filterApmPackages(packages, 'all', 'review')).toHaveLength(1)
        expect(filterApmPackages(packages, 'all', '2 skills')).toHaveLength(1)
    })

    it('formats title and primitive summaries for package rows', () => {
        const [pkg] = scopeApmPackages([workspacePackage], [])

        expect(apmPackageTitle(pkg)).toBe('Reviewer')
        expect(apmPackagePrimitiveSummary(pkg)).toBe('1 agent · 2 skills')
    })

    it('matches package cards to Studio Agent primitive sections', () => {
        const [agentPackage, skillPackage] = scopeApmPackages([workspacePackage], [userPackage])

        expect(packageMatchesPrimitiveSection(agentPackage, 'agents')).toBe(true)
        expect(packageMatchesPrimitiveSection(agentPackage, 'skills')).toBe(false)
        expect(packageMatchesPrimitiveSection(skillPackage, 'skills')).toBe(true)
        expect(packageMatchesPrimitiveSection(skillPackage, 'agents')).toBe(false)
    })

    it('builds draggable package payloads with scope and primitive metadata', () => {
        const [pkg] = scopeApmPackages([workspacePackage], [])

        expect(buildApmPackageDragPayload(pkg)).toMatchObject({
            kind: 'apm-package',
            packageId: 'agent-reviewer',
            packageKind: 'agent',
            scope: 'workspace',
            source: 'workspace',
            name: 'Reviewer',
            primitiveCounts: { agents: 1, instructions: 0, skills: 2 },
        })
    })
})
