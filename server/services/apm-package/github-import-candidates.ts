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
export type { ImportCandidate } from './github-import-candidate-types.js'

function sourceMatchesFormat(sourcePath: string, subpath: string, format: ApmGitHubImportRequest['format']) {
    if (format === 'apm') return isApmManifestPath(sourcePath)
    if (format === 'skill-md') return looksLikeSkillMarkdown(sourcePath)
    if (format === 'codex-toml') return looksLikeCodexTomlAgent(sourcePath, subpath)
    if (format === 'claude-md') return looksLikeClaudeAgentMarkdown(sourcePath, subpath)
    if (format === 'claude-settings') return sourceMatchesTargetImport(sourcePath, subpath, format)
    if (format === 'target-native') return sourceMatchesTargetImport(sourcePath, subpath, format)
    if (format === 'instruction-md') return looksLikeInstructionMarkdown(sourcePath, subpath)
    if (format === 'mcp-config') return looksLikeMcpConfig(sourcePath, subpath)
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

export async function buildImportCandidates(
    repo: string,
    ref: string,
    subpath: string,
    format: ApmGitHubImportRequest['format'],
    limit: number,
): Promise<{ candidates: ImportCandidate[]; totalMatched: number }> {
    const [owner, repoName] = repo.split('/')
    const tree = await fetchTree(owner, repoName, ref)
    const sourcePaths = tree
        .filter((sourcePath) => pathIsInsideSubpath(sourcePath, subpath))
        .filter((sourcePath) => sourceMatchesFormat(sourcePath, subpath, format || 'auto'))
        .sort((left, right) => sourcePriority(left, subpath) - sourcePriority(right, subpath) || left.localeCompare(right))

    const candidates: ImportCandidate[] = []
    for (const sourcePath of sourcePaths) {
        if (candidates.length >= limit) break
        const raw = await fetchGithubText(repo, ref, sourcePath).catch(() => null)
        if (!raw) continue

        if (acceptsFormat(format, 'apm') && isApmManifestPath(sourcePath)) {
            const candidate = buildApmManifestCandidate(repo, ref, sourcePath, raw, tree)
            if (candidate) {
                candidates.push(candidate)
                continue
            }
        }
        const targetCandidates = buildTargetImportCandidates({ repo, ref, sourcePath, raw, tree }, format, subpath)
        if (targetCandidates.length > 0) {
            for (const candidate of targetCandidates) {
                if (candidates.length >= limit) break
                candidates.push(candidate)
            }
            if (candidates.length >= limit) {
                break
            }
            continue
        }
        if (acceptsFormat(format, 'skill-md') && looksLikeSkillMarkdown(sourcePath)) {
            candidates.push(buildSkillManifest(repo, ref, sourcePath, raw, tree))
            continue
        }
        if (acceptsFormat(format, 'codex-toml') && looksLikeCodexTomlAgent(sourcePath, subpath)) {
            const agent = parseCodexTomlAgent(sourcePath, raw)
            if (agent) {
                candidates.push(agentCandidateToImportCandidate(repo, ref, agent))
                continue
            }
        }
        if (acceptsFormat(format, 'claude-md') && looksLikeClaudeAgentMarkdown(sourcePath, subpath)) {
            const agent = parseClaudeAgentMarkdown(sourcePath, raw)
            if (agent) {
                candidates.push(agentCandidateToImportCandidate(repo, ref, agent))
                continue
            }
        }
        if (acceptsFormat(format, 'instruction-md') && looksLikeInstructionMarkdown(sourcePath, subpath)) {
            candidates.push(buildInstructionManifest(repo, ref, sourcePath, raw))
            continue
        }
        if (acceptsFormat(format, 'mcp-config') && looksLikeMcpConfig(sourcePath, subpath)) {
            const candidate = buildMcpManifest(repo, ref, sourcePath, raw)
            if (candidate) {
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
