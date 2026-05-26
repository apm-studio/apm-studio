
import { createHash } from 'crypto'
import path from 'path'
import { getAssetPayload } from '../../lib/roster-source.js'
import { resolveRuntimeModel } from '../../lib/model-catalog.js'
import { findRuntimeModelVariant, type RuntimeModelVariant } from '../../../shared/model-variants.js'
import { toRelativePath, resolveAgentIdentity } from './projection-manifest.js'
import type { Posture } from './projection-manifest.js'
export type { Posture } from './projection-manifest.js'
import type { CompiledSkill } from './dance-compiler.js'
import type { ModelSelection } from '../../../shared/model-types.js'
import { readDraftTextContent } from '../draft-service.js'
import { COLLABORATION_TOOL_NAMES, STALE_COLLABORATION_TOOL_NAMES } from '../act-runtime/act-tools.js'
import { ASSISTANT_TOOL_NAMES } from '../studio-assistant/assistant-tools.js'
import type { McpCatalog, McpEntryConfig } from '../../../shared/mcp-catalog.js'
import type { AssetRef } from './performer-projection-types.js'



export interface PerformerCompileInput {
    performerId: string
    performerName: string
    talRef: AssetRef | null
    model: ModelSelection
    modelVariant?: string | null
    workspaceHash: string
    executionDir: string
    scope?: 'stage' | 'act'
    actId?: string
    skillNames: string[]
    toolMap: Record<string, boolean>
    codexMcpServers?: McpCatalog
    includeCodexAgent?: boolean
    taskAllowlist?: string[]
    relationPromptSection?: string | null
}

type AgentFile = {
    agentName: string
    filePath: string
    relativePath: string
    content: string
}

const CODEX_PROJECT_AGENT_MODEL_IDS = new Set([
    // Keep this conservative and in sync with the local Codex model catalog.
    // `codex debug models` lists the project-agent model slugs Codex accepts.
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.3-codex',
    'gpt-5.3-codex-spark',
    'gpt-5.2',
])

const CODEX_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh'])
const CODEX_DEFAULT_REASONING_EFFORT_BY_MODEL_ID: Record<string, string> = {
    'gpt-5.5': 'medium',
    'gpt-5.4': 'medium',
    'gpt-5.4-mini': 'medium',
    'gpt-5.3-codex': 'medium',
    'gpt-5.3-codex-spark': 'high',
    'gpt-5.2': 'medium',
}

export interface CompiledPerformer {
    performerId: string
    agentNames: Partial<Record<Posture, string>>
    agentPaths: Partial<Record<Posture, string>>
    agentContents: Partial<Record<Posture, string>>
    codexAgentName?: string
    codexAgentPath?: string
    codexAgentContent?: string
    codexAgentRelativePath?: string
    skills: CompiledSkill[]
    projectionHash: string
    allFiles: string[]
}




async function resolveTalContent(
    cwd: string,
    ref: AssetRef | null,
): Promise<string | null> {
    if (!ref) {
        return null
    }

    if (ref.kind === 'registry') {
        return getAssetPayload(cwd, ref.urn)
    }

    return readDraftTextContent(cwd, 'tal', ref.draftId)
}

function buildBody(input: {
    talContent: string | null
    relationPromptSection?: string | null
}) {
    return [
        input.talContent,
        input.relationPromptSection || null,
    ].filter(Boolean).join('\n\n')
}


function buildSkillPermissionLines(skillNames: string[]) {
    const lines = ['permission:', '  skill:', '    "*": "deny"']
    for (const skillName of skillNames) {
        lines.push(`    ${JSON.stringify(skillName)}: "allow"`)
    }
    return lines
}

function buildTaskPermissionLines(taskAllowlist: string[]) {
    if (taskAllowlist.length === 0) {
        return []
    }
    const lines = ['  task:', '    "*": "deny"']
    for (const agentName of taskAllowlist) {
        lines.push(`    ${JSON.stringify(agentName)}: "allow"`)
    }
    return lines
}

