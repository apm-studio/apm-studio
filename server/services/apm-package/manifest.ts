import crypto from 'crypto'
import type {
    ApmPackageLock,
    ApmPackageManifest,
    ApmValidationResult,
    ApmAgentExtension,
} from '../../../shared/apm-contracts.js'
import type { SharedAssetRef } from '../../../shared/chat-contracts.js'
import type { WorkspacePerformerSnapshot } from '../workspace-service.js'
import { APM_VERSION } from './paths.js'
import { isRecord } from './yaml-io.js'

function slugifyName(value: string) {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
    return slug || 'agent'
}

function sortForHash(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortForHash)
    }
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, sortForHash(value[key])]),
        )
    }
    return value
}

function hashManifest(manifest: ApmPackageManifest) {
    return `sha256:${crypto.createHash('sha256').update(JSON.stringify(sortForHash(manifest))).digest('hex')}`
}

function manifestRef(ref: SharedAssetRef | null | undefined) {
    if (!ref) return null
    return ref.kind === 'registry'
        ? { source: 'registry', urn: ref.urn }
        : { source: 'local', draftId: ref.draftId }
}

function authoringDescription(performer: WorkspacePerformerSnapshot) {
    const value = performer.meta?.authoring?.description
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function agentBodyFromManifest(manifest: ApmPackageManifest): string | null {
    const agent = Array.isArray(manifest.agents) ? manifest.agents[0] : null
    if (isRecord(agent)) {
        const instruction = agent.instruction
        if (typeof instruction === 'string' && instruction.trim()) {
            return instruction
        }
        if (isRecord(instruction) && typeof instruction.content === 'string' && instruction.content.trim()) {
            return instruction.content
        }
    }

    return null
}

function legacyInlineInstructionFromManifest(manifest: ApmPackageManifest): string | null {
    const agentBody = agentBodyFromManifest(manifest)
    if (agentBody) {
        return agentBody
    }

    const instruction = Array.isArray(manifest.instructions) ? manifest.instructions[0] : null
    if (typeof instruction === 'string' && instruction.trim()) {
        return instruction
    }
    if (isRecord(instruction) && typeof instruction.content === 'string' && instruction.content.trim()) {
        return instruction.content
    }

    return null
}

function extensionAgentNodeId(extension: ApmAgentExtension) {
    return extension.agentNodeId || extension.performerId || extension.agentName || extension.performerName || 'agent'
}

function extensionAgentName(extension: ApmAgentExtension) {
    return extension.agentName || extension.performerName || extensionAgentNodeId(extension)
}

function extensionAgentBody(extension: ApmAgentExtension, manifest?: ApmPackageManifest) {
    const body = extension.agentBody ?? extension.inlineInstruction
    if (typeof body === 'string' && body.trim()) {
        return body
    }
    return manifest ? legacyInlineInstructionFromManifest(manifest) : null
}

function extensionInstructionRef(extension: ApmAgentExtension) {
    return extension.instructionRef || extension.talRef || null
}

function extensionSkillRefs(extension: ApmAgentExtension) {
    return extension.skillRefs || extension.danceRefs || []
}

export function normalizePerformer(value: unknown): WorkspacePerformerSnapshot | null {
    if (!isRecord(value)) return null
    if (typeof value.id !== 'string' || !value.id) return null
    if (typeof value.name !== 'string' || !value.name) return null

    const model = isRecord(value.model)
        && typeof value.model.provider === 'string'
        && typeof value.model.modelId === 'string'
        ? { provider: value.model.provider, modelId: value.model.modelId }
        : null

    return {
        ...(value as WorkspacePerformerSnapshot),
        id: value.id,
        name: value.name,
        model,
        danceRefs: Array.isArray(value.danceRefs) ? value.danceRefs as SharedAssetRef[] : [],
        inlineInstruction: typeof value.inlineInstruction === 'string' ? value.inlineInstruction : null,
        mcpServerNames: Array.isArray(value.mcpServerNames)
            ? value.mcpServerNames.filter((entry): entry is string => typeof entry === 'string')
            : [],
    }
}

export function performerFromExtension(
    extension: ApmAgentExtension,
    manifest?: ApmPackageManifest,
): WorkspacePerformerSnapshot {
    const agentName = extensionAgentName(extension)
    const description = extension.description
        || (typeof manifest?.description === 'string' ? manifest.description : null)
        || null
    return {
        id: extensionAgentNodeId(extension),
        name: agentName,
        model: extension.model,
        modelVariant: extension.modelVariant || null,
        inlineInstruction: extensionAgentBody(extension, manifest),
        talRef: extensionInstructionRef(extension),
        danceRefs: extensionSkillRefs(extension),
        mcpServerNames: extension.mcpServerNames || [],
        agentId: extension.agentId || null,
        planMode: extension.planMode === true,
        meta: {
            ...(extension.derivedFrom ? { derivedFrom: extension.derivedFrom } : {}),
            ...(description ? { authoring: { description } } : {}),
        },
    }
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

export function buildApmManifestForAgent(performer: WorkspacePerformerSnapshot): ApmPackageManifest {
    const packageId = performer.id
    const name = slugifyName(performer.name)
    const danceRefs = performer.danceRefs || []
    const talRef = performer.talRef || null
    const agentBody = performer.inlineInstruction || null
    const mcpServerNames = performer.mcpServerNames || []
    const description = authoringDescription(performer)
    const agentExtension: ApmAgentExtension = {
        agentNodeId: performer.id,
        agentName: performer.name,
        description,
        model: performer.model || null,
        modelVariant: performer.modelVariant || null,
        agentBody,
        instructionRef: talRef,
        skillRefs: danceRefs,
        mcpServerNames,
        agentId: performer.agentId || null,
        planMode: performer.planMode === true,
        derivedFrom: performer.meta?.derivedFrom || null,
    }

    return {
        name,
        version: '0.1.0',
        type: 'hybrid',
        includes: 'auto',
        description: description || `${performer.name} agent package for APM Studio.`,
        dependencies: {
            apm: [],
            mcp: mcpServerNames.map((serverName) => ({ name: serverName })),
        },
        agents: [{
            id: performer.id,
            name: performer.name,
            ...(description ? { description } : {}),
            ...(agentBody ? {
                instruction: { source: 'inline', content: agentBody },
            } : {}),
        }],
        instructions: talRef ? [manifestRef(talRef)] : [],
        skills: danceRefs.map(manifestRef),
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
