export type PackageSource = 'user' | 'workspace' | 'registry' | 'draft'

export type GitHubSkillSyncState =
    | 'up_to_date'
    | 'update_available'
    | 'upstream_missing'
    | 'repo_drift'
    | 'provenance_unverifiable'
    | 'check_failed'

export type GitHubSkillRepoDriftItem = {
    name: string
    urn: string
    repoRootSkillPath: string
}

export type GitHubSkillRepoDrift = {
    newSkills: GitHubSkillRepoDriftItem[]
    missingPackagePrimitiveUrns: string[]
}

export type GitHubSkillSyncStatus = {
    state: GitHubSkillSyncState
    checkedAt?: string
    message?: string
    canUpdate?: boolean
    currentHash?: string
    remoteHash?: string
    repoDrift?: GitHubSkillRepoDrift
}

export type GitHubSkillSourceInfo = {
    source: 'github'
    sourceUrl: string
    owner?: string
    repo?: string
    ref?: string
    sourceSubpath?: string
    repoRootSkillPath?: string
    skillFolderHash?: string
    installedAt?: string
    updatedAt?: string
    verifiable?: boolean
    sync?: GitHubSkillSyncStatus
}
