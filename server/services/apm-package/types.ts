import type { WorkspaceSnapshot } from '../../../shared/workspace-contracts.js'

export type WorkspacePackageSnapshot = WorkspaceSnapshot

export type ApmWorkspaceDocument = {
    schemaVersion: 1
    product: 'APM Studio'
    workingDir: string
    savedAt: number
    activePackageIds: string[]
    workspace: WorkspacePackageSnapshot
}
