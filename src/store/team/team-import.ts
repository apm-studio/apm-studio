import { nanoid } from 'nanoid'
import type { PrimitiveCard } from '../../lib/primitive-types'
import { primitiveUrnDisplayName } from '../../lib/primitive-urn'
import type { WorkspaceTeamParticipantBinding } from '../../../shared/workspace-contracts'
import type {
    TeamParticipantV1,
    TeamRelation,
    TeamRelationV1,
} from '../../../shared/team-types'
import type { StudioState } from '../types'
import {
    buildHiddenRegistryAgentPlaceholder,
    createTeamParticipantKey,
    normalizeSubscriptions,
    resolveBindingDisplayName,
} from './participant-bindings'

type SetState = (partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void
type GetState = () => StudioState

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function parseOptionalStringArray(input: unknown, fieldName: string) {
    if (input === undefined) return undefined
    if (!Array.isArray(input)) {
        throw new Error(`${fieldName} must be an array of strings when provided`)
    }
    return Array.from(new Set(input.map((entry, index) => {
        if (!nonEmptyString(entry)) {
            throw new Error(`${fieldName}[${index}] must be a non-empty string`)
        }
        return entry
    })))
}

function parseParticipantSubscriptions(input: unknown, fieldName: string) {
    if (!isRecord(input)) {
        throw new Error(`${fieldName} must be an object when provided`)
    }
    const messagesFrom = parseOptionalStringArray(input.messagesFrom, `${fieldName}.messagesFrom`)
    const messageTags = parseOptionalStringArray(input.messageTags, `${fieldName}.messageTags`)
    const callboardKeys = parseOptionalStringArray(input.callboardKeys, `${fieldName}.callboardKeys`)
    const eventTypes = parseOptionalStringArray(input.eventTypes, `${fieldName}.eventTypes`)
    if (eventTypes && eventTypes.some((entry) => entry !== 'runtime.idle')) {
        throw new Error(`${fieldName}.eventTypes only supports 'runtime.idle'`)
    }
    return {
        ...(messagesFrom ? { messagesFrom } : {}),
        ...(messageTags ? { messageTags } : {}),
        ...(callboardKeys ? { callboardKeys } : {}),
        ...(eventTypes ? { eventTypes: eventTypes as Array<'runtime.idle'> } : {}),
    }
}

function parseTeamParticipant(input: unknown, index: number): TeamParticipantV1 {
    if (!isRecord(input)) {
        throw new Error(`participants[${index}] must be an object`)
    }
    if (!nonEmptyString(input.key)) {
        throw new Error(`participants[${index}].key must be a non-empty string`)
    }
    if (!nonEmptyString(input.agent)) {
        throw new Error(`participants[${index}].agent must be a non-empty string`)
    }
    return {
        key: input.key,
        agent: input.agent,
        ...(input.subscriptions !== undefined
            ? { subscriptions: parseParticipantSubscriptions(input.subscriptions, `participants[${index}].subscriptions`) }
            : {}),
    }
}

function parseTeamRelation(input: unknown, index: number): TeamRelationV1 {
    if (!isRecord(input)) {
        throw new Error(`relations[${index}] must be an object`)
    }
    if (!Array.isArray(input.between) || input.between.length !== 2) {
        throw new Error(`relations[${index}].between must be a 2-item string tuple`)
    }
    const between = input.between.map((entry, betweenIndex) => {
        if (!nonEmptyString(entry)) {
            throw new Error(`relations[${index}].between[${betweenIndex}] must be a non-empty string`)
        }
        return entry
    }) as [string, string]
    if (input.direction !== 'both' && input.direction !== 'one-way') {
        throw new Error(`relations[${index}].direction must be 'both' or 'one-way'`)
    }
    if (!nonEmptyString(input.name)) {
        throw new Error(`relations[${index}].name must be a non-empty string`)
    }
    if (!nonEmptyString(input.description)) {
        throw new Error(`relations[${index}].description must be a non-empty string`)
    }
    return {
        between,
        direction: input.direction,
        name: input.name,
        description: input.description,
    }
}

function parseTeamCardPayload(primitive: PrimitiveCard) {
    if (!Array.isArray(primitive.participants)) {
        throw new Error('participants must be an array')
    }
    if (!Array.isArray(primitive.relations)) {
        throw new Error('relations must be an array')
    }
    const participants = primitive.participants.map(parseTeamParticipant)
    if (participants.length === 0) {
        throw new Error('participants must contain at least one participant')
    }
    const participantKeys = new Set<string>()
    for (const participant of participants) {
        if (participantKeys.has(participant.key)) {
            throw new Error(`participants contains duplicate key '${participant.key}'`)
        }
        participantKeys.add(participant.key)
    }
    const relations = primitive.relations.map(parseTeamRelation)
    for (const relation of relations) {
        if (!participantKeys.has(relation.between[0])) {
            throw new Error(`relation references unknown participant '${relation.between[0]}'`)
        }
        if (!participantKeys.has(relation.between[1])) {
            throw new Error(`relation references unknown participant '${relation.between[1]}'`)
        }
    }
    if (participants.length > 1 && relations.length === 0) {
        throw new Error('relations must contain at least one relation when multiple participants exist')
    }
    return { participants, relations }
}

async function buildMaterializedRegistryAgents(
    get: GetState,
    participants: Record<string, WorkspaceTeamParticipantBinding>,
    center: { x: number; y: number } | null,
) {
    const existingAgents = get().agents
    const seeds: Array<{
        key: string
        urn: string
        binding: WorkspaceTeamParticipantBinding
    }> = []

    for (const [key, binding] of Object.entries(participants)) {
        if (binding.agentRef.kind !== 'registry') continue

        const urn = binding.agentRef.urn
        const alreadyExists = existingAgents.some((p) => p.meta?.derivedFrom === urn)
        if (alreadyExists) continue

        if (seeds.some((seed) => seed.urn === urn)) continue
        seeds.push({ key, urn, binding })
    }

    if (seeds.length === 0) {
        return []
    }

    return seeds.map((seed, index) => {
        const x = (center?.x ?? 400) + index * 340
        const y = (center?.y ?? 300) + 350

        return buildHiddenRegistryAgentPlaceholder({
            id: nanoid(12),
            name: resolveBindingDisplayName(seed.binding, seed.key),
            position: { x, y },
            urn: seed.urn,
            description: `Placeholder for Team participant "${seed.key}" (${primitiveUrnDisplayName(seed.urn)}). Import or attach an APM package agent to make this participant runnable.`,
        })
    })
}

export async function importTeamFromPrimitiveImpl(
    get: GetState,
    set: SetState,
    primitive: PrimitiveCard,
    dimensions: { width: number; height: number },
) {
    const id = nanoid(12)
    const center = get().canvasCenter

    const raw = primitive as unknown as Record<string, unknown>
    const validated = parseTeamCardPayload(primitive)

    const participants: Record<string, WorkspaceTeamParticipantBinding> = {}
    const idMapping: Record<string, string> = {}
    const nodes = validated.participants

    for (const node of nodes) {
        const baseKey = node.key
        const newKey = createTeamParticipantKey()
        idMapping[baseKey] = newKey
    }

    for (const node of nodes) {
        const baseKey = node.key
        const newKey = idMapping[baseKey] || createTeamParticipantKey()

        participants[newKey] = {
            agentRef: { kind: 'registry', urn: node.agent },
            displayName: baseKey,
            subscriptions: normalizeSubscriptions({
                ...node.subscriptions,
                ...(node.subscriptions?.messagesFrom
                    ? {
                        messagesFrom: node.subscriptions.messagesFrom.map((entry) => idMapping[entry] || entry),
                    }
                    : {}),
            }),
            position: { x: Object.keys(participants).length * 300, y: 100 },
        }
    }

    const rawRelations = validated.relations
    const relations: TeamRelation[] = rawRelations.map((relation) => ({
        id: nanoid(8),
        between: [
            idMapping[relation.between[0]] || relation.between[0],
            idMapping[relation.between[1]] || relation.between[1],
        ] as [string, string],
        direction: relation.direction,
        name: relation.name,
        description: relation.description,
    }))

    const nextTeam = {
        id,
        name: primitive.name || `Team ${get().teams.length + 1}`,
        description: primitive.description,
        teamRules: Array.isArray(raw.teamRules)
            ? raw.teamRules.filter((entry): entry is string => typeof entry === 'string')
            : undefined,
        participants,
        relations,
        position: { x: (center?.x ?? 400) - dimensions.width / 2, y: center?.y ?? 300 },
        width: dimensions.width,
        height: dimensions.height,
        createdAt: Date.now(),
        meta: {
            derivedFrom: primitive.urn || null,
            authoring: {
                description: primitive.description || '',
            },
        },
    }

    const materializedAgents = await buildMaterializedRegistryAgents(get, participants, center)

    set((state: StudioState) => ({
        teams: [...state.teams, nextTeam],
        agents: [...state.agents, ...materializedAgents],
        selectedTeamId: id,
        teamEditorState: null,
        workspaceDirty: true,
    }))
    get().recordStudioChange({
        kind: 'team',
        teamIds: [id],
        agentIds: materializedAgents.map((agent) => agent.id),
    })
}