function buildToolsLines(
    toolMap: Record<string, boolean>,
    posture: Posture,
    scope: 'workspace' | 'act',
) {
    const effectiveToolMap = { ...toolMap }
    for (const toolName of ASSISTANT_TOOL_NAMES) {
        effectiveToolMap[toolName] = false
    }
    if (scope !== 'act') {
        for (const toolName of [...COLLABORATION_TOOL_NAMES, ...STALE_COLLABORATION_TOOL_NAMES]) {
            effectiveToolMap[toolName] = false
        }
    }

    const pairs = Object.entries(effectiveToolMap).sort(([left], [right]) => left.localeCompare(right))
    if (posture === 'plan') {
        pairs.push(['bash', false], ['edit', false], ['write', false])
    }
    if (pairs.length === 0) {
        return []
    }

    const lines = ['tools:']
    for (const [tool, enabled] of pairs) {
        lines.push(`  ${JSON.stringify(tool)}: ${enabled ? 'true' : 'false'}`)
    }
    return lines
}

function buildFrontmatter(input: {
    performerName: string
    model: ModelSelection
    posture: Posture
    scope: 'workspace' | 'act'
    variantId?: string | null
    skillNames: string[]
    toolMap: Record<string, boolean>
    taskAllowlist?: string[]
}) {
    const lines = ['---']
    lines.push(`description: ${JSON.stringify(`Agent: ${input.performerName}`)}`)
    lines.push('mode: primary')
    if (input.model) {
        const modelStr = input.model.modelId.startsWith(`${input.model.provider}/`)
            ? input.model.modelId
            : `${input.model.provider}/${input.model.modelId}`
        lines.push(`model: ${JSON.stringify(modelStr)}`)
    }
    if (input.variantId) {
        lines.push(`variant: ${JSON.stringify(input.variantId)}`)
    }
    lines.push(...buildSkillPermissionLines(input.skillNames))
    lines.push(...buildTaskPermissionLines(input.taskAllowlist || []))
    lines.push(...buildToolsLines(input.toolMap, input.posture, input.scope))
    lines.push('---')
    return lines.join('\n')
}

function buildAgentFile(input: {
    workspaceHash: string
    performerId: string
    performerName: string
    executionDir: string
    scope: 'workspace' | 'act'
    actId?: string
    model: ModelSelection
    posture: Posture
    variantId?: string | null
    skillNames: string[]
    toolMap: Record<string, boolean>
    taskAllowlist?: string[]
    body: string
}): AgentFile {
    const identity = resolveAgentIdentity({
        executionDir: input.executionDir,
        workspaceHash: input.workspaceHash,
        performerId: input.performerId,
        posture: input.posture,
        scope: input.scope,
        actId: input.actId,
    })
    const frontmatter = buildFrontmatter({
        performerName: input.performerName,
        model: input.model,
        posture: input.posture,
        scope: input.scope,
        variantId: input.variantId,
        skillNames: input.skillNames,
        toolMap: input.toolMap,
        taskAllowlist: input.taskAllowlist,
    })
    const content = `${frontmatter}\n\n${input.body}`
    return {
        agentName: identity.agentName,
        filePath: identity.filePath,
        relativePath: toRelativePath(input.executionDir, identity.filePath),
        content,
    }
}

function sanitizeCodexAgentSegment(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '')
}

function buildCodexAgentName(performerName: string, performerId: string) {
    const suffix = createHash('sha1').update(performerId).digest('hex').slice(0, 8)
    const baseCandidate = sanitizeCodexAgentSegment(performerName)
        || sanitizeCodexAgentSegment(performerId)
        || 'performer'
    const maxBaseLength = Math.max(1, 64 - suffix.length - 1)
    const base = baseCandidate.slice(0, maxBaseLength).replace(/_+$/g, '') || 'performer'
    return `${base}_${suffix}`
}

function tomlString(value: string) {
    return JSON.stringify(value)
}

function tomlKey(value: string) {
    return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value)
}

function tomlStringArray(values: string[]) {
    return `[${values.map(tomlString).join(', ')}]`
}

function tomlInlineStringMap(record: Record<string, string>) {
    const entries = Object.entries(record)
        .filter(([key]) => key.trim())
        .sort(([left], [right]) => left.localeCompare(right))

    return `{ ${entries.map(([key, value]) => `${tomlString(key.trim())} = ${tomlString(value)}`).join(', ')} }`
}

