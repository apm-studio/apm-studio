import { getOpencode } from '../../lib/opencode.js'
import { normalizeChatSessionMessages } from '../../../shared/chat-session-message.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { mergeOpenCodeConfig, readGlobalConfigFile } from '../../lib/global-config.js'
import { resolvePreferredTitleModelId } from '../../lib/model-catalog.js'
import { readProjectConfigFile } from '../../lib/project-config.js'
import { getTeamRuntimeService } from '../team-runtime/team-runtime-service.js'
import { resolveSessionOwnership, setSessionSidebarTitle } from './session-ownership-service.js'

type ModelSelection = {
    providerId: string
    modelId: string
}

type PromptTextPart = {
    type: 'text'
    text: string
}

type UnknownRecord = { [key: string]: unknown }

function isRecord(value: unknown): value is UnknownRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeThreadTitle(value: string | null | undefined): string {
    return value?.trim() || ''
}

function shouldReplaceGeneratedTitle(
    currentTitle: string | null | undefined,
    provisionalTitle: string | null | undefined,
    generatedTitle: string | null | undefined,
) {
    const current = normalizeThreadTitle(currentTitle)
    const provisional = normalizeThreadTitle(provisionalTitle)
    const generated = normalizeThreadTitle(generatedTitle)

    if (!generated) {
        return false
    }
    if (!current) {
        return true
    }
    if (current !== provisional) {
        return false
    }
    return current !== generated
}

function parseConfiguredModel(value: unknown): ModelSelection | null {
    if (typeof value !== 'string') {
        return null
    }

    const trimmed = value.trim()
    const slash = trimmed.indexOf('/')
    if (slash <= 0 || slash === trimmed.length - 1) {
        return null
    }

    return {
        providerId: trimmed.slice(0, slash),
        modelId: trimmed.slice(slash + 1),
    }
}

async function resolveConfiguredSmallModel(workingDir: string): Promise<ModelSelection | null> {
    const [globalConfig, projectConfig] = await Promise.all([
        readGlobalConfigFile(),
        readProjectConfigFile(workingDir),
    ])
    const merged = mergeOpenCodeConfig(globalConfig, projectConfig)
    return parseConfiguredModel(merged.small_model)
}

async function resolveTitleModel(workingDir: string, model: ModelSelection): Promise<ModelSelection> {
    const configured = await resolveConfiguredSmallModel(workingDir)
    if (configured) {
        return configured
    }

    const candidate = await resolvePreferredTitleModelId(workingDir, model.providerId).catch(() => null)
    if (candidate) {
        return {
            providerId: model.providerId,
            modelId: candidate,
        }
    }

    return model
}

function toOpenCodeModelSelection(model: ModelSelection) {
    return {
        providerID: model.providerId,
        modelID: model.modelId,
    }
}

function normalizePromptTextParts(parts: unknown): PromptTextPart[] {
    if (!Array.isArray(parts)) {
        return []
    }
    return parts
        .map((part) => {
            if (!isRecord(part) || part.type !== 'text' || typeof part.text !== 'string') {
                return null
            }
            return { type: 'text' as const, text: part.text }
        })
        .filter((part): part is PromptTextPart => !!part)
}

function extractPromptText(parts: unknown): string | null {
    const lines = normalizePromptTextParts(parts)
        .map((part) => part.text)
        .join('\n')
        .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

    return lines[0] || null
}

async function generateTitleFromMessage(
    workingDir: string,
    message: string,
    model: ModelSelection,
): Promise<string | null> {
    const text = message.trim()
    if (!text) {
        return null
    }

    const oc = await getOpencode()
    const selectedModel = await resolveTitleModel(workingDir, model)
    const tempSession = unwrapOpencodeResult<{ id: string }>(await oc.session.create({
        directory: workingDir,
    }))
    if (!tempSession?.id) {
        return null
    }

    try {
        const response = unwrapOpencodeResult<unknown>(await oc.session.prompt({
            sessionID: tempSession.id,
            directory: workingDir,
            agent: 'title',
            model: toOpenCodeModelSelection(selectedModel),
            parts: [{
                type: 'text',
                text: `Generate a title for this conversation:\n${text}`,
            }],
        }))
        const title = extractPromptText(isRecord(response) ? response.parts : undefined)
        return title ? title.slice(0, 100).trim() : null
    } finally {
        await oc.session.delete({
            sessionID: tempSession.id,
            directory: workingDir,
        }).catch(() => {})
    }
}

export async function sessionHasUserMessages(workingDir: string, sessionId: string): Promise<boolean> {
    const oc = await getOpencode()
    const messages = normalizeChatSessionMessages(unwrapOpencodeResult<unknown>(await oc.session.messages({
        sessionID: sessionId,
        directory: workingDir,
    })))
    return messages.some((entry) => entry?.role === 'user')
}

export async function setInitialStandaloneSessionTitle(input: {
    sessionId: string
    provisionalTitle: string
}) {
    const trimmed = normalizeThreadTitle(input.provisionalTitle)
    if (!trimmed) {
        return false
    }

    const ownership = await resolveSessionOwnership(input.sessionId)
    if (ownership?.ownerKind !== 'agent' || ownership.sidebarTitle?.trim()) {
        return false
    }

    const updated = await setSessionSidebarTitle(input.sessionId, trimmed, { ifUnset: true })
    return !!updated
}

export async function maybeGenerateStandaloneSessionTitle(input: {
    workingDir: string
    sessionId: string
    message: string
    model: ModelSelection
    provisionalTitle?: string | null
}) {
    const generated = await generateTitleFromMessage(input.workingDir, input.message, input.model)
    if (!generated) {
        return false
    }

    const ownership = await resolveSessionOwnership(input.sessionId)
    if (ownership?.ownerKind !== 'agent') {
        return false
    }

    if (!shouldReplaceGeneratedTitle(ownership.sidebarTitle, input.provisionalTitle, generated)) {
        return false
    }

    const updated = await setSessionSidebarTitle(input.sessionId, generated)
    return !!updated
}

export async function setInitialTeamThreadName(input: {
    workingDir: string
    teamId: string
    threadId: string
    provisionalTitle: string
}) {
    const trimmed = normalizeThreadTitle(input.provisionalTitle)
    if (!trimmed) {
        return false
    }

    const runtime = getTeamRuntimeService(input.workingDir)
    const existing = await runtime.getThread(input.threadId)
    if (!existing.ok || existing.thread?.name?.trim()) {
        return false
    }

    const result = await runtime.renameThread(input.teamId, input.threadId, trimmed, { ifUnset: true })
    return result.ok
}

export async function maybeGenerateTeamThreadName(input: {
    workingDir: string
    teamId: string
    threadId: string
    message: string
    model: ModelSelection
    provisionalTitle?: string | null
}) {
    const runtime = getTeamRuntimeService(input.workingDir)
    const existing = await runtime.getThread(input.threadId)
    if (!existing.ok) {
        return false
    }

    const generated = normalizeThreadTitle(
        await generateTitleFromMessage(input.workingDir, input.message, input.model),
    )
    if (!shouldReplaceGeneratedTitle(existing.thread?.name, input.provisionalTitle, generated)) {
        return false
    }

    const result = await runtime.renameThread(input.teamId, input.threadId, generated)
    return result.ok
}
