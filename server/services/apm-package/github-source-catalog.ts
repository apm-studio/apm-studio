import type {
    ApmGitHubSourceCatalogRequest,
    ApmGitHubSourceCatalogResponse,
    ApmGitHubSourceCatalogSource,
    ApmGitHubSourceItem,
} from '../../../shared/apm-contracts.js'
import {
    fetchGithubRawText,
    fetchRepoMetadata,
    fetchTree,
    SOURCE_ADAPTERS,
    type SourceAdapter,
} from './github-source.js'
import {
    categoryFromAgentPath,
    looksLikeClaudeAgentMarkdown,
    looksLikeCodexTomlAgent,
    parseClaudeAgentMarkdown,
    parseCodexTomlAgent,
    type AgentCandidate,
} from './github-import-detection.js'
import {
    ALL_TARGET_LABELS,
    catalogLimit,
} from './github-import-constants.js'

function uniqueStrings(values: Array<string | null | undefined>) {
    const seen = new Set<string>()
    const result: string[] = []
    for (const value of values) {
        const normalized = value?.trim()
        if (!normalized) continue
        const key = normalized.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        result.push(normalized)
    }
    return result
}

function agentCandidateToCatalogItem(
    adapter: SourceAdapter,
    ref: string,
    candidate: AgentCandidate,
): ApmGitHubSourceItem {
    const repo = `${adapter.owner}/${adapter.repo}`
    const id = `github:${repo}:${ref}:${candidate.sourcePath}`
    return {
        id,
        kind: 'agent',
        name: candidate.name,
        description: candidate.description,
        sourceName: adapter.name,
        repo,
        href: `${adapter.href}/blob/${ref}/${candidate.sourcePath}`,
        sourcePath: candidate.sourcePath,
        tags: uniqueStrings([
            'agent',
            candidate.adapter === 'claude-md' ? 'claude' : 'codex',
            categoryFromAgentPath(candidate.sourcePath),
            ...(candidate.tools || []).slice(0, 2).map((tool) => tool.toLowerCase()),
        ]),
        targets: ALL_TARGET_LABELS,
        stars: adapter.stars,
        importRequest: {
            source: `${repo}/${candidate.sourcePath}`,
            format: candidate.adapter,
            limit: 1,
        },
    }
}