function tomlMultilineString(value: string) {
    return `"""\n${value.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}\n"""`
}

function codexEnvVarReference(value: string) {
    const trimmed = value.trim()
    const braced = trimmed.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/)
    if (braced) {
        return braced[1]
    }

    const plain = trimmed.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/)
    return plain ? plain[1] : null
}

function codexBearerTokenEnvVar(value: string) {
    const trimmed = value.trim()
    const match = trimmed.match(/^Bearer\s+(.+)$/i)
    return match ? codexEnvVarReference(match[1]) : null
}

function splitCodexHttpHeaders(headers: Record<string, string> | undefined) {
    const httpHeaders: Record<string, string> = {}
    const envHttpHeaders: Record<string, string> = {}
    let bearerTokenEnvVar: string | null = null

    for (const [key, value] of Object.entries(headers || {})) {
        const headerName = key.trim()
        if (!headerName) {
            continue
        }

        if (headerName.toLowerCase() === 'authorization') {
            const envVar = codexBearerTokenEnvVar(value)
            if (envVar) {
                bearerTokenEnvVar = envVar
                continue
            }
        }

        const envVar = codexEnvVarReference(value)
        if (envVar) {
            envHttpHeaders[headerName] = envVar
            continue
        }

        httpHeaders[headerName] = value
    }

    return {
        bearerTokenEnvVar,
        envHttpHeaders,
        httpHeaders,
    }
}

function splitCodexLocalEnvironment(environment: Record<string, string> | undefined) {
    const env: Record<string, string> = {}
    const envVars: string[] = []

    for (const [key, value] of Object.entries(environment || {})) {
        const envName = key.trim()
        if (!envName) {
            continue
        }

        const referencedEnvVar = codexEnvVarReference(value)
        if (referencedEnvVar && referencedEnvVar === envName) {
            envVars.push(envName)
            continue
        }

        env[envName] = value
    }

    return {
        env,
        envVars: Array.from(new Set(envVars)).sort((left, right) => left.localeCompare(right)),
    }
}

function codexTimeoutSeconds(timeout: number | undefined) {
    if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
        return null
    }

    return Math.max(1, Math.ceil(timeout / 1000))
}

function buildCodexMcpServerLines(mcpServers: McpCatalog | undefined) {
    if (!mcpServers || Object.keys(mcpServers).length === 0) {
        return []
    }

    const lines: string[] = []
    for (const [serverName, config] of Object.entries(mcpServers).sort(([left], [right]) => left.localeCompare(right))) {
        lines.push(...buildCodexMcpServerEntryLines(serverName, config))
    }
    return lines
}

function buildCodexMcpServerEntryLines(serverName: string, config: McpEntryConfig) {
    const serverKey = tomlKey(serverName)
    const lines: string[] = []
    const timeoutSec = codexTimeoutSeconds(config.timeout)

    if (config.type === 'remote') {
        if (!config.url.trim()) {
            return []
        }
        const headers = splitCodexHttpHeaders(config.headers)
        lines.push('', `[mcp_servers.${serverKey}]`)
        lines.push(`url = ${tomlString(config.url)}`)
        if (headers.bearerTokenEnvVar) {
            lines.push(`bearer_token_env_var = ${tomlString(headers.bearerTokenEnvVar)}`)
        }
        if (config.enabled === false) {
            lines.push('enabled = false')
        }
        if (timeoutSec !== null) {
            lines.push(`startup_timeout_sec = ${timeoutSec}`)
            lines.push(`tool_timeout_sec = ${timeoutSec}`)
        }
        if (Object.keys(headers.httpHeaders).length > 0) {
            lines.push(`http_headers = ${tomlInlineStringMap(headers.httpHeaders)}`)
        }
        if (Object.keys(headers.envHttpHeaders).length > 0) {
            lines.push(`env_http_headers = ${tomlInlineStringMap(headers.envHttpHeaders)}`)
        }
        return lines
    }

    const [command, ...args] = config.command.filter(Boolean)
    if (!command) {
        return []
    }

    lines.push('', `[mcp_servers.${serverKey}]`)
    lines.push(`command = ${tomlString(command)}`)
    if (args.length > 0) {
        lines.push(`args = ${tomlStringArray(args)}`)
    }
    const environment = splitCodexLocalEnvironment(config.environment)
    if (environment.envVars.length > 0) {
        lines.push(`env_vars = ${tomlStringArray(environment.envVars)}`)
    }
    if (config.enabled === false) {
        lines.push('enabled = false')
    }
    if (timeoutSec !== null) {
        lines.push(`startup_timeout_sec = ${timeoutSec}`)
        lines.push(`tool_timeout_sec = ${timeoutSec}`)
    }

    const envEntries = Object.entries(environment.env)
        .filter(([key]) => key.trim())
        .sort(([left], [right]) => left.localeCompare(right))
    if (envEntries.length > 0) {
        lines.push('', `[mcp_servers.${serverKey}.env]`)
        for (const [key, value] of envEntries) {
            lines.push(`${tomlKey(key.trim())} = ${tomlString(value)}`)
        }
    }

    return lines
}

