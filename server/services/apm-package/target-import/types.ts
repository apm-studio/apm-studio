import type { ApmGitHubImportFormat } from '../../../../shared/apm-contracts.js'
import type { ImportCandidate } from '../github-import-candidate-types.js'

export type TargetImportBuildContext = {
    repo: string
    ref: string
    sourcePath: string
    raw: string
    tree: string[]
}

export type TargetImportAdapter = {
    id: string
    format: Exclude<ApmGitHubImportFormat, 'auto'>
    priority: number
    matches: (sourcePath: string, subpath: string) => boolean
    build: (context: TargetImportBuildContext) => ImportCandidate | null
}

