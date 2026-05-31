import fs from 'fs/promises'
import path from 'path'
import {
    normalizeApmPackageScope,
    type ApmGitHubImportPackage,
    type ApmGitHubImportPreviewResponse,
    type ApmGitHubImportRequest,
    type ApmGitHubImportResponse,
} from '../../../shared/apm-contracts.js'
import { getApmUserScopeCwd } from '../../lib/apm-studio-paths.js'
import { packageDir, manifestPath, toPosixPath } from './paths.js'
import { writeApmPackage } from './repository.js'
import { parseSource, type ParsedSource } from './source-ref.js'
import {
    fetchTree,
    fetchGithubText,
    fetchRepoMetadata,
    normalizeRepoPath,
} from './github-source.js'
import { importLimit } from './github-import-constants.js'
import {
    buildImportCandidates,
    previewCandidate,
    type ImportCandidate,
} from './github-import-candidates.js'

async function copyCandidateFiles(workingDir: string, repo: string, ref: string, candidate: ImportCandidate) {
    if (candidate.copyFiles.length === 0) return
    const root = packageDir(workingDir, candidate.packageId)
    for (const file of candidate.copyFiles) {
        const raw = await fetchGithubText(repo, ref, file.sourcePath)
        const target = path.join(root, file.targetPath)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, raw, 'utf-8')
    }
}

async function canFetchTree(owner: string, repo: string, ref: string) {
    try {
        await fetchTree(owner, repo, ref)
        return true
    } catch {
        return false
    }
}

async function resolveRefAndSubpath(
    parsed: ParsedSource,
    request: ApmGitHubImportRequest,
    defaultBranch: string,
) {
    const requestedRef = request.ref?.trim()
    if (!parsed.refPath) {
        return {
            ref: requestedRef || parsed.ref?.trim() || defaultBranch,
            subpath: normalizeRepoPath(parsed.subpath),
        }
    }

    const refPath = normalizeRepoPath(parsed.refPath)
    if (!refPath) {
        return {
            ref: requestedRef || parsed.ref?.trim() || defaultBranch,
            subpath: normalizeRepoPath(parsed.subpath),
        }
    }

    if (requestedRef) {
        const prefix = `${requestedRef}/`
        return {
            ref: requestedRef,
            subpath: normalizeRepoPath(refPath === requestedRef ? '' : refPath.startsWith(prefix) ? refPath.slice(prefix.length) : parsed.subpath),
        }
    }

    const normalizedDefaultBranch = normalizeRepoPath(defaultBranch)
    if (normalizedDefaultBranch && (refPath === normalizedDefaultBranch || refPath.startsWith(`${normalizedDefaultBranch}/`))) {
        return {
            ref: defaultBranch,
            subpath: normalizeRepoPath(refPath.slice(normalizedDefaultBranch.length)),
        }
    }

    const segments = refPath.split('/').filter(Boolean)
    for (let count = segments.length; count >= 1; count -= 1) {
        const candidateRef = segments.slice(0, count).join('/')
        if (await canFetchTree(parsed.owner, parsed.repo, candidateRef)) {
            return {
                ref: candidateRef,
                subpath: segments.slice(count).join('/'),
            }
        }
    }

    return {
        ref: parsed.ref?.trim() || defaultBranch,
        subpath: normalizeRepoPath(parsed.subpath),
    }
}

export async function previewApmPackagesFromGitHub(
    request: ApmGitHubImportRequest,
): Promise<ApmGitHubImportPreviewResponse> {
    if (!request.source?.trim()) {
        throw new Error('source is required.')
    }

    const parsed = parseSource(request.source)
    const repo = `${parsed.owner}/${parsed.repo}`
    const metadata = await fetchRepoMetadata(parsed.owner, parsed.repo)
    const { ref, subpath } = await resolveRefAndSubpath(parsed, request, metadata.defaultBranch)
    const format = request.format || 'auto'
    const limit = importLimit(request.limit)
    const { candidates, totalMatched } = await buildImportCandidates(repo, ref, subpath, format, limit)
    const warnings: string[] = []
    if (candidates.length === 0) {
        warnings.push(`No importable ${format === 'auto' ? 'APM, agent, skill, instruction, or MCP' : format} files found in ${request.source}.`)
    }
    if (candidates.length >= limit && totalMatched > candidates.length) {
        warnings.push(`Showing the first ${candidates.length} candidates. Narrow the source path or raise the limit to inspect more.`)
    }

    return {
        ok: true,
        source: {
            repo,
            ref,
            ...(subpath ? { subpath } : {}),
            href: metadata.href,
            ...(typeof metadata.stars === 'number' ? { stars: metadata.stars } : {}),
        },
        candidates: candidates.map(previewCandidate),
        warnings,
    }
}

export async function importApmPackagesFromGitHub(
    workingDir: string,
    request: ApmGitHubImportRequest,
): Promise<ApmGitHubImportResponse> {
    if (!request.source?.trim()) {
        throw new Error('source is required.')
    }

    const parsed = parseSource(request.source)
    const repo = `${parsed.owner}/${parsed.repo}`
    const metadata = await fetchRepoMetadata(parsed.owner, parsed.repo)
    const { ref, subpath } = await resolveRefAndSubpath(parsed, request, metadata.defaultBranch)
    const format = request.format || 'auto'
    const limit = importLimit(request.limit)
    const { candidates, totalMatched } = await buildImportCandidates(repo, ref, subpath, format, limit)
    const selectedIds = new Set((request.candidateIds || []).filter(Boolean))
    const selectedCandidates = selectedIds.size > 0
        ? candidates.filter((candidate) => selectedIds.has(candidate.id))
        : candidates
    const scope = normalizeApmPackageScope(request.scope)
    const targetWorkingDir = scope === 'user' ? getApmUserScopeCwd() : workingDir
    const warnings: string[] = []
    const packages: ApmGitHubImportPackage[] = []

    for (const candidate of selectedCandidates) {
        const written = await writeApmPackage(targetWorkingDir, candidate.packageId, candidate.manifest)
        await copyCandidateFiles(targetWorkingDir, repo, ref, candidate)
        packages.push({
            packageId: written.packageId,
            name: candidate.name,
            kind: candidate.kind,
            sourcePath: candidate.sourcePath,
            packagePath: toPosixPath(path.relative(targetWorkingDir, packageDir(targetWorkingDir, written.packageId))),
            manifestPath: toPosixPath(path.relative(targetWorkingDir, manifestPath(targetWorkingDir, written.packageId))),
        })
    }

    if (packages.length === 0) {
        throw new Error(`No importable ${format === 'auto' ? 'APM, agent, skill, instruction, or MCP' : format} files found in ${request.source}.`)
    }
    if (packages.length >= limit && totalMatched > packages.length) {
        warnings.push(`Imported the first ${packages.length} packages. Narrow the source path or raise the limit to import more.`)
    }

    return {
        ok: true,
        scope,
        targetWorkingDir,
        source: {
            repo,
            ref,
            ...(subpath ? { subpath } : {}),
            href: metadata.href,
            ...(typeof metadata.stars === 'number' ? { stars: metadata.stars } : {}),
        },
        packages,
        warnings,
    }
}

export { listApmGitHubSourceItems } from './github-source-catalog.js'