function normalizeCodexReasoningEffort(value: unknown) {
    if (typeof value !== 'string') {
        return null
    }

    const normalized = value.trim().toLowerCase()
    return CODEX_REASONING_EFFORTS.has(normalized) ? normalized : null
}

function resolveCodexReasoningEffort(codexModelId: string, variant: RuntimeModelVariant | null) {
    const options = variant?.options || {}
    const direct = normalizeCodexReasoningEffort(options.model_reasoning_effort)
        || normalizeCodexReasoningEffort(options.reasoning_effort)
    if (direct) {
        return direct
    }

    const reasoning = options.reasoning
    if (reasoning && typeof reasoning === 'object' && !Array.isArray(reasoning)) {
        return normalizeCodexReasoningEffort((reasoning as Record<string, unknown>).effort)
    }

    return CODEX_DEFAULT_REASONING_EFFORT_BY_MODEL_ID[codexModelId] || null
}

export function resolveCodexProjectAgentModelId(selection: ModelSelection) {
    if (!selection || selection.provider !== 'openai') {
        return null
    }

    const modelId = selection.modelId.trim()
    const unprefixedModelId = modelId.startsWith('openai/')
        ? modelId.slice('openai/'.length)
        : modelId

    return CODEX_PROJECT_AGENT_MODEL_IDS.has(unprefixedModelId)
        ? unprefixedModelId
        : null
}

function buildCodexDeveloperInstructions(talContent: string | null) {
    return talContent || ''
}

function buildCodexSkillConfigLines(skills: CompiledSkill[]) {
    const skillPaths = Array.from(new Set(
        skills
            .map((skill) => skill.codexFilePath)
            .filter((skillPath): skillPath is string => typeof skillPath === 'string' && skillPath.length > 0),
    )).sort((left, right) => left.localeCompare(right))

    if (skillPaths.length === 0) {
        return []
    }

    return skillPaths.flatMap((skillPath) => [
        '',
        '[[skills.config]]',
        `path = ${tomlString(skillPath)}`,
        'enabled = true',
    ])
}

function buildCodexAgentFile(input: {
    performerId: string
    performerName: string
    executionDir: string
    codexModelId: string
    codexReasoningEffort?: string | null
    talContent: string | null
    skills: CompiledSkill[]
    mcpServers?: McpCatalog
}): AgentFile {
    const agentName = buildCodexAgentName(input.performerName, input.performerId)
    const fileName = `agent_roster_${agentName}.toml`
    const filePath = path.join(input.executionDir, '.codex', 'agents', fileName)
    const instructions = buildCodexDeveloperInstructions(input.talContent)
    const content = [
        `name = ${tomlString(agentName)}`,
        `description = ${tomlString(`Custom agent for ${input.performerName}.`)}`,
        `model = ${tomlString(input.codexModelId)}`,
        ...(input.codexReasoningEffort
            ? [`model_reasoning_effort = ${tomlString(input.codexReasoningEffort)}`]
            : []),
        'sandbox_mode = "workspace-write"',
        `developer_instructions = ${tomlMultilineString(instructions)}`,
        ...buildCodexSkillConfigLines(input.skills),
        ...buildCodexMcpServerLines(input.mcpServers),
        '',
    ].join('\n')

    return {
        agentName,
        filePath,
        relativePath: toRelativePath(input.executionDir, filePath),
        content,
    }
}

