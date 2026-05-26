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

export interface EightPmAgentExtension {
    performerId: string
    performerName: string
    model: ModelSelection
    modelVariant?: string | null
    inlineInstruction?: string | null
    talRef?: SharedAssetRef | null
    danceRefs: SharedAssetRef[]
    mcpServerNames: string[]
    agentId?: string | null
    planMode?: boolean
    derivedFrom?: string | null
}

export interface EightPmManifestExtension {
    schemaVersion: 1
    packageId: string
    kind: 'agent' | 'team' | 'workspace'
    agent?: EightPmAgentExtension
    canvas?: Record<string, unknown>
    workflow?: Record<string, unknown>
}

export interface ApmPackageManifest extends Record<string, unknown> {
    name: string
    version?: string
    description?: string
    author?: string
    license?: string
    dependencies?: {
        apm?: ApmDependency[]
        mcp?: ApmDependency[]
        [key: string]: unknown
    }
    agents?: unknown[]
    instructions?: unknown[]
    skills?: unknown[]
    scripts?: Record<string, unknown>
    'x-8pm'?: EightPmManifestExtension
}

export interface ApmPackageLock extends Record<string, unknown> {
    lockfile_version: '1'
    apm_version?: string
    dependencies?: unknown[]
    packages?: Array<{
        package_id: string
        name: string
        version?: string
        source: '8pm-studio'
        manifest_hash: string
    }>
}

export interface ApmPackageSummary {
    packageId: string
    name: string
    version?: string
    description?: string
    kind: EightPmManifestExtension['kind'] | 'unknown'
    agentName?: string
    derivedFrom?: string | null
    manifestPath?: string
    lockPath?: string
    source: 'apm'
    updatedAt?: number
}

export interface ApmValidationResult {
    valid: boolean
    errors: string[]
    warnings: string[]
}

export interface ApmPackageListResponse {
    packages: ApmPackageSummary[]
}

export interface ApmPackageReadResponse {
    packageId: string
    manifest: ApmPackageManifest
    lock?: ApmPackageLock
    manifestYaml: string
    lockYaml?: string
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

export interface ApmPackageExportResponse {
    packageId: string
    manifestYaml: string
    lockYaml: string
    manifestPath: string
    lockPath: string
}
