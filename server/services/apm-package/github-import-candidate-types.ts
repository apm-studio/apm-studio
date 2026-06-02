import type {
    ApmGitHubImportCandidate,
    ApmPackageManifest,
} from '../../../shared/apm-contracts.js'

export type ImportCandidate = ApmGitHubImportCandidate & {
    manifest: ApmPackageManifest
    copyFiles: Array<{
        sourcePath?: string
        targetPath: string
        content?: string
    }>
}
