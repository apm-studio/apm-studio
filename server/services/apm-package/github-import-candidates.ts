import type {
    ApmGitHubImportCandidate,
    ApmGitHubImportRequest,
} from '../../../shared/apm-contracts.js'
import {
    fetchGithubText,
    fetchTree,
} from './github-source.js'
import {
    isApmManifestPath,
    looksLikeClaudeAgentMarkdown,
    looksLikeCodexTomlAgent,
    looksLikeInstructionMarkdown,
    looksLikeMcpConfig,
    looksLikeSkillMarkdown,
    parseClaudeAgentMarkdown,
    parseCodexTomlAgent,
    pathIsInsideSubpath,
} from './github-import-detection.js'
import type { ImportCandidate } from './github-import-candidate-types.js'
import {
    agentCandidateToImportCandidate,
    buildApmManifestCandidate,
    buildInstructionManifest,
    buildMcpManifest,
    buildSkillManifest,
} from './github-import-candidate-builders.js'
import {
    buildTargetImportCandidates,
    sourceMatchesTargetImport,
    targetImportPriority,
} from './target-import/adapters.js'
import { mapWithConcurrency } from './github-import-utils.js'
export type { ImportCandidate } from './github-import-candidate-types.js'

const RAW_FETCH_CONCURRENCY = 6

type CandidateFormat = Exclude<ApmGitHubImportRequest['format'], 'auto' | undefined>

function isExactSubpathFile(sourcePath: string, subpath: string) {
    return !!subpath && sourcePath === subpath
}

function exactFileMatchesFormat(
    sourcePath: string,
    subpath: string,
    requested: ApmGitHubImportRequest['format'],
    format: CandidateFormat,
    extension: string,
) {
    return requested === format
        && isExactSubpathFile(sourcePath, subpath)
        && sourcePath.toLowerCase().endsWith(extension)
}

function sourceMatchesFormat(sourcePath: string, subpath: string, format: ApmGitHubImportRequest['format']) {
    if (format === 'apm') return isApmManifestPath(sourcePath)
    if (format === 'skill-md') return looksLikeSkillMarkdown(sourcePath)
        || exactFileMatchesFormat(sourcePath, subpath, format, 'skill-md', '.md')
    if (format === 'codex-toml') return looksLikeCodexTomlAgent(sourcePath, subpath)
        || exactFileMatchesFormat(sourcePath, subpath, format, 'codex-toml', '.toml')
    if (format === 'claude-md') return looksLikeClaudeAgentMarkdown(sourcePath, subpath)
        || exactFileMatchesFormat(sourcePath, subpath, format, 'claude-md', '.md')
    if (format === 'claude-settings') return sourceMatchesTargetImport(sourcePath, subpath, format)
    if (format === 'target-native') return sourceMatchesTargetImport(sourcePath, subpath, format)
    if (format === 'instruction-md') return looksLikeInstructionMarkdown(sourcePath, subpath)
        || exactFileMatchesFormat(sourcePath, subpath, format, 'instruction-md', '.md')
    if (format === 'mcp-config') return looksLikeMcpConfig(sourcePath, subpath)
        || exactFileMatchesFormat(sourcePath, subpath, format, 'mcp-config', '.json')
    return isApmManifestPath(sourcePath)
        || sourceMatchesTargetImport(sourcePath, subpath, format)
        || looksLikeSkillMarkdown(sourcePath)
        || looksLikeClaudeAgentMarkdown(sourcePath, subpath)
        || looksLikeCodexTomlAgent(sourcePath, subpath)
        || looksLikeInstructionMarkdown(sourcePath, subpath)
        || looksLikeMcpConfig(sourcePath, subpath)
}

function sourcePriority(sourcePath: string, subpath: string) {
    if (isApmManifestPath(sourcePath)) return 0
    const targetPriority = targetImportPriority(sourcePath, subpath, 'auto')
    if (targetPriority !== null) return targetPriority
    if (looksLikeSkillMarkdown(sourcePath)) return 2
    if (looksLikeClaudeAgentMarkdown(sourcePath, subpath)) return 3
    if (looksLikeCodexTomlAgent(sourcePath, subpath)) return 4
    if (looksLikeInstructionMarkdown(sourcePath, subpath)) return 5
    if (looksLikeMcpConfig(sourcePath, subpath)) return 6
    return 7
}

function acceptsFormat(requested: ApmGitHubImportRequest['format'], candidateFormat: Exclude<ApmGitHubImportRequest['format'], 'auto' | undefined>) {
    return requested === 'auto' || !requested || requested === candidateFormat
}

function selectedSourcePathSet(repo: string, ref: string, tree: string[], candidateIds: string[] | undefined) {
    if (!candidateIds?.length) return null
    const prefix = `github:${repo}:${ref}:`
    const selectedIdSet = new Set(candidateIds)
    const sourcePaths = new Set<string>()
    for (const sourcePath of tree) {
        const sourcePrefix = `${prefix}${sourcePath}:`
        for (const candidateId of selectedIdSet) {
            if (candidateId.startsWith(sourcePrefix)) {
                sourcePaths.add(sourcePath)
                break
            }
        }
    }
    return sourcePaths.size > 0 ? sourcePaths : null
}

function sourceIsSkillMarkdown(sourcePath: string, subpath: string, format: ApmGitHubImportRequest['format']) {
    return looksLikeSkillMarkdown(sourcePath)
        || exactFileMatchesFormat(sourcePath, subpath, format, 'skill-md', '.md')
}

