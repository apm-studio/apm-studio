export type WorkspacePackageSnapshot = {
    workingDir?: string
    performers?: unknown[]
    acts?: unknown[]
    [key: string]: unknown
}

export type ApmWorkspaceDocument = {
    schemaVersion: 1
    product: 'APM Studio'
    workingDir: string
    savedAt: number
    activePackageIds: string[]
    workspace: WorkspacePackageSnapshot
}
