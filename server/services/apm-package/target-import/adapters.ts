import path from 'path'
import type { ApmGitHubImportFormat } from '../../../../shared/apm-contracts.js'
import type { ImportCandidate } from '../github-import-candidate-types.js'
import { slugify } from '../github-import-utils.js'
import type { TargetImportAdapter, TargetImportBuildContext } from './types.js'
import {
    basenameSlug,
    isPlainRecord,
    packageCandidate,
    parseJsonRecord,
    sourceLabel,
    sourceRootForTargetPath,
    targetLabels,
} from './helpers.js'

const CLAUDE_PROJECT_HOOK_PREFIX = /\$(?:CLAUDE_PROJECT_DIR|\{CLAUDE_PROJECT_DIR\})[\\/]\.claude[\\/]hooks[\\/]/g

function adapterAcceptsFormat(adapter: TargetImportAdapter, requested: ApmGitHubImportFormat | undefined) {
    return !requested
        || requested === 'auto'
        || requested === 'target-native'
        || requested === adapter.format
}

function jsonHooksSlice(raw: string) {
    const parsed = parseJsonRecord(raw)
    if (!parsed || !isPlainRecord(parsed.hooks)) return null
    const hooks = Object.fromEntries(
        Object.entries(parsed.hooks).filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1])),
    )
    return Object.keys(hooks).length > 0 ? hooks : null
}

function wrappedOrNakedHooks(raw: string) {
    const parsed = parseJsonRecord(raw)
    if (!parsed) return null
    if (isPlainRecord(parsed.hooks)) return parsed
    if (Object.keys(parsed).length > 0 && Object.values(parsed).every((value) => Array.isArray(value))) {
        return { hooks: parsed }
    }
    return null
}

function rewriteClaudeProjectHookPath(value: unknown): unknown {
    if (typeof value === 'string') {
        return value.replace(CLAUDE_PROJECT_HOOK_PREFIX, '${PLUGIN_ROOT}/.apm/hooks/scripts/claude/')
    }
    if (Array.isArray(value)) {
        return value.map((entry) => rewriteClaudeProjectHookPath(entry))
    }
    if (isPlainRecord(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, rewriteClaudeProjectHookPath(entry)]),
        )
    }
    return value
}

function pathPrefixPattern(prefix: string) {
    return prefix
        .split('/')
        .filter(Boolean)
        .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[\\\\/]')
}

function rewriteTargetProjectHookPath(value: unknown, projectHookPrefix: string, scriptPrefix: string): unknown {
    if (typeof value === 'string') {
        const hookPrefixPattern = `${pathPrefixPattern(projectHookPrefix)}[\\\\/]`
        const projectDirPattern = new RegExp(`\\$\\{?[A-Z_]*PROJECT_DIR\\}?[\\\\/]${hookPrefixPattern}`, 'g')
        const barePattern = new RegExp(`(^|[\\s"'=])${hookPrefixPattern}`, 'g')
        return value
            .replace(projectDirPattern, `./${scriptPrefix}`)
            .replace(barePattern, `$1./${scriptPrefix}`)
    }
    if (Array.isArray(value)) {
        return value.map((entry) => rewriteTargetProjectHookPath(entry, projectHookPrefix, scriptPrefix))
    }
    if (isPlainRecord(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [
                key,
                rewriteTargetProjectHookPath(entry, projectHookPrefix, scriptPrefix),
            ]),
        )
    }
    return value
}

function filesUnder(
    tree: string[],
    prefix: string,
    targetPrefix: string,
    shouldCopy: (sourcePath: string) => boolean = () => true,
): ImportCandidate['copyFiles'] {
    return tree
        .filter((entry) => entry.startsWith(prefix))
        .filter(shouldCopy)
        .map((entry) => ({
            sourcePath: entry,
            targetPath: `${targetPrefix}${entry.slice(prefix.length)}`,
        }))
}

function claudeSettingsRoot(sourcePath: string) {
    return sourceRootForTargetPath(sourcePath, '.claude')
}

