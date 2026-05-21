/**
 * assistant-service.ts — Agent + skill projection for Studio Assistant.
 *
 * Produces:
 *   ~/.dot-studio/opencode/{agents,skills,tools}/dot-studio/...
 *
 * Builtin assistant dances are authored as Agent Skills under:
 *   server/services/studio-assistant/dances/<skill-name>/SKILL.md
 *
 * Assistant tool files are projected alongside the agent so the runtime has a
 * stable mutation tool without relying on text-block parsing.
 *
 * Called eagerly at stage save / project activate — NOT per-send.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseDanceFromSkillMd } from 'dance-of-tal/contracts'
import type { AssistantStageContext } from '../../../shared/assistant-actions.js'
import { STUDIO_DIR } from '../../lib/config.js'
import { getOpencode } from '../../lib/opencode.js'
import { listStudioAssets } from '../asset-service.js'
import { searchDotRegistry, searchSkillsCatalog } from '../dot-service.js'
import { syncSkillBundleSiblings } from '../opencode-projection/skill-bundle-sync.js'
import { ASSISTANT_TOOL_NAMES, getStaticAssistantTools } from './assistant-tools.js'

export const ASSISTANT_PERFORMER_ID = 'studio-assistant'
const AGENT_FILENAME = 'studio-assistant.md'

// ── Source paths ───────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TAL_PATH = path.join(__dirname, 'tal', 'studio-assistant.md')
const DANCES_DIR = path.join(__dirname, 'dances')

// ── Target paths ──────────────────────────────────────
function assistantProjectionRoot(executionDir: string) {
    void executionDir
    return path.join(STUDIO_DIR, 'opencode')
}

function workspaceAssistantProjectionRoot(executionDir: string) {
    return path.join(executionDir, '.opencode')
}

function agentFilePath(executionDir: string) {
    return path.join(assistantProjectionRoot(executionDir), 'agents', 'dot-studio', AGENT_FILENAME)
}

function skillDir(executionDir: string, skillName: string) {
    return path.join(assistantProjectionRoot(executionDir), 'skills', 'dot-studio', skillName)
}

function skillFilePath(executionDir: string, skillName: string) {
    return path.join(skillDir(executionDir, skillName), 'SKILL.md')
}

function toolFilePath(executionDir: string, toolName: string) {
    return path.join(assistantProjectionRoot(executionDir), 'tools', `${toolName}.ts`)
}

function dotStudioAgentPath(opencodeRoot: string) {
    return path.join(opencodeRoot, 'agents', 'dot-studio', AGENT_FILENAME)
}

function dotStudioSkillDir(opencodeRoot: string, skillName: string) {
    return path.join(opencodeRoot, 'skills', 'dot-studio', skillName)
}

function dotStudioToolPath(opencodeRoot: string, toolName: string) {
    return path.join(opencodeRoot, 'tools', `${toolName}.ts`)
}

// ── Read source assets ────────────────────────────────
async function readTal(): Promise<string> {
    return fs.readFile(TAL_PATH, 'utf-8')
}

interface BuiltinSkill {
    name: string
    description: string
    content: string
    sourceDir: string | null
}

async function readBuiltinSkills(): Promise<BuiltinSkill[]> {
    const entries = await fs.readdir(DANCES_DIR, { withFileTypes: true })
    const skills: BuiltinSkill[] = []

    for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const skillPath = path.join(DANCES_DIR, entry.name, 'SKILL.md')
        const raw = await fs.readFile(skillPath, 'utf-8').catch(() => null)
        if (!raw) continue

        const parsed = parseDanceFromSkillMd(raw)
        const skillName = parsed.name?.trim() || entry.name
        if (skillName !== entry.name) {
            throw new Error(`Builtin assistant skill name mismatch for ${skillPath}: expected "${entry.name}", got "${skillName}"`)
        }

        skills.push({
            name: skillName,
            description: parsed.description?.trim() || entry.name.replace(/-/g, ' '),
            content: raw.trim(),
            sourceDir: path.join(DANCES_DIR, entry.name),
        })
    }

    return skills.sort((left, right) => left.name.localeCompare(right.name))
}

async function removeStaleBuiltinSkills(
    executionDir: string,
    expectedSkillNames: string[],
): Promise<boolean> {
    const skillsRoot = path.join(assistantProjectionRoot(executionDir), 'skills', 'dot-studio')
    const expected = new Set(expectedSkillNames)
    let changed = false

    const entries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (expected.has(entry.name)) continue

        await fs.rm(path.join(skillsRoot, entry.name), { recursive: true, force: true })
        changed = true
    }

    return changed
}

async function removeStaleAssistantTools(
    executionDir: string,
    expectedToolNames: string[],
): Promise<boolean> {
    const toolsDir = path.join(assistantProjectionRoot(executionDir), 'tools')
    const expected = new Set(expectedToolNames)
    let changed = false

    const entries = await fs.readdir(toolsDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
        const toolName = entry.name.replace(/\.ts$/, '')
        if (!ASSISTANT_TOOL_NAMES.includes(toolName as typeof ASSISTANT_TOOL_NAMES[number])) continue
        if (expected.has(toolName)) continue

        await fs.rm(path.join(toolsDir, entry.name), { force: true })
        changed = true
    }

    return changed
}

async function removeAssistantProjectionAtRoot(
    opencodeRoot: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    let changed = false

    const targets = [
        dotStudioAgentPath(opencodeRoot),
        ...toolNames.map((toolName) => dotStudioToolPath(opencodeRoot, toolName)),
        ...skillNames.map((skillName) => dotStudioSkillDir(opencodeRoot, skillName)),
    ]

    for (const target of targets) {
        const existed = await fs.stat(target).then(() => true).catch(() => false)
        if (!existed) {
            continue
        }
        await fs.rm(target, { recursive: true, force: true })
        changed = true
    }

    const skillsRoot = path.join(opencodeRoot, 'skills', 'dot-studio')
    const remainingSkillEntries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => [])
    if (remainingSkillEntries.length === 0) {
        await fs.rm(skillsRoot, { recursive: true, force: true }).catch(() => {})
    }

    const agentDir = path.join(opencodeRoot, 'agents', 'dot-studio')
    const remainingAgentEntries = await fs.readdir(agentDir, { withFileTypes: true }).catch(() => [])
    if (remainingAgentEntries.length === 0) {
        await fs.rm(agentDir, { recursive: true, force: true }).catch(() => {})
    }

    return changed
}

async function removeDuplicateAssistantProjectionAncestors(
    executionDir: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    const currentDir = path.resolve(executionDir)
    let changed = false

    let cursor = path.dirname(currentDir)
    while (cursor !== currentDir) {
        changed = (await removeAssistantProjectionAtRoot(
            workspaceAssistantProjectionRoot(cursor),
            skillNames,
            toolNames,
        )) || changed

        const parent = path.dirname(cursor)
        if (parent === cursor) {
            break
        }
        cursor = parent
    }

    return changed
}

async function removeDuplicateAssistantProjectionDescendants(
    executionDir: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    const root = path.resolve(executionDir)
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    let changed = false

    async function pruneDirectory(dir: string): Promise<void> {
        const opencodeDir = workspaceAssistantProjectionRoot(dir)
        const hasProjection = await fs.stat(opencodeDir).then(() => true).catch(() => false)
        if (hasProjection) {
            changed = (await removeAssistantProjectionAtRoot(opencodeDir, skillNames, toolNames)) || changed
        }

        const children = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
        for (const entry of children) {
            if (!entry.isDirectory()) continue
            if (entry.name === '.opencode' || entry.name === 'node_modules') continue
            await pruneDirectory(path.join(dir, entry.name))
        }
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name === '.opencode' || entry.name === 'node_modules') continue
        await pruneDirectory(path.join(root, entry.name))
    }

    return changed
}

async function removeManagedWorkspaceAssistantProjection(
    executionDir: string,
    skillNames: string[],
    toolNames: string[],
): Promise<boolean> {
    return removeAssistantProjectionAtRoot(
        workspaceAssistantProjectionRoot(executionDir),
        skillNames,
        toolNames,
    )
}

// ── Frontmatter ───────────────────────────────────────
function buildFrontmatter(skillNames: string[], toolNames: string[]): string {
    const lines = ['---']
    lines.push('description: "Studio Assistant"')
    lines.push('mode: primary')
    // Model is NOT specified here — passed via promptAsync() to avoid staleness.

    lines.push('permission:')
    lines.push('  skill:')
    lines.push('    "*": "deny"')
    for (const name of skillNames) {
        lines.push(`    ${JSON.stringify(name)}: "allow"`)
    }
    lines.push('tools:')
    lines.push('  "*": false')
    for (const toolName of toolNames) {
        lines.push(`  ${JSON.stringify(toolName)}: true`)
    }
    lines.push('  "bash": false')
    lines.push('  "edit": false')
    lines.push('  "write": false')

    lines.push('---')
    return lines.join('\n')
}

// ── Agent body ────────────────────────────────────────
function buildAgentBody(talContent: string): string {
    return talContent.trim()
}

// ── SKILL.md assembly ─────────────────────────────────
function buildSkillFile(skill: BuiltinSkill): string {
    return skill.content
}

const ASSISTANT_CONTEXT_LIMITS = {
    performers: 18,
    performersAll: 48,
    acts: 10,
    actsAll: 24,
    drafts: 16,
    draftsAll: 36,
    models: 10,
    modelsAll: 24,
    description: 260,
    relationDescription: 220,
} as const

const ASSISTANT_CONTEXT_STOPWORDS = new Set([
    'please', 'help', 'with', 'that', 'this', 'for', 'from', 'into', 'using', 'make', 'create', 'build',
    'find', 'search', 'install', 'import', 'add', 'use', 'want', 'need', 'the', 'a', 'an', 'and', 'or',
    'open', 'show', 'hide', 'move', 'resize', 'arrange', 'inspect', 'focus', 'update', 'delete',
    'studio', 'assistant', 'workspace', 'canvas', 'editor', 'panel',
    '좀', '주세요', '해줘', '해', '만들', '만들어', '생성', '열어', '보여', '숨겨', '옮겨', '이동',
    '정리', '배치', '수정', '삭제', '찾아', '검색', '스튜디오', '어시스턴트',
])

type AssistantPromptIntent = {
    tokens: string[]
    includeGeometry: boolean
    includeModelVariants: boolean
    includeActDetails: boolean
    includeDraftDetails: boolean
    includeAll: boolean
}

type Selection<T> = {
    selected: T[]
    omitted: number
}

function normalizeSearchText(value: string | null | undefined) {
    return (value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}@/_\-\s.]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function includesAny(text: string, needles: string[]) {
    return needles.some((needle) => text.includes(needle))
}

function inferAssistantPromptIntent(userMessage: string | undefined): AssistantPromptIntent {
    const text = normalizeSearchText(userMessage)
    const tokens = Array.from(new Set(
        text
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token.length >= 2 && !ASSISTANT_CONTEXT_STOPWORDS.has(token)),
    )).slice(0, 12)

    const includeGeometry = includesAny(text, [
        'open', 'show', 'focus', 'reveal', 'hide', 'hidden', 'visible', 'visibility', 'move', 'resize',
        'arrange', 'layout', 'position', 'panel', 'canvas', 'editor', 'inspect',
        '열', '보여', '숨', '표시', '이동', '옮', '크기', '배치', '정렬', '패널', '캔버스', '편집',
    ])
    const includeModelVariants = includesAny(text, [
        'model', 'variant', 'gpt', 'claude', 'openai', 'anthropic', 'reasoning',
        '모델', '변형', '추론',
    ])
    const includeActDetails = includesAny(text, [
        'act', 'workflow', 'team', 'pipeline', 'participant', 'relation', 'subscription', 'safety',
        'handoff', 'thread', 'wake',
        '액트', '워크플로', '워크플로우', '팀', '파이프라인', '참여', '관계', '구독', '핸드오프',
    ])
    const includeDraftDetails = includesAny(text, [
        'tal', 'dance', 'skill', 'draft', 'bundle', 'reference', 'script',
        '탈', '댄스', '스킬', '초안', '번들',
    ])
    const includeAll = includesAny(text, [
        'all', 'every', 'entire', 'everything', 'list', 'overview', 'arrange', 'layout',
        '전체', '모두', '전부', '목록', '개요', '배치', '정렬',
    ])

    return {
        tokens,
        includeGeometry,
        includeModelVariants,
        includeActDetails,
        includeDraftDetails,
        includeAll,
    }
}

function compactText(value: string | null | undefined, limit: number) {
    const normalized = value?.replace(/\s+/g, ' ').trim()
    if (!normalized) return undefined
    if (normalized.length <= limit) return normalized
    return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function scoreByTokens(haystack: string, tokens: string[]) {
    if (tokens.length === 0) return 0
    const text = normalizeSearchText(haystack)
    return tokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0)
}

function selectPromptEntries<T>(
    entries: T[],
    options: {
        limit: number
        score: (entry: T, index: number) => number
    },
): Selection<T> {
    if (entries.length <= options.limit) {
        return { selected: entries, omitted: 0 }
    }

    const ranked = entries
        .map((entry, index) => ({ entry, index, score: options.score(entry, index) }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, options.limit)
        .sort((left, right) => left.index - right.index)

    return {
        selected: ranked.map((item) => item.entry),
        omitted: entries.length - ranked.length,
    }
}

function summarizePerformer(
    performer: AssistantStageContext['performers'][number],
    intent: AssistantPromptIntent,
    expanded: boolean,
) {
    return {
        id: performer.id,
        name: performer.name,
        ...(expanded ? { description: compactText(performer.description, ASSISTANT_CONTEXT_LIMITS.description) } : {}),
        ...(intent.includeGeometry ? {
            position: performer.position,
            size: performer.size,
            hidden: performer.hidden,
        } : {}),
        model: performer.model,
        modelVariant: performer.modelVariant,
        talUrn: performer.talUrn,
        talDraftId: performer.talDraftId,
        danceUrns: performer.danceUrns,
        danceDraftIds: performer.danceDraftIds,
    }
}

function summarizeAct(
    act: AssistantStageContext['acts'][number],
    intent: AssistantPromptIntent,
    expanded: boolean,
) {
    const includeDetails = expanded || intent.includeActDetails
    return {
        id: act.id,
        name: act.name,
        ...(includeDetails ? { description: compactText(act.description, ASSISTANT_CONTEXT_LIMITS.description) } : {}),
        ...(intent.includeGeometry ? {
            position: act.position,
            size: act.size,
            hidden: act.hidden,
        } : {}),
        ...(includeDetails ? {
            actRules: act.actRules,
            safety: act.safety,
        } : {}),
        participants: act.participants.map((participant) => ({
            key: participant.key,
            performerName: participant.performerName,
            performerId: participant.performerId,
            ...(includeDetails && participant.displayName ? { displayName: participant.displayName } : {}),
            ...(includeDetails ? { description: compactText(participant.description, ASSISTANT_CONTEXT_LIMITS.description) } : {}),
            ...(includeDetails && participant.subscriptions ? { subscriptions: participant.subscriptions } : {}),
        })),
        relations: includeDetails
            ? act.relations.map((relation) => ({
                id: relation.id,
                name: relation.name,
                description: compactText(relation.description, ASSISTANT_CONTEXT_LIMITS.relationDescription),
                between: relation.between,
                direction: relation.direction,
            }))
            : act.relations.map((relation) => ({
                id: relation.id,
                name: relation.name,
                between: relation.between,
                direction: relation.direction,
            })),
    }
}

function summarizeDraft(
    draft: AssistantStageContext['drafts'][number],
    intent: AssistantPromptIntent,
    expanded: boolean,
) {
    const includeDetails = expanded || intent.includeDraftDetails
    return {
        id: draft.id,
        kind: draft.kind,
        name: draft.name,
        slug: draft.slug,
        ...(includeDetails ? { description: compactText(draft.description, ASSISTANT_CONTEXT_LIMITS.description) } : {}),
        ...(includeDetails && draft.tags?.length ? { tags: draft.tags.slice(0, 8) } : {}),
        saveState: draft.saveState,
    }
}

function summarizeModel(
    model: AssistantStageContext['availableModels'][number],
    intent: AssistantPromptIntent,
    expanded: boolean,
) {
    return {
        provider: model.provider,
        providerName: model.providerName,
        modelId: model.modelId,
        name: model.name,
        ...((expanded || intent.includeModelVariants) && model.variants?.length
            ? { variants: model.variants.slice(0, 8) }
            : {}),
    }
}

function optimizeAssistantStageContext(
    context: AssistantStageContext | null | undefined,
    userMessage: string | undefined,
) {
    const source = context || { workingDir: '', view: null, performers: [], acts: [], drafts: [], availableModels: [] }
    const intent = inferAssistantPromptIntent(userMessage)
    const selectedPerformerIds = new Set([
        source.view?.selectedPerformerId || '',
        source.view?.activeChatPerformerId || '',
    ].filter(Boolean))
    const selectedActIds = new Set([
        source.view?.selectedActId || '',
    ].filter(Boolean))
    const selectedDraftIds = new Set([
        source.view?.selectedMarkdownEditorId || '',
    ].filter(Boolean))
    const usedModels = new Set(source.performers
        .map((performer) => performer.model ? `${performer.model.provider}:${performer.model.modelId}` : '')
        .filter(Boolean))

    const performerSelection = selectPromptEntries(source.performers, {
        limit: intent.includeAll ? ASSISTANT_CONTEXT_LIMITS.performersAll : ASSISTANT_CONTEXT_LIMITS.performers,
        score: (performer) => (
            (selectedPerformerIds.has(performer.id) ? 100 : 0)
            + scoreByTokens(`${performer.id} ${performer.name} ${performer.description || ''}`, intent.tokens)
        ),
    })
    const actSelection = selectPromptEntries(source.acts, {
        limit: intent.includeAll ? ASSISTANT_CONTEXT_LIMITS.actsAll : ASSISTANT_CONTEXT_LIMITS.acts,
        score: (act) => (
            (selectedActIds.has(act.id) ? 100 : 0)
            + scoreByTokens([
                act.id,
                act.name,
                act.description || '',
                ...act.participants.map((participant) => `${participant.key} ${participant.performerName} ${participant.description || ''}`),
                ...act.relations.map((relation) => `${relation.id} ${relation.name} ${relation.description || ''}`),
            ].join(' '), intent.tokens)
        ),
    })
    const draftSelection = selectPromptEntries(source.drafts, {
        limit: intent.includeAll ? ASSISTANT_CONTEXT_LIMITS.draftsAll : ASSISTANT_CONTEXT_LIMITS.drafts,
        score: (draft) => (
            (selectedDraftIds.has(draft.id) ? 100 : 0)
            + scoreByTokens(`${draft.id} ${draft.kind} ${draft.name} ${draft.slug || ''} ${draft.description || ''} ${(draft.tags || []).join(' ')}`, intent.tokens)
        ),
    })
    const modelSelection = selectPromptEntries(source.availableModels, {
        limit: intent.includeAll || intent.includeModelVariants
            ? ASSISTANT_CONTEXT_LIMITS.modelsAll
            : ASSISTANT_CONTEXT_LIMITS.models,
        score: (model) => (
            (usedModels.has(`${model.provider}:${model.modelId}`) ? 25 : 0)
            + scoreByTokens(`${model.provider} ${model.providerName} ${model.modelId} ${model.name}`, intent.tokens)
        ),
    })

    return {
        workingDir: source.workingDir,
        view: source.view,
        context: {
            optimized: true,
            intent: {
                geometry: intent.includeGeometry,
                modelVariants: intent.includeModelVariants,
                actDetails: intent.includeActDetails,
                draftDetails: intent.includeDraftDetails,
                broadRequest: intent.includeAll,
            },
            totals: {
                performers: source.performers.length,
                acts: source.acts.length,
                drafts: source.drafts.length,
                availableModels: source.availableModels.length,
            },
            omitted: {
                performers: performerSelection.omitted,
                acts: actSelection.omitted,
                drafts: draftSelection.omitted,
                availableModels: modelSelection.omitted,
            },
            note: 'Expanded records are selected from the current view, user wording, and action intent. If a needed target was omitted and the user did not name it exactly, ask one short clarifying question.',
        },
        performers: performerSelection.selected.map((performer) =>
            summarizePerformer(
                performer,
                intent,
                selectedPerformerIds.has(performer.id)
                    || intent.includeActDetails
                    || scoreByTokens(`${performer.name} ${performer.description || ''}`, intent.tokens) > 0,
            ),
        ),
        acts: actSelection.selected.map((act) =>
            summarizeAct(
                act,
                intent,
                selectedActIds.has(act.id)
                    || scoreByTokens(`${act.name} ${act.description || ''}`, intent.tokens) > 0,
            ),
        ),
        drafts: draftSelection.selected.map((draft) =>
            summarizeDraft(
                draft,
                intent,
                selectedDraftIds.has(draft.id)
                    || scoreByTokens(`${draft.name} ${draft.description || ''}`, intent.tokens) > 0,
            ),
        ),
        availableModels: modelSelection.selected.map((model) =>
            summarizeModel(
                model,
                intent,
                usedModels.has(`${model.provider}:${model.modelId}`)
                    || scoreByTokens(`${model.provider} ${model.modelId} ${model.name}`, intent.tokens) > 0,
            ),
        ),
    }
}

export function buildAssistantActionPrompt(
    context: AssistantStageContext | null | undefined,
    userMessage = '',
): string {
    const snapshot = JSON.stringify(
        optimizeAssistantStageContext(context, userMessage),
        null,
        2,
    )

    return [
        'Current Workspace Snapshot (optimized for this turn):',
        '```json',
        snapshot,
        '```',
        'Use the snapshot as the source of truth for current ids, exact names, models, draft save state, topology, and UI state included in this optimized view.',
        'Action decision:',
        '- Explain directly only when the user wants guidance, critique, or a concept answer.',
        '- Ask one short clarifying question only when the target, creation path, or important design choice is unresolved.',
        '- When the user clearly asks Studio to create, update, delete, open, show, hide, move, resize, arrange, import, install, or apply something, call `apply_studio_actions`; do not stop at describing what you would change.',
        '- Keep user-facing text brief; send mutations only as a tool call, never as raw JSON or fenced code.',
        'Tool payload rules:',
        '- Load `studio-assistant-action-surface-guide` before non-trivial mutation payloads or when exact fields/refs are needed.',
        '- Load the smallest relevant design guide for the task: Performer, Act, workflow, Tal, Studio UI operations, Dance authoring, or find-skills.',
        '- Relevant guide names: `studio-assistant-performer-guide`, `studio-assistant-act-guide`, `studio-assistant-workflow-guide`, `studio-assistant-tal-design-guide`, `studio-assistant-ui-operations-guide`, `studio-assistant-skill-creator-guide`, `find-skills`.',
        '- Tool arguments must be `{version:1, actions:[...]}`. Omit unspecified optional fields and validate the whole envelope before calling.',
        '- Prefer snapshot ids. Use exact names only when unambiguous. Never invent ids, model ids, model variants, MCP names, URNs, relation ids, or draft ids.',
        '- Use same-call refs only for objects created earlier in the same tool call; dependent actions must be in order.',
        '- Reuse existing Studio objects when they fit. Create new objects only when the user asked for new or tailored assets.',
        '- Tal and Dance actions are draft-only; Performer and Act actions are current Stage-only; Save Local and Publish are outside this tool surface.',
        '- UI actions are hot state changes. Use `showPerformer`, `showAct`, `showDraft`, `setStudioPanel`, `setStudioNodeVisibility`, or `setStudioNodeFrame` for open/show/focus/reveal/hide/move/resize/panel requests.',
        '- For clear Performer or workflow creation, missing Tal/Dance/model details alone should not block mutation. Use compact role-appropriate inline Tal when role intent is clear.',
        '- For new workflow/team Acts, create missing Performers first, then create/update the Act with participants and at least one meaningful relation when there are multiple workflow participants.',
        '- Relation payloads use `source...` and `target...` fields only; every new relation needs non-empty `name` and `description`.',
        '- `actRules` is always an array of strings. Participant subscriptions are wake filters and use canonical `callboardKeys`; `eventTypes` supports only `runtime.idle`.',
    ].join('\n')
}

function shouldDiscoverAssets(message: string) {
    const text = message.toLowerCase()
    return [
        'tal', 'dance', 'performer', 'act', 'workflow', 'agent', 'skill', 'registry', 'install', 'import',
        'search', 'find', 'create', 'build', 'apply', 'use', 'attach',
        '탈', '댄스', '퍼포머', '액트', '워크플로', '워크플로우', '에이전트', '스킬', '레지스트리',
        '설치', '가져오기', '임포트', '검색', '찾', '만들', '생성', '적용', '사용', '붙여', '연결',
    ].some((token) => text.includes(token))
}

type AssistantSkillIntent = 'create' | 'find' | 'apply' | 'mixed' | null

function mentionsSkillContext(message: string) {
    const text = message.toLowerCase()
    return [
        'skill', 'skills.sh', 'dance', '스킬', '댄스',
    ].some((token) => text.includes(token))
}

function inferAssistantSkillIntent(message: string): AssistantSkillIntent {
    if (!mentionsSkillContext(message)) return null

    const text = message.toLowerCase()
    const create =
        [
        'create skill', 'make skill', 'new skill', 'build skill', 'author skill',
        'create dance', 'new dance', 'edit skill', 'update skill', 'improve skill', 'enhance skill',
        'skill creator', 'dance draft',
        '스킬 만들어', '스킬 생성', '스킬 작성', '새 스킬', '댄스 만들어', '댄스 생성', '댄스 작성',
        '스킬 수정', '스킬 개선', '댄스 수정', '댄스 개선', '댄스 초안',
    ].some((token) => text.includes(token))
        || ['create', 'make', 'build', 'author', 'edit', 'update', 'improve', 'enhance']
            .some((token) => text.includes(token))
        || ['만들', '생성', '작성', '수정', '개선', '고쳐']
            .some((token) => text.includes(token))
    const find =
        [
        'find skill', 'search skill', 'look for skill', 'is there a skill', 'recommend skill',
        'existing skill', 'skills.sh', 'find dance',
        '스킬 찾아', '스킬 검색', '스킬 추천', '기존 스킬', '댄스 찾아', '댄스 검색', '댄스 추천',
    ].some((token) => text.includes(token))
        || ['find', 'search', 'recommend'].some((token) => text.includes(token))
        || ['찾', '검색', '추천'].some((token) => text.includes(token))
    const apply =
        [
        'apply skill', 'use skill', 'install skill', 'add skill', 'attach skill',
        'apply dance', 'use dance', 'install dance', 'attach dance', 'import skill',
        '스킬 적용', '스킬 사용', '스킬 설치', '스킬 추가', '스킬 붙여', '댄스 적용', '댄스 사용',
        '댄스 설치', '댄스 추가', '댄스 붙여',
    ].some((token) => text.includes(token))
        || ['apply', 'install', 'use', 'attach', 'import'].some((token) => text.includes(token))
        || ['적용', '설치', '사용', '붙여', '추가', '임포트', '가져와'].some((token) => text.includes(token))

    if (create && (find || apply)) return 'mixed'
    if (apply) return 'apply'
    if (find) return 'find'
    if (create) return 'create'
    return null
}

function inferDiscoveryKinds(message: string): Array<'tal' | 'dance' | 'performer' | 'act'> {
    const text = message.toLowerCase()
    const kinds = new Set<'tal' | 'dance' | 'performer' | 'act'>()
    if (text.includes('tal') || text.includes('탈')) kinds.add('tal')
    if (text.includes('dance') || text.includes('skill') || text.includes('skills.sh') || text.includes('댄스') || text.includes('스킬')) kinds.add('dance')
    if (text.includes('performer') || text.includes('agent') || text.includes('퍼포머') || text.includes('에이전트')) kinds.add('performer')
    if (
        text.includes('act')
        || text.includes('workflow')
        || text.includes('pipeline')
        || text.includes('team')
        || text.includes('액트')
        || text.includes('워크플로')
        || text.includes('워크플로우')
        || text.includes('팀')
        || text.includes('파이프라인')
    ) {
        kinds.add('act')
        kinds.add('performer')
    }
    if (kinds.size === 0) {
        kinds.add('performer')
        kinds.add('dance')
    }
    return Array.from(kinds)
}

function buildDiscoveryQuery(message: string) {
    const stopwords = new Set([
        'please', 'help', 'with', 'that', 'this', 'for', 'from', 'into', 'using', 'make', 'create', 'build',
        'find', 'search', 'install', 'import', 'add', 'use', 'want', 'need', 'the', 'a', 'an',
        'skill', 'skills', 'dance', 'performer', 'act', 'workflow', 'agent', 'tal',
        '스킬', '댄스', '퍼포머', '액트', '워크플로', '워크플로우', '에이전트', '탈',
        '만들', '만들어', '만들어줘', '생성', '생성해', '생성해줘', '찾아', '찾아줘', '검색',
        '검색해', '검색해줘', '설치', '적용', '사용', '추가', '붙여', '가져와', '임포트',
    ])
    const tokens = message
        .toLowerCase()
        .replace(/[^\p{L}\p{N}@/_\-\s]+/gu, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !stopwords.has(token))

    return Array.from(new Set(tokens)).slice(0, 6).join(' ').trim()
}

function matchesDiscoveryQuery(candidate: { name?: string; urn?: string; description?: string }, query: string) {
    const haystack = `${candidate.name || ''} ${candidate.urn || ''} ${candidate.description || ''}`.toLowerCase()
    return query
        .toLowerCase()
        .split(/\s+/)
        .every((token) => !token || haystack.includes(token))
}

function buildAssistantSkillIntentPrompt(intent: AssistantSkillIntent): string[] {
    switch (intent) {
        case 'create':
            return [
                'Skill Intent Hint:',
                '- The user likely wants to create or improve a local Dance skill bundle.',
                '- Load and use `studio-assistant-skill-creator-guide`.',
                '- Do not default to skills.sh search unless the user explicitly asks for an existing external skill.',
            ]
        case 'find':
            return [
                'Skill Intent Hint:',
                '- The user likely wants to find or compare existing skills.',
                '- Load and use `find-skills`.',
                '- Prefer installed local matches first, then DOT registry matches, then skills.sh candidates.',
            ]
        case 'apply':
            return [
                'Skill Intent Hint:',
                '- The user likely wants to install or apply an existing skill.',
                '- Load and use `find-skills`.',
                '- If the exact skill is ambiguous, present the best candidates and ask which one to apply.',
                '- Before applying a skills.sh or GitHub skill, warn the user briefly to review the source repo, install count, maintainer reputation, and SKILL.md contents.',
            ]
        case 'mixed':
            return [
                'Skill Intent Hint:',
                '- The message mixes local skill authoring with external skill search or apply.',
                '- Ask one short clarifying question: should Studio create a new local Dance bundle, or use an existing external skill?',
                '- Use `studio-assistant-skill-creator-guide` for create/edit paths and `find-skills` for search/apply paths.',
            ]
        default:
            return []
    }
}

export async function buildAssistantDiscoveryPrompt(workingDir: string, userMessage: string): Promise<string> {
    if (!shouldDiscoverAssets(userMessage)) return ''

    const query = buildDiscoveryQuery(userMessage)
    const sections: string[] = []
    const skillIntent = inferAssistantSkillIntent(userMessage)
    const includeSkillsCatalog = skillIntent === 'find' || skillIntent === 'apply' || skillIntent === 'mixed'

    sections.push(...buildAssistantSkillIntentPrompt(skillIntent))

    if (!query) {
        return sections.length > 0
            ? [
                'Relevant Asset Discovery Hints:',
                ...sections,
                'Use these hints only when they clearly match the user request.',
                'If multiple paths are still reasonable, ask the user which path they want.',
            ].join('\n')
            : ''
    }

    for (const kind of inferDiscoveryKinds(userMessage).slice(0, 2)) {
        const installed = (await listStudioAssets(workingDir, kind))
            .filter((asset) => matchesDiscoveryQuery(asset, query))
            .slice(0, 3)

        if (installed.length > 0) {
            sections.push(
                `Installed ${kind} matches:`,
                ...installed.map((asset) => `- ${asset.name} (${asset.urn}) [${asset.source}]`),
            )
        }

        const registry = await searchDotRegistry(query, { kind, limit: 4 }).catch(() => [])
        if (registry.length > 0) {
            sections.push(
                `Registry ${kind} matches:`,
                ...registry.slice(0, 3).map((asset) => `- ${asset.name} (${asset.urn})`),
            )
        }

        if (kind === 'dance' && includeSkillsCatalog) {
            const skills = await searchSkillsCatalog(query, 4).catch(() => [])
            if (skills.length > 0) {
                sections.push(
                    'skills.sh dance matches:',
                    ...skills.slice(0, 3).map((asset) => `- ${asset.name} (${asset.urn}) ${asset.description} install via ${asset.owner}@${asset.name}`),
                    'If you recommend or apply one of these, include a short security warning about reviewing third-party skill contents and source trust first.',
                )
            }
        }
    }

    if (sections.length === 0) return ''

    return [
        'Relevant Asset Discovery Hints:',
        ...sections,
        'Use these hints only when they clearly match the user request.',
        'If multiple paths are still reasonable, ask the user which path they want.',
    ].join('\n')
}

// ── Write helper ──────────────────────────────────────
async function writeIfChanged(filePath: string, content: string): Promise<boolean> {
    const current = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (current === content) return false
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return true
}

/**
 * Ensure the assistant agent and builtin skill files exist.
 * Returns the agent name for use with oc.session.promptAsync().
 *
 * Called at stage save / project activate time.
 */
