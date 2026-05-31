import { afterEach, describe, expect, it, vi } from 'vitest'
import { apmApi } from './api-clients/apm'
import {
    resolveApmPackagePrimitiveForAgentDrop,
} from './app-dnd-apm-package'
import type { ApmPackageReadResponse } from '../shared/apm-contracts'

vi.mock('./api-clients/apm', () => ({
    apmApi: {
        readPackage: vi.fn(),
    },
}))

const readPackageMock = vi.mocked(apmApi.readPackage)

function packageResponse(overrides: Partial<ApmPackageReadResponse>): ApmPackageReadResponse {
    return {
        packageId: 'review-skill',
        manifestYaml: '',
        manifest: {
            name: 'review-skill',
            version: '0.1.0',
            type: 'skill',
            includes: 'auto',
            description: 'Review code carefully.',
            author: 'acme',
            skills: [{ path: '.apm/skills/review/SKILL.md' }],
            'x-apm': {
                schemaVersion: 1,
                packageId: 'review-skill',
                kind: 'skill',
            },
        },
        ...overrides,
    }
}

describe('resolveApmPackagePrimitiveForAgentDrop', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('resolves a skill package dropped onto an agent skill target', async () => {
        readPackageMock.mockResolvedValue(packageResponse({}))
        const warnings: string[] = []

        const resolved = await resolveApmPackagePrimitiveForAgentDrop(
            {
                kind: 'apm-package',
                packageId: 'review-skill',
                packageKind: 'skill',
                scope: 'workspace',
                name: 'Review Skill',
            },
            'skill',
            (message) => warnings.push(message),
        )

        expect(readPackageMock).toHaveBeenCalledWith('review-skill', 'workspace')
        expect(warnings).toEqual([])
        expect(resolved).toMatchObject({
            kind: 'skill',
            urn: 'apm-package/workspace/review-skill',
            source: 'workspace',
            name: 'review',
            description: 'Review code carefully.',
            author: 'acme',
        })
    })

    it('does not resolve a skill package for an instruction target', async () => {
        const warnings: string[] = []

        const resolved = await resolveApmPackagePrimitiveForAgentDrop(
            {
                kind: 'apm-package',
                packageId: 'review-skill',
                packageKind: 'skill',
                scope: 'workspace',
                name: 'Review Skill',
            },
            'instruction',
            (message) => warnings.push(message),
        )

        expect(readPackageMock).not.toHaveBeenCalled()
        expect(warnings).toEqual([])
        expect(resolved).toBeNull()
    })
})
