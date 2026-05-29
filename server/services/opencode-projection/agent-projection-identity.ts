import { createHash } from 'crypto'
import {
    resolveAgentIdentity,
    type Posture,
} from './projection-manifest.js'

export function computeWorkspaceHash(workingDir: string) {
    return createHash('sha1').update(workingDir).digest('hex').slice(0, 12)
}

export function getProjectedAgentName(
    workingDir: string,
    agentId: string,
    posture: Posture,
    scope: 'workspace' | 'team' = 'workspace',
    teamId?: string,
) {
    const workspaceHash = computeWorkspaceHash(workingDir)
    return resolveAgentIdentity({
        executionDir: workingDir,
        workspaceHash,
        agentId,
        posture,
        scope,
        teamId,
    }).agentName
}