function targetRootedPath(sourcePath: string, markerDir: string, relativePath: string) {
    const root = sourceRootForTargetPath(sourcePath, markerDir)
    return root ? `${root}/${relativePath}` : relativePath
}

function sourcePathIs(sourcePath: string, relativePath: string) {
    return sourcePath === relativePath || sourcePath.endsWith(`/${relativePath}`)
}

function sourcePathUnder(sourcePath: string, prefix: string) {
    return sourcePath.startsWith(prefix) || sourcePath.includes(`/${prefix}`)
}

function settingsHooksCandidate(input: {
    context: TargetImportBuildContext
    adapterId: string
    format: Exclude<ApmGitHubImportFormat, 'auto'>
    targetId: string
    markerDir: string
    outputName: string
    scriptSourcePrefix?: string
    scriptTargetPrefix?: string
    rewrite?: (value: unknown) => unknown
}) {
    const hooks = jsonHooksSlice(input.context.raw)
    if (!hooks) return null
    const eventCount = Object.keys(hooks).length
    const name = slugify(`${sourceLabel(input.context.repo, input.context.sourcePath, input.markerDir)} ${input.targetId} hooks`, `${input.targetId}-hooks`)
    const hookData = {
        hooks: input.rewrite ? input.rewrite(hooks) : hooks,
    }
    const copyFiles: ImportCandidate['copyFiles'] = [{
        targetPath: `.apm/hooks/${input.outputName}`,
        content: `${JSON.stringify(hookData, null, 2)}\n`,
    }]
    if (input.scriptSourcePrefix && input.scriptTargetPrefix) {
        copyFiles.push(...filesUnder(input.context.tree, input.scriptSourcePrefix, input.scriptTargetPrefix))
    }
    return packageCandidate({
        repo: input.context.repo,
        ref: input.context.ref,
        sourcePath: input.context.sourcePath,
        adapterId: input.adapterId,
        format: input.format,
        name,
        description: `${targetLabels([input.targetId])[0]} hooks from ${input.context.sourcePath} with ${eventCount} lifecycle event${eventCount === 1 ? '' : 's'}.`,
        manifestKind: 'hook',
        manifestType: 'hooks',
        targetIds: [input.targetId],
        primitiveCounts: { hooks: 1 },
        copyFiles,
    })
}

function hookConfigCandidate(context: TargetImportBuildContext, input: {
    adapterId: string
    targetId: string
    outputName: string
    scriptSourcePrefix?: string
    scriptTargetPrefix?: string
    rewrite?: (value: unknown) => unknown
}) {
    const parsedHookData = wrappedOrNakedHooks(context.raw)
    const hookData = parsedHookData && input.rewrite ? input.rewrite(parsedHookData) : parsedHookData
    if (!hookData) return null
    const copyFiles: ImportCandidate['copyFiles'] = [{
        targetPath: `.apm/hooks/${input.outputName}`,
        content: `${JSON.stringify(hookData, null, 2)}\n`,
    }]
    if (input.scriptSourcePrefix && input.scriptTargetPrefix) {
        copyFiles.push(...filesUnder(context.tree, input.scriptSourcePrefix, input.scriptTargetPrefix))
    }
    const name = slugify(`${sourceLabel(context.repo, context.sourcePath, `.${input.targetId}`)} ${input.targetId} hooks`, `${input.targetId}-hooks`)
    return packageCandidate({
        repo: context.repo,
        ref: context.ref,
        sourcePath: context.sourcePath,
        adapterId: input.adapterId,
        format: 'target-native',
        name,
        description: `${targetLabels([input.targetId])[0]} hook config from ${context.sourcePath}.`,
        manifestKind: 'hook',
        manifestType: 'hooks',
        targetIds: [input.targetId],
        primitiveCounts: { hooks: 1 },
        copyFiles,
    })
}

type PathAdapterSpec = {
    prefix: string
    targetId: string
    manifestKind: 'instruction' | 'prompt' | 'command'
    manifestType: string
    sourceKindLabel: string
    extension?: string
    targetDir: string
}

