import { describe, expect, it } from 'vitest'
import { computeWorkspaceHash } from './agent-projection-identity.js'
import { compileProjectionRequestRelations } from './agent-projection-relations.js'

describe('compileProjectionRequestRelations', () => {
    it('compiles request targets into projected task allowlist and prompt section', () => {
        const workingDir = '/tmp/apm-studio-workspace'
        const workspaceHash = computeWorkspaceHash(workingDir)
        const projectedAgentName = `apm-studio/workspace/${workspaceHash}/agent-2--build`

        const relations = compileProjectionRequestRelations({
            workingDir,
            requestTargets: [{
                agentId: 'agent-2',
                agentName: 'Researcher',
                description: 'Research APIs',
            }],
        })

        expect(relations.taskAllowlist).toEqual([projectedAgentName])
        expect(relations.promptSection).toContain('# Available Agents')
        expect(relations.promptSection).toContain(`agent="${projectedAgentName}"`)
        expect(relations.promptSection).toContain('Research APIs')
    })

    it('returns an empty relation projection when there are no request targets', () => {
        expect(compileProjectionRequestRelations({
            workingDir: '/tmp/apm-studio-workspace',
            requestTargets: [],
        })).toEqual({
            taskAllowlist: [],
            promptSection: null,
        })
    })
})