export async function compilePerformer(
    cwd: string,
    input: PerformerCompileInput,
    skills: CompiledSkill[],
): Promise<CompiledPerformer> {
    const talContent = await resolveTalContent(cwd, input.talRef)

    let resolvedVariantId: string | null = null
    let resolvedVariant: RuntimeModelVariant | null = null
    if (input.model) {
        const runtimeModel = await resolveRuntimeModel(cwd, input.model)
        if (runtimeModel) {
            resolvedVariant = findRuntimeModelVariant(
                [runtimeModel],
                input.model.provider,
                input.model.modelId,
                input.modelVariant || null,
            )
            resolvedVariantId = resolvedVariant?.id || null
        } else {
            resolvedVariantId = input.modelVariant || null
        }
    }

    const body = buildBody({
        talContent,
        relationPromptSection: input.relationPromptSection || null,
    })
    const projectionScope = input.scope === 'stage' ? 'workspace' : (input.scope || 'workspace')
    const codexModelId = resolveCodexProjectAgentModelId(input.model)
    const codexAgent = input.includeCodexAgent !== false && projectionScope === 'workspace' && codexModelId
        ? buildCodexAgentFile({
            performerId: input.performerId,
            performerName: input.performerName,
            executionDir: input.executionDir,
            codexModelId,
            codexReasoningEffort: resolveCodexReasoningEffort(codexModelId, resolvedVariant),
            talContent,
            skills,
            mcpServers: input.codexMcpServers,
        })
        : null

    const buildFile = buildAgentFile({
        workspaceHash: input.workspaceHash,
        performerId: input.performerId,
        performerName: input.performerName,
        executionDir: input.executionDir,
        scope: projectionScope,
        actId: input.actId,
        model: input.model,
        posture: 'build',
        variantId: resolvedVariantId,
        skillNames: input.skillNames,
        toolMap: input.toolMap,
        taskAllowlist: input.taskAllowlist,
        body,
    })

    // Act scope: build-only (no plan agent — complex multi-performer Acts
    // make plan mode impractical to control across the whole graph).
    const includePlan = projectionScope !== 'act'
    const planFile = includePlan
        ? buildAgentFile({
            workspaceHash: input.workspaceHash,
            performerId: input.performerId,
            performerName: input.performerName,
            executionDir: input.executionDir,
            scope: projectionScope,
            actId: input.actId,
            model: input.model,
            posture: 'plan',
            variantId: resolvedVariantId,
            skillNames: input.skillNames,
            toolMap: input.toolMap,
            taskAllowlist: input.taskAllowlist,
            body,
        })
        : null

    const hashInput = [
        buildFile.content,
        planFile?.content,
        codexAgent?.content,
        ...skills.map((skill) => skill.content),
    ].filter(Boolean).join('\n\n')
    const projectionHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16)

    const allFiles = [
        buildFile.relativePath,
        ...(planFile ? [planFile.relativePath] : []),
        ...(codexAgent ? [codexAgent.relativePath] : []),
        ...skills.flatMap((skill) => [skill.relativePath, ...skill.additionalFiles]),
    ]

    return {
        performerId: input.performerId,
        agentNames: {
            build: buildFile.agentName,
            ...(planFile ? { plan: planFile.agentName } : {}),
        },
        agentPaths: {
            build: buildFile.filePath,
            ...(planFile ? { plan: planFile.filePath } : {}),
        },
        agentContents: {
            build: buildFile.content,
            ...(planFile ? { plan: planFile.content } : {}),
        },
        ...(codexAgent ? {
            codexAgentName: codexAgent.agentName,
            codexAgentPath: codexAgent.filePath,
            codexAgentContent: codexAgent.content,
            codexAgentRelativePath: codexAgent.relativePath,
        } : {}),
        skills,
        projectionHash,
        allFiles,
    }
}
