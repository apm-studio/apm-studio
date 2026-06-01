import type {
    ApmPackageLock,
    ApmPackageManifest,
    ApmValidationResult,
    ApmAgentExtension,
} from '../../../shared/apm-contracts.js'
import type { SharedPrimitiveRef } from '../../../shared/chat-contracts.js'
import type {
    WorkspaceAgentSnapshot,
} from '../../../shared/workspace-contracts.js'
import { APM_VERSION } from './paths.js'
import { isRecord } from './yaml-io.js'
import { hashManifest } from './manifest-hash.js'

function slugifyName(value: string) {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
    return slug || 'agent'
}

function manifestRef(ref: SharedPrimitiveRef | null | undefined) {
    if (!ref) return null
    return ref.kind === 'registry'
        ? { source: 'registry', urn: ref.urn }
        : { source: 'local', draftId: ref.draftId }
}

function authoringDescription(agent: WorkspaceAgentSnapshot) {
    const value = agent.meta?.authoring?.description
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function validateApmPackageManifest(manifest: unknown): ApmValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!isRecord(manifest)) {
        return { valid: false, errors: ['Manifest must be an object.'], warnings }
    }
    if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
        errors.push('Manifest name is required.')
    }
    if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
        errors.push('Manifest version is required.')
    }
    if (manifest.target !== undefined) {
        const target = manifest.target
        const validTarget = typeof target === 'string'
            || (Array.isArray(target) && target.every((entry) => typeof entry === 'string'))
        if (!validTarget) {
            errors.push('Manifest target must be a string or string array when provided.')
        }
    }
    if (manifest.includes !== undefined && manifest.includes !== 'auto') {
        const validIncludes = Array.isArray(manifest.includes)
            && manifest.includes.every((entry) => typeof entry === 'string')
        if (!validIncludes) {
            errors.push('Manifest includes must be "auto" or a string array when provided.')
        }
    }
    const extension = manifest['x-apm']
    if (extension !== undefined) {
        if (!isRecord(extension)) {
            errors.push('x-apm must be an object when provided.')
        } else {
            if (extension.schemaVersion !== 1) {
                errors.push('x-apm.schemaVersion must be 1.')
            }
            if (typeof extension.packageId !== 'string' || !extension.packageId.trim()) {
                errors.push('x-apm.packageId is required.')
            }
        }
    } else {
        warnings.push('x-apm metadata is missing; Studio-only canvas state may be unavailable.')
    }

    return { valid: errors.length === 0, errors, warnings }
}

export function buildApmManifestForAgent(agent: WorkspaceAgentSnapshot): ApmPackageManifest {
    const packageId = agent.id
    const name = slugifyName(agent.name)
    const skillRefs = agent.skillRefs || []
    const agentBody = agent.agentBody || null
    const mcpServerNames = agent.mcpServerNames || []
    const description = authoringDescription(agent)
    const agentExtension: ApmAgentExtension = {
        agentNodeId: agent.id,
        agentName: agent.name,
        description,
        model: agent.model || null,
        modelVariant: agent.modelVariant || null,
        agentBody,
        skillRefs: skillRefs,
        mcpServerNames,
        runtimeAgentId: agent.runtimeAgentId || null,
        planMode: agent.planMode === true,
        derivedFrom: agent.meta?.derivedFrom || null,
    }

    return {
        name,
        version: '0.1.0',
        type: 'hybrid',
        includes: 'auto',
        description: description || `${agent.name} agent package for APM Studio.`,
        dependencies: {
            apm: [],
            mcp: mcpServerNames.map((serverName) => ({ name: serverName })),
        },
        agents: [{
            id: agent.id,
            name: agent.name,
            ...(description ? { description } : {}),
            ...(agentBody ? {
                instruction: { source: 'inline', content: agentBody },
            } : {}),
        }],
        skills: skillRefs.map(manifestRef),
        scripts: {},
        'x-apm': {
            schemaVersion: 1,
            packageId,
            kind: 'agent',
            agent: agentExtension,
        },
    }
}

export function buildApmLockForManifest(manifest: ApmPackageManifest): ApmPackageLock {
    const extension = manifest['x-apm']
    const packageId = extension?.packageId || manifest.name
    return {
        lockfile_version: '1',
        apm_version: APM_VERSION,
        dependencies: [],
        mcp_servers: Array.isArray(manifest.dependencies?.mcp)
            ? manifest.dependencies.mcp
                .map((entry) => typeof entry === 'string' ? entry : entry.name)
                .filter((entry): entry is string => typeof entry === 'string' && !!entry)
            : [],
        packages: [{
            package_id: packageId,
            name: manifest.name,
            version: manifest.version,
            source: 'apm-studio',
            manifest_hash: hashManifest(manifest),
        }],
    }
}