function sourceIsCodexToml(sourcePath: string, subpath: string, format: ApmGitHubImportRequest['format']) {
    return looksLikeCodexTomlAgent(sourcePath, subpath)
        || exactFileMatchesFormat(sourcePath, subpath, format, 'codex-toml', '.toml')
}

function sourceIsClaudeMarkdown(sourcePath: string, subpath: string, format: ApmGitHubImportRequest['format']) {
    return looksLikeClaudeAgentMarkdown(sourcePath, subpath)
        || exactFileMatchesFormat(sourcePath, subpath, format, 'claude-md', '.md')
}

function sourceIsInstructionMarkdown(sourcePath: string, subpath: string, format: ApmGitHubImportRequest['format']) {
    return looksLikeInstructionMarkdown(sourcePath, subpath)
        || exactFileMatchesFormat(sourcePath, subpath, format, 'instruction-md', '.md')
}

function sourceIsMcpConfig(sourcePath: string, subpath: string, format: ApmGitHubImportRequest['format']) {
    return looksLikeMcpConfig(sourcePath, subpath)
        || exactFileMatchesFormat(sourcePath, subpath, format, 'mcp-config', '.json')
}

function buildCandidatesFromRaw(input: {
    repo: string
    ref: string
    sourcePath: string
    raw: string
    tree: string[]
    format: ApmGitHubImportRequest['format']
    subpath: string
}) {
    const { repo, ref, sourcePath, raw, tree, format, subpath } = input
    const candidates: ImportCandidate[] = []

    if (acceptsFormat(format, 'apm') && isApmManifestPath(sourcePath)) {
        const candidate = buildApmManifestCandidate(repo, ref, sourcePath, raw, tree)
        if (candidate) return [candidate]
    }

    const targetCandidates = buildTargetImportCandidates({ repo, ref, sourcePath, raw, tree }, format, subpath)
    if (targetCandidates.length > 0) {
        return targetCandidates
    }

    if (acceptsFormat(format, 'skill-md') && sourceIsSkillMarkdown(sourcePath, subpath, format)) {
        candidates.push(buildSkillManifest(repo, ref, sourcePath, raw, tree))
        return candidates
    }
    if (acceptsFormat(format, 'codex-toml') && sourceIsCodexToml(sourcePath, subpath, format)) {
        const agent = parseCodexTomlAgent(sourcePath, raw)
        if (agent) {
            candidates.push(agentCandidateToImportCandidate(repo, ref, agent))
            return candidates
        }
    }
    if (acceptsFormat(format, 'claude-md') && sourceIsClaudeMarkdown(sourcePath, subpath, format)) {
        const agent = parseClaudeAgentMarkdown(sourcePath, raw)
        if (agent) {
            candidates.push(agentCandidateToImportCandidate(repo, ref, agent))
            return candidates
        }
    }
    if (acceptsFormat(format, 'instruction-md') && sourceIsInstructionMarkdown(sourcePath, subpath, format)) {
        candidates.push(buildInstructionManifest(repo, ref, sourcePath, raw))
        return candidates
    }
    if (acceptsFormat(format, 'mcp-config') && sourceIsMcpConfig(sourcePath, subpath, format)) {
        const candidate = buildMcpManifest(repo, ref, sourcePath, raw)
        if (candidate) candidates.push(candidate)
    }

    return candidates
}

export async function buildImportCandidates(
    repo: string,
    ref: string,
    subpath: string,
    format: ApmGitHubImportRequest['format'],
    limit: number,
    selectedCandidateIds?: string[],
): Promise<{ candidates: ImportCandidate[]; totalMatched: number }> {
    const [owner, repoName] = repo.split('/')
    const tree = await fetchTree(owner, repoName, ref)
    const selectedSourcePaths = selectedSourcePathSet(repo, ref, tree, selectedCandidateIds)
    const sourcePaths = tree
        .filter((sourcePath) => pathIsInsideSubpath(sourcePath, subpath))
        .filter((sourcePath) => sourceMatchesFormat(sourcePath, subpath, format || 'auto'))
        .filter((sourcePath) => !selectedSourcePaths || selectedSourcePaths.has(sourcePath))
        .sort((left, right) => sourcePriority(left, subpath) - sourcePriority(right, subpath) || left.localeCompare(right))

    const candidates: ImportCandidate[] = []
    for (let offset = 0; offset < sourcePaths.length && candidates.length < limit;) {
        const batchSize = Math.min(RAW_FETCH_CONCURRENCY, sourcePaths.length - offset, limit - candidates.length)
        const batch = sourcePaths.slice(offset, offset + batchSize)
        offset += batchSize
        const batchCandidates = await mapWithConcurrency(batch, RAW_FETCH_CONCURRENCY, async (sourcePath) => {
            const raw = await fetchGithubText(repo, ref, sourcePath).catch(() => null)
            if (!raw) return []
            return buildCandidatesFromRaw({ repo, ref, sourcePath, raw, tree, format, subpath })
        })

        for (const sourceCandidates of batchCandidates) {
            for (const candidate of sourceCandidates) {
                if (candidates.length >= limit) break
                candidates.push(candidate)
            }
        }
    }

    return { candidates, totalMatched: sourcePaths.length }
}

export function previewCandidate(candidate: ImportCandidate): ApmGitHubImportCandidate {
    return {
        id: candidate.id,
        name: candidate.name,
        description: candidate.description,
        kind: candidate.kind,
        format: candidate.format,
        sourcePath: candidate.sourcePath,
        packageId: candidate.packageId,
        targets: candidate.targets,
        primitiveCounts: candidate.primitiveCounts,
    }
}