function parseAwesomeAgentSkillRows(raw: string) {
    const rows: ApmGitHubSourceItem[] = []
    const lines = raw.replace(/\r\n/g, '\n').split('\n')
    let section = 'Skills'

    for (const line of lines) {
        const sectionMatch = line.match(/^###\s+(.+)$/) || line.match(/^<summary><h3[^>]*>(.+?)<\/h3><\/summary>$/)
        if (sectionMatch) {
            section = sectionMatch[1].replace(/<[^>]+>/g, '').trim() || section
            continue
        }

        const match = line.match(/^- \*\*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\*\* - (.+)$/)
        if (!match) continue

        const [, label, href, description] = match
        const [owner, ...nameParts] = label.split('/')
        const name = nameParts.join('/') || label
        const repoMatch = href.match(/^https:\/\/github\.com\/([^/]+\/[^/#?]+)/)
        const sourceUrl = repoMatch ? `https://github.com/${repoMatch[1].replace(/\.git$/, '')}` : href
        rows.push({
            id: `awesome-agent-skills:${label}`,
            kind: 'skill',
            name,
            description: description.trim(),
            sourceName: 'Agent Skills Index',
            repo: 'VoltAgent/awesome-agent-skills',
            href,
            sourceUrl,
            sourcePath: 'README.md',
            tags: uniqueStrings(['skill', owner, section.toLowerCase().replace(/^skills by\s+/, '')]).slice(0, 4),
            targets: ['Claude', 'Codex', 'OpenCode', 'Cursor'],
        })
    }

    return rows
}

async function listSubagentItems(adapter: SourceAdapter, limit: number) {
    const metadata = await fetchRepoMetadata(adapter.owner, adapter.repo, adapter)
    const ref = metadata.defaultBranch
    const tree = await fetchTree(adapter.owner, adapter.repo, ref)
    const candidatePaths = tree
        .filter((sourcePath) => looksLikeClaudeAgentMarkdown(sourcePath, '') || looksLikeCodexTomlAgent(sourcePath, ''))
    const sourcePaths = candidatePaths.slice(0, limit)
    const rawCandidates = await Promise.all(sourcePaths.map(async (sourcePath) => {
        const raw = await fetchGithubRawText(adapter.owner, adapter.repo, ref, sourcePath).catch(() => null)
        if (!raw) return null
        return looksLikeCodexTomlAgent(sourcePath, '')
            ? parseCodexTomlAgent(sourcePath, raw)
            : parseClaudeAgentMarkdown(sourcePath, raw)
    }))

    return {
        source: {
            id: adapter.id,
            name: adapter.name,
            repo: `${adapter.owner}/${adapter.repo}`,
            ref,
            href: metadata.href,
            stars: metadata.stars,
        } satisfies ApmGitHubSourceCatalogSource,
        primitives: rawCandidates
            .filter((candidate): candidate is AgentCandidate => !!candidate)
            .map((candidate) => agentCandidateToCatalogItem({ ...adapter, href: metadata.href, stars: metadata.stars }, ref, candidate)),
        totalCandidates: candidatePaths.length,
    }
}

async function listAgentSkillItems(adapter: SourceAdapter, limit: number) {
    const metadata = await fetchRepoMetadata(adapter.owner, adapter.repo, adapter)
    const ref = metadata.defaultBranch
    const raw = await fetchGithubRawText(adapter.owner, adapter.repo, ref, 'README.md')
    const parsedItems = parseAwesomeAgentSkillRows(raw)
    return {
        source: {
            id: adapter.id,
            name: adapter.name,
            repo: `${adapter.owner}/${adapter.repo}`,
            ref,
            href: metadata.href,
            stars: metadata.stars,
        } satisfies ApmGitHubSourceCatalogSource,
        primitives: parsedItems.slice(0, limit),
        totalCandidates: parsedItems.length,
    }
}

async function listPresetItems(adapter: SourceAdapter) {
    const metadata = await fetchRepoMetadata(adapter.owner, adapter.repo, adapter)
    const ref = metadata.defaultBranch
    const repo = `${adapter.owner}/${adapter.repo}`
    return {
        source: {
            id: adapter.id,
            name: adapter.name,
            repo,
            ref,
            href: metadata.href,
            stars: metadata.stars,
        } satisfies ApmGitHubSourceCatalogSource,
        primitives: [{
            id: `github:${repo}:${ref}`,
            kind: 'package',
            name: adapter.name,
            description: `Scan ${repo} and import detected APM packages, Skills, agents, instructions, and MCP configs.`,
            sourceName: adapter.name,
            repo,
            href: metadata.href,
            tags: uniqueStrings(['preset', 'github', adapter.repo]),
            targets: ALL_TARGET_LABELS,
            stars: metadata.stars,
            importRequest: {
                source: repo,
                format: 'auto',
                limit: 400,
            },
        } satisfies ApmGitHubSourceItem],
        totalCandidates: 1,
    }
}

export async function listApmGitHubSourceItems(
    request: ApmGitHubSourceCatalogRequest = {},
): Promise<ApmGitHubSourceCatalogResponse> {
    const requestedSources = request.sources?.length
        ? new Set(request.sources)
        : null
    const limit = catalogLimit(request.limitPerSource)
    const adapters = SOURCE_ADAPTERS.filter((adapter) => !requestedSources || requestedSources.has(adapter.id))
    const warnings: string[] = []
    const sources: ApmGitHubSourceCatalogSource[] = []
    const primitives: ApmGitHubSourceItem[] = []

    for (const adapter of adapters) {
        try {
            const result = adapter.kind === 'agents'
                ? await listSubagentItems(adapter, limit)
                : adapter.kind === 'skills'
                    ? await listAgentSkillItems(adapter, limit)
                    : await listPresetItems(adapter)
            sources.push(result.source)
            primitives.push(...result.primitives)
            if (result.totalCandidates > result.primitives.length) {
                warnings.push(`${adapter.name}: showing ${result.primitives.length} of ${result.totalCandidates} converted primitives.`)
            }
        } catch (error) {
            warnings.push(`${adapter.name}: ${error instanceof Error ? error.message : 'Unable to convert source.'}`)
        }
    }

    const sortedSources = sources.sort((left, right) => (right.stars || 0) - (left.stars || 0) || left.name.localeCompare(right.name))
    const sourceRank = new Map(sortedSources.map((source, index) => [source.repo.toLowerCase(), index]))
    const sortedItems = primitives.sort((left, right) => {
        const rankDelta = (sourceRank.get(left.repo.toLowerCase()) ?? 999) - (sourceRank.get(right.repo.toLowerCase()) ?? 999)
        if (rankDelta !== 0) return rankDelta
        return (right.stars || 0) - (left.stars || 0) || left.name.localeCompare(right.name)
    })

    return {
        ok: true,
        sources: sortedSources,
        primitives: sortedItems,
        warnings,
    }
}
