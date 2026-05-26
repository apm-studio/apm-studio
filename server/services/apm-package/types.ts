export type WorkspacePackageSnapshot = {
    workingDir?: string
    performers?: unknown[]
    acts?: unknown[]
    [key: string]: unknown
}

export type EightPmWorkspaceDocument = {
    schemaVersion: 1
    product: '8PM Studio'
    workingDir: string
    savedAt: number
    activePackageIds: string[]
    workspace: WorkspacePackageSnapshot
}