export async function ensureAssistantAgent(
    executionDir: string,
): Promise<string> {
    const talContent = await readTal()
    const skills = await readBuiltinSkills()
    const tools = getStaticAssistantTools()
    const skillNames = skills.map((skill) => skill.name)
    const toolNames = tools.map((tool) => tool.name)
    let changed = false

    changed = (await removeManagedWorkspaceAssistantProjection(executionDir, skillNames, toolNames)) || changed

    changed = (await removeDuplicateAssistantProjectionAncestors(
        executionDir,
        skillNames,
        toolNames,
    )) || changed
    changed = (await removeDuplicateAssistantProjectionDescendants(
        executionDir,
        skillNames,
        toolNames,
    )) || changed

    // 1. Agent file
    const frontmatter = buildFrontmatter(skills.map((s) => s.name), [...ASSISTANT_TOOL_NAMES])
    const body = buildAgentBody(talContent)
    const agentContent = `${frontmatter}\n\n${body}`
    changed = (await writeIfChanged(agentFilePath(executionDir), agentContent)) || changed

    for (const tool of tools) {
        changed = (await writeIfChanged(toolFilePath(executionDir, tool.name), tool.content)) || changed
    }
    changed = (await removeStaleAssistantTools(executionDir, toolNames)) || changed

    // 2. Skill files (one SKILL.md per builtin dance)
    for (const skill of skills) {
        changed = (await writeIfChanged(skillFilePath(executionDir, skill.name), buildSkillFile(skill))) || changed
        const bundleSync = await syncSkillBundleSiblings(skill.sourceDir, skillDir(executionDir, skill.name))
        changed = bundleSync.changed || changed
    }
    changed = (await removeStaleBuiltinSkills(executionDir, skillNames)) || changed

    if (changed) {
        const oc = await getOpencode()
        await oc.instance.dispose({ directory: executionDir }).catch(() => {})
    }

    return `dot-studio/${AGENT_FILENAME.replace(/\.md$/, '')}`
}