function pathMatchesSpec(sourcePath: string, spec: PathAdapterSpec) {
    if (!sourcePathUnder(sourcePath, spec.prefix)) return false
    if (!spec.extension) return true
    return sourcePath.toLowerCase().endsWith(spec.extension)
}

function primitiveMarkdownCandidate(context: TargetImportBuildContext, spec: PathAdapterSpec) {
    const base = basenameSlug(context.sourcePath, spec.manifestKind)
    const name = slugify(`${base} ${spec.sourceKindLabel}`, base)
    const targetPath = `${spec.targetDir}/${base}${spec.manifestKind === 'instruction' ? '.instructions.md' : '.prompt.md'}`
    return packageCandidate({
        repo: context.repo,
        ref: context.ref,
        sourcePath: context.sourcePath,
        adapterId: `target-${spec.manifestKind}:${spec.prefix}`,
        format: 'target-native',
        name,
        description: `${targetLabels([spec.targetId])[0]} ${spec.sourceKindLabel} from ${context.sourcePath}.`,
        manifestKind: spec.manifestKind,
        manifestType: spec.manifestType,
        targetIds: [spec.targetId],
        primitiveCounts: spec.manifestKind === 'instruction'
            ? { instructions: 1 }
            : { prompts: 1, commands: 1 },
        copyFiles: [{ sourcePath: context.sourcePath, targetPath }],
    })
}

const commandSpecs: PathAdapterSpec[] = [
    { prefix: '.claude/commands/', targetId: 'claude', manifestKind: 'command', manifestType: 'commands', sourceKindLabel: 'command', extension: '.md', targetDir: '.apm/prompts' },
    { prefix: '.cursor/commands/', targetId: 'cursor', manifestKind: 'command', manifestType: 'commands', sourceKindLabel: 'command', extension: '.md', targetDir: '.apm/prompts' },
    { prefix: '.opencode/commands/', targetId: 'opencode', manifestKind: 'command', manifestType: 'commands', sourceKindLabel: 'command', extension: '.md', targetDir: '.apm/prompts' },
    { prefix: '.windsurf/workflows/', targetId: 'windsurf', manifestKind: 'command', manifestType: 'commands', sourceKindLabel: 'workflow', extension: '.md', targetDir: '.apm/prompts' },
    { prefix: '.github/prompts/', targetId: 'copilot', manifestKind: 'prompt', manifestType: 'prompts', sourceKindLabel: 'prompt', extension: '.md', targetDir: '.apm/prompts' },
]

const instructionSpecs: PathAdapterSpec[] = [
    { prefix: '.github/instructions/', targetId: 'copilot', manifestKind: 'instruction', manifestType: 'instructions', sourceKindLabel: 'instruction', extension: '.md', targetDir: '.apm/instructions' },
    { prefix: '.claude/rules/', targetId: 'claude', manifestKind: 'instruction', manifestType: 'instructions', sourceKindLabel: 'rule', extension: '.md', targetDir: '.apm/instructions' },
    { prefix: '.cursor/rules/', targetId: 'cursor', manifestKind: 'instruction', manifestType: 'instructions', sourceKindLabel: 'rule', targetDir: '.apm/instructions' },
    { prefix: '.windsurf/rules/', targetId: 'windsurf', manifestKind: 'instruction', manifestType: 'instructions', sourceKindLabel: 'rule', extension: '.md', targetDir: '.apm/instructions' },
]

function standaloneInstructionSpec(sourcePath: string): PathAdapterSpec | null {
    const lower = sourcePath.toLowerCase()
    if (lower === '.github/copilot-instructions.md' || lower.endsWith('/.github/copilot-instructions.md')) {
        return { prefix: sourcePath, targetId: 'copilot', manifestKind: 'instruction', manifestType: 'instructions', sourceKindLabel: 'instruction', targetDir: '.apm/instructions' }
    }
    if (lower === 'claude.md' || lower === '.claude/claude.md' || lower.endsWith('/.claude/claude.md')) {
        return { prefix: sourcePath, targetId: 'claude', manifestKind: 'instruction', manifestType: 'instructions', sourceKindLabel: 'instruction', targetDir: '.apm/instructions' }
    }
    if (lower === 'gemini.md' || lower === '.gemini/gemini.md' || lower.endsWith('/.gemini/gemini.md')) {
        return { prefix: sourcePath, targetId: 'gemini', manifestKind: 'instruction', manifestType: 'instructions', sourceKindLabel: 'instruction', targetDir: '.apm/instructions' }
    }
    return null
}

