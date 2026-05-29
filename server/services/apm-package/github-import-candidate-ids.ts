import crypto from 'crypto'
import path from 'path'
import type { AgentCandidate } from './github-import-detection.js'
import { DEFAULT_STUDIO_MODEL } from './github-import-constants.js'
import { slugify } from './github-import-utils.js'

export function packageIdForAgentCandidate(repo: string, ref: string, candidate: AgentCandidate) {
    const hash = crypto
        .createHash('sha1')
        .update(`${repo}:${ref}:${candidate.sourcePath}:${candidate.adapter}`)
        .digest('hex')
        .slice(0, 8)
    return `${slugify(candidate.name)}-${hash}`
}

export function packageIdForSource(repo: string, ref: string, sourcePath: string, name: string, format: string) {
    const hash = crypto
        .createHash('sha1')
        .update(`${repo}:${ref}:${sourcePath}:${format}`)
        .digest('hex')
        .slice(0, 8)
    return `${slugify(name, 'package')}-${hash}`
}

export function candidateId(repo: string, ref: string, sourcePath: string, format: string) {
    return `github:${repo}:${ref}:${sourcePath}:${format}`
}

export function githubSource(repo: string, ref: string, sourcePath: string, format: string) {
    return {
        type: 'github',
        repo,
        ref,
        path: sourcePath,
        format,
    }
}

export function sourceRootForManifest(sourcePath: string) {
    const dir = path.posix.dirname(sourcePath)
    return dir === '.' ? '' : dir
}

export function modelSelection(candidate: AgentCandidate) {
    if (candidate.adapter === 'codex-toml' && candidate.model?.includes('/')) {
        const [provider, ...rest] = candidate.model.split('/')
        return { provider, modelId: rest.join('/') || candidate.model }
    }
    if (candidate.adapter === 'codex-toml' && candidate.model) {
        return { provider: 'openai', modelId: candidate.model }
    }
    return DEFAULT_STUDIO_MODEL
}
