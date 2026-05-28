import type { SharedAssetRef } from './chat-contracts.js'
import type { ModelSelection } from './model-types.js'

export type ApmDependency =
    | string
    | ({
        name?: string
        path?: string
        ref?: string
        git?: string
        transport?: string
    } & Record<string, unknown>)

export interface ApmAgentExtension {
    agentNodeId: string
    agentName: string
    description?: string | null
    model: ModelSelection
    modelVariant?: string | null
    agentBody?: string | null
    instructionRef?: SharedAssetRef | null
    skillRefs: SharedAssetRef[]
    mcpServerNames: string[]
    agentId?: string | null
    planMode?: boolean
    derivedFrom?: string | null
    /** @deprecated read-only legacy field; use agentNodeId. */
    performerId?: string
    /** @deprecated read-only legacy field; use agentName. */
    performerName?: string
    /** @deprecated read-only legacy field; use agentBody. */
    inlineInstruction?: string | null
    /** @deprecated read-only legacy field; use instructionRef. */
    talRef?: SharedAssetRef | null
    /** @deprecated read-only legacy field; use skillRefs. */
    danceRefs?: SharedAssetRef[]
}

export interface ApmManifestExtension {
    schemaVersion: 1
    packageId: string
    kind: 'agent' | 'team' | 'workspace' | 'skill' | 'instruction' | 'prompt' | 'mcp' | 'package'
    agent?: ApmAgentExtension
    canvas?: Record<string, unknown>
    workflow?: Record<string, unknown>
}

export interface ApmPackageManifest extends Record<string, unknown> {
    name: string
    version?: string
    description?: string
    author?: string
    license?: string
    target?: string | string[]
    type?: 'instructions' | 'skill' | 'hybrid' | 'prompts' | string
    includes?: 'auto' | string[]
    dependencies?: {
        apm?: ApmDependency[]
        mcp?: ApmDependency[]
        [key: string]: unknown
    }
    devDependencies?: {
        apm?: ApmDependency[]
        mcp?: ApmDependency[]
        [key: string]: unknown
    }
    compilation?: Record<string, unknown>
    policy?: Record<string, unknown>
    marketplace?: Record<string, unknown>
    agents?: unknown[]
    instructions?: unknown[]
    prompts?: unknown[]
    skills?: unknown[]
    scripts?: Record<string, unknown>
    'x-apm'?: ApmManifestExtension
}

export interface ApmPackageLock extends Record<string, unknown> {
    lockfile_version: '1'
    generated_at?: string
    apm_version?: string
    dependencies: unknown[]
    mcp_servers?: string[]
    mcp_configs?: Record<string, unknown>
    local_deployed_files?: string[]
    local_deployed_file_hashes?: Record<string, string>
    packages?: Array<{
        package_id: string
        name: string
        version?: string
        source: 'apm-studio'
        manifest_hash: string
    }>
}

export interface MicrosoftApmPrimitiveCounts {
    agents: number
    instructions: number
    skills: number
    /** Prompt primitives are preserved as package files when imported but are not managed by Studio. */
    prompts?: number
}

export interface MicrosoftApmPackageSourceSummary {
    packageRoot: string
    sourceDir: string
    installCommand: string
    validateCommand: string
    packCommand: string
    primitiveCounts: MicrosoftApmPrimitiveCounts
    primitivePaths: string[]
    warnings: string[]
}

export interface ApmToolingRunnerStatus {
    id: 'configured' | 'apm' | 'uvx' | 'pipx' | 'python3'
    label: string
    available: boolean
    version?: string
    command: string
    role: 'cli' | 'runner' | 'runtime'
}

export interface ApmToolingStatus {
    available: boolean
    recommendedCommand: string | null
    version?: string
    runners: ApmToolingRunnerStatus[]
    installHints: string[]
    deploymentNote: string
}

export interface ApmPackageSummary {
    packageId: string
    name: string
    version?: string
    description?: string
    kind: ApmManifestExtension['kind'] | 'unknown'
    agentName?: string
    agentComponents?: {
        instructions: number
        skills: number
        mcp: number
        model: boolean
    }
    derivedFrom?: string | null
    manifestPath?: string
    lockPath?: string
    source: 'apm'
    updatedAt?: number
    microsoftApm?: MicrosoftApmPackageSourceSummary
}

export interface ApmValidationResult {
    valid: boolean
    errors: string[]
    warnings: string[]
}

export interface ApmPackageListResponse {
    packages: ApmPackageSummary[]
}

export interface ApmToolingResponse {
    tooling: ApmToolingStatus
}

export interface ApmPackageReadResponse {
    packageId: string
    manifest: ApmPackageManifest
    lock?: ApmPackageLock
    manifestYaml: string
    lockYaml?: string
    microsoftApm?: MicrosoftApmPackageSourceSummary
}

export interface ApmPackageWriteRequest {
    manifest: ApmPackageManifest
}

export interface ApmPackageWriteResponse extends ApmPackageReadResponse {
    ok: true
}

export interface ApmPackageImportRequest {
    packageId?: string
    manifestYaml?: string
    manifest?: ApmPackageManifest
}

export type ApmGitHubImportFormat =
    | 'auto'
    | 'apm'
    | 'skill-md'
    | 'codex-toml'
    | 'claude-md'
    | 'instruction-md'
    | 'mcp-config'