function githubHookFileCandidate(context: TargetImportBuildContext) {
    const hookRoot = targetRootedPath(context.sourcePath, '.github', '.github/hooks/')
    if (!context.sourcePath.startsWith(hookRoot) || !context.sourcePath.endsWith('.json')) return null
    const hookData = rewriteTargetProjectHookPath(
        wrappedOrNakedHooks(context.raw),
        '.github/hooks',
        'scripts/copilot/',
    )
    if (!hookData) return null
    const relative = context.sourcePath.slice(hookRoot.length)
    const base = slugify(path.posix.basename(relative, '.json'), 'hooks')
    const copyFiles: ImportCandidate['copyFiles'] = [{
        targetPath: `.apm/hooks/${base}-copilot-hooks.json`,
        content: `${JSON.stringify(hookData, null, 2)}\n`,
    }]
    copyFiles.push(...filesUnder(
        context.tree,
        hookRoot,
        '.apm/hooks/scripts/copilot/',
        (entry) => entry !== context.sourcePath && !entry.endsWith('.json'),
    ))
    return packageCandidate({
        repo: context.repo,
        ref: context.ref,
        sourcePath: context.sourcePath,
        adapterId: 'target-hooks:copilot-file',
        format: 'target-native',
        name: slugify(`${base} copilot hooks`, 'copilot-hooks'),
        description: `Copilot hook file from ${context.sourcePath}.`,
        manifestKind: 'hook',
        manifestType: 'hooks',
        targetIds: ['copilot'],
        primitiveCounts: { hooks: 1 },
        copyFiles,
    })
}

