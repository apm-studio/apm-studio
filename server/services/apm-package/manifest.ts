import crypto from 'crypto'
import type {
    ApmPackageLock,
    ApmPackageManifest,
    ApmValidationResult,
    EightPmAgentExtension,
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

function dependencyFromRef(ref: SharedAssetRef) {
    if (ref.kind === 'registry') {
        return ref.urn
    }
    return {
        path: `./.8pm-studio/drafts/${ref.draftId}`,
        source: '8pm-studio-draft',
    }
}

function manifestRef(ref: SharedAssetRef | null | undefined) {
    if (!ref) return null
    return ref.kind === 'registry'
        ? { source: 'registry', urn: ref.urn }
        : { source: 'local', draftId: ref.draftId }
}

function inlineInstructionFromManifest(manifest: ApmPackageManifest): string | null {
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

    const instruction = Array.isArray(manifest.instructions) ? manifest.instructions[0] : null
    if (typeof instruction === 'string' && instruction.trim()) {
        return instruction
    }
    if (isRecord(instruction) && typeof instruction.content === 'string' && instruction.content.trim()) {
        return instruction.content
    }

    return null
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
    extension: EightPmAgentExtension,
    manifest?: ApmPackageManifest,
): WorkspacePerformerSnapshot {
    return {
        id: extension.performerId,
        name: extension.performerName,
        model: extension.model,
        modelVariant: extension.modelVariant || null,
        inlineInstruction: extension.inlineInstruction || (manifest ? inlineInstructionFromManifest(manifest) : null),
        talRef: extension.talRef || null,
        danceRefs: extension.danceRefs || [],
        mcpServerNames: extension.mcpServerNames || [],
        agentId: extension.agentId || null,
        planMode: extension.planMode === true,
        meta: extension.derivedFrom ? { derivedFrom: extension.derivedFrom } : undefined,
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
    if (manifest.version !== undefined && typeof manifest.version !== 'string') {
        errors.push('Manifest version must be a string when provided.')
    }
    const extension = manifest['x-8pm']
    if (extension !== undefined) {
        if (!isRecord(extension)) {
            errors.push('x-8pm must be an object when provided.')
        } else {
            if (extension.schemaVersion !== 1) {
                errors.push('x-8pm.schemaVersion must be 1.')
            }
            if (typeof extension.packageId !== 'string' || !extension.packageId.trim()) {
                errors.push('x-8pm.packageId is required.')
            }
        }
    } else {
        warnings.push('x-8pm metadata is missing; Studio-only canvas state may be unavailable.')
    }

    return { valid: errors.length === 0, errors, warnings }
}

export function buildApmManifestForAgent(performer: WorkspacePerformerSnapshot): ApmPackageManifest {
    const packageId = performer.id
    const name = slugifyName(performer.name)
    const danceRefs = performer.danceRefs || []
    const talRef = performer.talRef || null
    const inlineInstruction = performer.inlineInstruction || null
    const mcpServerNames = performer.mcpServerNames || []
    const agentExtension: EightPmAgentExtension = {
        performerId: performer.id,
        performerName: performer.name,
        model: performer.model || null,
        modelVariant: performer.modelVariant || null,
        inlineInstruction,
        talRef,
        danceRefs,
        mcpServerNames,
        agentId: performer.agentId || null,
        planMode: performer.planMode === true,
        derivedFrom: performer.meta?.derivedFrom || null,
    }

    return {
        name,
        version: '0.1.0',
        description: `${performer.name} agent package for 8PM Studio.`,
        dependencies: {
            apm: danceRefs.map(dependencyFromRef),
            mcp: mcpServerNames.map((serverName) => ({ name: serverName })),
        },
        agents: [{
            id: performer.id,
            name: performer.name,
            model: performer.model || null,
            instruction: inlineInstruction
                ? { source: 'inline', content: inlineInstruction }
                : manifestRef(talRef),
            skills: danceRefs.map(manifestRef),
        }],
        instructions: inlineInstruction
            ? [{ source: 'inline', content: inlineInstruction }]
            : (talRef ? [manifestRef(talRef)] : []),
        skills: danceRefs.map(manifestRef),
        scripts: {},
        'x-8pm': {
            schemaVersion: 1,
            packageId,
            kind: 'agent',
            agent: agentExtension,
        },
    }
}

export function buildApmLockForManifest(manifest: ApmPackageManifest): ApmPackageLock {
    const extension = manifest['x-8pm']
    const packageId = extension?.packageId || manifest.name
    return {
        lockfile_version: '1',
        apm_version: APM_VERSION,
        dependencies: [],
        packages: [{
            package_id: packageId,
            name: manifest.name,
            version: manifest.version,
            source: '8pm-studio',
            manifest_hash: hashManifest(manifest),
        }],
    }
}
