import type { SharedPrimitiveRef } from './chat-contracts.js'
import type { ModelSelection } from './model-types.js'

export const APM_PACKAGE_SCOPES = ['workspace', 'user'] as const
export type ApmPackageScope = typeof APM_PACKAGE_SCOPES[number]

export function isApmPackageScope(value: unknown): value is ApmPackageScope {
    return value === 'workspace' || value === 'user'
}

export function normalizeApmPackageScope(value: unknown): ApmPackageScope {
    return value === 'user' ? 'user' : 'workspace'
}

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
    skillRefs: SharedPrimitiveRef[]
    mcpServerNames: string[]
    runtimeAgentId?: string | null
    planMode?: boolean
    derivedFrom?: string | null
}

export interface ApmManifestExtension {
    schemaVersion: 1
    packageId: string
    kind:
        | 'agent'
        | 'team'
        | 'workspace'
        | 'skill'
        | 'instruction'
        | 'prompt'
        | 'command'
        | 'hook'
        | 'mcp'
        | 'package'
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
    type?: 'instructions' | 'skill' | 'hybrid' | 'prompts' | 'commands' | 'hooks' | string
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

export type ApmPackageLockState = 'missing' | 'current' | 'stale' | 'invalid'

export interface ApmPackageLockStatus {
    state: ApmPackageLockState
    manifestHash: string
    lockManifestHash?: string
    message?: string
}

export interface MicrosoftApmPrimitiveCounts {
    agents: number
    instructions: number
    skills: number
    /** Prompt primitives are preserved as package files when imported but are not managed by Studio. */
    prompts?: number
    /** Command sync uses APM prompt source files (`.apm/prompts/*.prompt.md`) for command-capable targets. */
    commands?: number
    /** Hook primitives are preserved and synced CLI-first, but are not managed by Studio. */
    hooks?: number
    /** MCP dependency entries live in apm.yml and are synced CLI-first as target MCP config. */
    mcp?: number
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

export interface ApmAuditCheck {
    name: string
    passed: boolean
    message: string
    details: string[]
}

export interface ApmAuditDriftFinding {
    path: string
    kind: string
    package?: string | null
    inlineDiff?: string | null
}

export interface ApmAuditSummary {
    total: number
    passed: number
    failed: number
}

export interface ApmAuditStatus {
    available: boolean
    checkedAt: string
    command?: string
    runner?: string
    exitCode?: number
    passed?: boolean
    summary?: ApmAuditSummary
    checks: ApmAuditCheck[]
    drift: ApmAuditDriftFinding[]
    skippedReason?: string
    error?: string
    stderr?: string
}

export interface ApmAuditResponse {
    audit: ApmAuditStatus
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
    manifestHash: string
    sourceTreeHash?: string
    lockStatus: ApmPackageLockStatus
    manifestYaml: string
    lockYaml?: string
    microsoftApm?: MicrosoftApmPackageSourceSummary
}

export interface ApmPackageWriteRequest {
    manifest: ApmPackageManifest
    baseManifestHash?: string
}

export interface ApmPackageWriteResponse extends ApmPackageReadResponse {
    ok: true
}

export type ApmPackageImportResponse = ApmPackageWriteResponse

export interface ApmPackageCopyRequest {
    packageId: string
    fromScope: ApmPackageScope
    toScope: ApmPackageScope
}

export interface ApmPackageCopyResponse extends ApmPackageReadResponse {
    ok: true
    fromScope: ApmPackageScope
    toScope: ApmPackageScope
}

export interface ApmPackageDeleteResponse {
    ok: true
    packageId: string
}

export interface ApmPackageImportRequest {
    packageId?: string
    manifestYaml?: string
    manifest?: ApmPackageManifest
    scope?: ApmPackageScope
}

export interface ApmValidationRequest {
    manifest?: unknown
}

export type ApmPrimitiveFileKind = 'agent' | 'instruction' | 'skill' | 'prompt' | 'command' | 'hook'

export interface ApmPrimitiveFileSummary {
    path: string
    kind: ApmPrimitiveFileKind
    label: string
    hash: string
    updatedAt?: number
    size: number
    readonlyReason?: string
}

export interface ApmPrimitiveFileListResponse {
    packageId: string
    sourceTreeHash: string
    files: ApmPrimitiveFileSummary[]
}

export interface ApmPrimitiveFileReadResponse extends ApmPrimitiveFileSummary {
    content: string
}

export interface ApmPackageLockRegenerateRequest {
    baseManifestHash?: string
}

export interface ApmPackageSourceSyncResponse extends ApmPackageReadResponse {
    ok: true
    synced: boolean
}

export type ApmGitHubImportFormat =
    | 'auto'
    | 'apm'
    | 'skill-md'
    | 'codex-toml'
    | 'claude-md'
    | 'claude-settings'
    | 'target-native'
    | 'instruction-md'
    | 'mcp-config'

export interface ApmGitHubImportRequest {
    source: string
    ref?: string
    format?: ApmGitHubImportFormat
    limit?: number
    candidateIds?: string[]
    scope?: ApmPackageScope
    registryListingId?: string
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
    scope: ApmPackageScope
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
    | 'anthropic-skills'
    | 'addy-agent-skills'
    | 'wshobson-agents'
    | 'vercel-agent-skills'
    | 'awesome-claude-code-subagents'
    | 'awesome-codex-subagents'
    | 'disler-hooks-mastery'
    | 'claude-spellbook'
    | 'copilot-assets'
    | 'superclaude-plugin'
    | 'cursor-prompts'
    | 'windsurf-antigravity-rules'

export type ApmGitHubSourceItemKind = 'agent' | 'skill' | 'mcp' | 'package'

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

export interface ApmGitHubSourceItem {
    id: string
    kind: ApmGitHubSourceItemKind
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
    primitives: ApmGitHubSourceItem[]
    warnings: string[]
}

export * from './apm-sync-contracts.js'