export interface ApmGitHubImportRequest {
    source: string
    ref?: string
    format?: ApmGitHubImportFormat
    limit?: number
    candidateIds?: string[]
    scope?: 'stage' | 'global'
}

export interface ApmGitHubImportPackage {
    packageId: string
    name: string
    kind: 'agent' | 'skill' | 'instruction' | 'mcp' | 'package'
    sourcePath: string
    packagePath: string
    manifestPath: string
}

export interface ApmGitHubImportResponse {
    ok: true
    scope: 'stage' | 'global'
    targetWorkingDir: string
    source: {
        repo: string
        ref: string
        subpath?: string
        stars?: number
        href?: string
    }
    packages: ApmGitHubImportPackage[]
    warnings: string[]
}

export interface ApmGitHubImportCandidate {
    id: string
    name: string
    description: string
    kind: ApmGitHubImportPackage['kind']
    format: Exclude<ApmGitHubImportFormat, 'auto'>
    sourcePath: string
    packageId: string
    targets: string[]
    primitiveCounts: Partial<MicrosoftApmPrimitiveCounts>
}

export interface ApmGitHubImportPreviewResponse {
    ok: true
    source: {
        repo: string
        ref: string
        subpath?: string
        stars?: number
        href?: string
    }
    candidates: ApmGitHubImportCandidate[]
    warnings: string[]
}

export type ApmGitHubSourceCatalogId =
    | 'awesome-copilot'
    | 'addy-agent-skills'
    | 'vercel-agent-skills'
    | 'vercel-skills'
    | 'microsoft-skills'
    | 'microsoft-apm'
    | 'awesome-agent-skills'
    | 'awesome-claude-code-subagents'

export type ApmGitHubSourceAssetKind = 'agent' | 'skill' | 'mcp' | 'package'

export interface ApmGitHubSourceCatalogRequest {
    sources?: ApmGitHubSourceCatalogId[]
    limitPerSource?: number
}

export interface ApmGitHubSourceCatalogSource {
    id: ApmGitHubSourceCatalogId
    name: string
    repo: string
    ref: string
    href: string
    stars?: number
}

export interface ApmGitHubSourceAsset {
    id: string
    kind: ApmGitHubSourceAssetKind
    name: string
    description: string
    sourceName: string
    repo: string
    href: string
    sourcePath?: string
    sourceUrl?: string
    tags: string[]
    targets: string[]
    stars?: number
    importRequest?: ApmGitHubImportRequest
}

export interface ApmGitHubSourceCatalogResponse {
    ok: true
    sources: ApmGitHubSourceCatalogSource[]
    assets: ApmGitHubSourceAsset[]
    warnings: string[]
}

export interface ApmPackageExportResponse {
    packageId: string
    manifestYaml: string
    lockYaml: string
    manifestPath: string
    lockPath: string
    microsoftApm?: MicrosoftApmPackageSourceSummary
}

export type ApmExportUnit = 'agent-packages' | 'agents' | 'instructions' | 'skills' | 'mcp'

export type ApmSyncTargetId =
    | 'codex'
    | 'gemini'
    | 'claude'
    | 'opencode'
    | 'cursor'
    | 'windsurf'
    | 'copilot'
    | 'agent-skills'

export type ApmSyncStrategy = 'cli-first' | 'studio-fallback' | 'unsupported'

export type ApmSyncTargetDefinitionKind = 'agent' | 'instruction' | 'skill' | 'mcp' | 'config' | 'unknown'

export interface ApmSyncTargetItemSummary {
    packageId: string
    target: ApmSyncTargetId
    exportUnit: ApmExportUnit
    artifactCount: number
    artifacts: string[]
    updatedAt: string
}

export interface ApmSyncTargetDefinitionSummary {
    id: string
    target: ApmSyncTargetId
    name: string
    kind: ApmSyncTargetDefinitionKind
    path: string
    exportUnit?: ApmExportUnit
    managed: boolean
    managedPackageId?: string
    managedExportUnit?: ApmExportUnit
    updatedAt?: string
}

export interface ApmSyncTargetSummary {
    id: ApmSyncTargetId
    label: string
    description: string
    outputHint: string
    commandPreview: string
    available: boolean
    supportedExportUnits: ApmExportUnit[]
    strategy: ApmSyncStrategy
    currentItems: ApmSyncTargetItemSummary[]
    definitions: ApmSyncTargetDefinitionSummary[]
    disabledReason?: string
}

export interface ApmSyncTargetsResponse {
    tooling: ApmToolingStatus
    targets: ApmSyncTargetSummary[]
}

export interface ApmSyncRunRequest {
    target?: ApmSyncTargetId
    targets?: ApmSyncTargetId[]
    exportUnit?: ApmExportUnit
    packageIds?: string[]
    frozen?: boolean
}

export interface ApmSyncPackageResult {
    packageId: string
    name: string
    target: ApmSyncTargetId
    exportUnit?: ApmExportUnit
    command: string
    status: 'synced' | 'failed' | 'skipped'
    projectedAs?: string
    artifacts?: string[]
    warnings?: string[]
    modelOmitted?: boolean
    stdout?: string
    stderr?: string
    error?: string
}

export interface ApmSyncRunResponse {
    ok: true
    target?: ApmSyncTargetId
    targets: ApmSyncTargetId[]
    exportUnit: ApmExportUnit
    startedAt: number
    finishedAt: number
    results: ApmSyncPackageResult[]
}