export const TARGET_IMPORT_ADAPTERS: TargetImportAdapter[] = [
    {
        id: 'target-hooks:claude-settings',
        format: 'claude-settings',
        priority: 1,
        matches: (sourcePath) => {
            const base = path.posix.basename(sourcePath).toLowerCase()
            return (base === 'settings.json' || base === 'settings.local.json') && sourcePathUnder(sourcePath, '.claude/')
        },
        build: (context) => settingsHooksCandidate({
            context,
            adapterId: 'target-hooks:claude-settings',
            format: 'claude-settings',
            targetId: 'claude',
            markerDir: '.claude',
            outputName: 'claude-hooks.json',
            scriptSourcePrefix: `${claudeSettingsRoot(context.sourcePath) ? `${claudeSettingsRoot(context.sourcePath)}/` : ''}.claude/hooks/`,
            scriptTargetPrefix: '.apm/hooks/scripts/claude/',
            rewrite: rewriteClaudeProjectHookPath,
        }),
    },
    {
        id: 'target-hooks:merged-config',
        format: 'target-native',
        priority: 2,
        matches: (sourcePath) => [
            '.codex/hooks.json',
            '.cursor/hooks.json',
            '.windsurf/hooks.json',
            '.gemini/settings.json',
        ].some((entry) => sourcePathIs(sourcePath, entry)),
        build: (context) => {
            if (sourcePathIs(context.sourcePath, '.codex/hooks.json')) {
                return hookConfigCandidate(context, {
                    adapterId: 'target-hooks:codex-config',
                    targetId: 'codex',
                    outputName: 'codex-hooks.json',
                    scriptSourcePrefix: targetRootedPath(context.sourcePath, '.codex', '.codex/hooks/'),
                    scriptTargetPrefix: '.apm/hooks/scripts/codex/',
                    rewrite: (value) => rewriteTargetProjectHookPath(value, '.codex/hooks', 'scripts/codex/'),
                })
            }
            if (sourcePathIs(context.sourcePath, '.cursor/hooks.json')) {
                return hookConfigCandidate(context, {
                    adapterId: 'target-hooks:cursor-config',
                    targetId: 'cursor',
                    outputName: 'cursor-hooks.json',
                    scriptSourcePrefix: targetRootedPath(context.sourcePath, '.cursor', '.cursor/hooks/'),
                    scriptTargetPrefix: '.apm/hooks/scripts/cursor/',
                    rewrite: (value) => rewriteTargetProjectHookPath(value, '.cursor/hooks', 'scripts/cursor/'),
                })
            }
            if (sourcePathIs(context.sourcePath, '.windsurf/hooks.json')) {
                return hookConfigCandidate(context, {
                    adapterId: 'target-hooks:windsurf-config',
                    targetId: 'windsurf',
                    outputName: 'windsurf-hooks.json',
                    scriptSourcePrefix: targetRootedPath(context.sourcePath, '.windsurf', '.windsurf/hooks/'),
                    scriptTargetPrefix: '.apm/hooks/scripts/windsurf/',
                    rewrite: (value) => rewriteTargetProjectHookPath(value, '.windsurf/hooks', 'scripts/windsurf/'),
                })
            }
            return settingsHooksCandidate({
                context,
                adapterId: 'target-hooks:gemini-settings',
                format: 'target-native',
                targetId: 'gemini',
                markerDir: '.gemini',
                outputName: 'gemini-hooks.json',
                scriptSourcePrefix: targetRootedPath(context.sourcePath, '.gemini', '.gemini/hooks/'),
                scriptTargetPrefix: '.apm/hooks/scripts/gemini/',
                rewrite: (value) => rewriteTargetProjectHookPath(value, '.gemini/hooks', 'scripts/gemini/'),
            })
        },
    },
    {
        id: 'target-hooks:copilot-file',
        format: 'target-native',
        priority: 3,
        matches: (sourcePath) => sourcePathUnder(sourcePath, '.github/hooks/') && sourcePath.endsWith('.json'),
        build: githubHookFileCandidate,
    },
    {
        id: 'target-command-markdown',
        format: 'target-native',
        priority: 4,
        matches: (sourcePath) => commandSpecs.some((spec) => pathMatchesSpec(sourcePath, spec)),
        build: (context) => {
            const spec = commandSpecs.find((entry) => pathMatchesSpec(context.sourcePath, entry))
            return spec ? primitiveMarkdownCandidate(context, spec) : null
        },
    },
    {
        id: 'target-instruction-markdown',
        format: 'target-native',
        priority: 5,
        matches: (sourcePath) => !!standaloneInstructionSpec(sourcePath)
            || instructionSpecs.some((spec) => pathMatchesSpec(sourcePath, spec)),
        build: (context) => {
            const spec = standaloneInstructionSpec(context.sourcePath)
                || instructionSpecs.find((entry) => pathMatchesSpec(context.sourcePath, entry))
            return spec ? primitiveMarkdownCandidate(context, spec) : null
        },
    },
]

export function sourceMatchesTargetImport(sourcePath: string, subpath: string, format: ApmGitHubImportFormat | undefined) {
    return TARGET_IMPORT_ADAPTERS.some((adapter) =>
        adapterAcceptsFormat(adapter, format) && adapter.matches(sourcePath, subpath),
    )
}

export function targetImportPriority(sourcePath: string, subpath: string, format: ApmGitHubImportFormat | undefined) {
    const priorities = TARGET_IMPORT_ADAPTERS
        .filter((adapter) => adapterAcceptsFormat(adapter, format) && adapter.matches(sourcePath, subpath))
        .map((adapter) => adapter.priority)
    return priorities.length > 0 ? Math.min(...priorities) : null
}

export function buildTargetImportCandidates(context: TargetImportBuildContext, format: ApmGitHubImportFormat | undefined, subpath = '') {
    return TARGET_IMPORT_ADAPTERS
        .filter((adapter) => adapterAcceptsFormat(adapter, format) && adapter.matches(context.sourcePath, subpath))
        .map((adapter) => adapter.build(context))
        .filter((candidate): candidate is ImportCandidate => Boolean(candidate))
}
