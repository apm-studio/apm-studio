import path from 'path'
import { slugify } from './github-import-utils.js'

export type AgentCandidate = {
    adapter: 'codex-toml' | 'claude-md'
    name: string
    description: string
    instruction: string
    sourcePath: string
    model?: string | null
    modelVariant?: string | null
    tools?: string[]
}

export function pathIsInsideSubpath(filePath: string, subpath: string) {
    if (!subpath) return true
    return filePath === subpath || filePath.startsWith(`${subpath}/`)
}

function isReadmePath(filePath: string) {
    return /^readme\.md$/i.test(path.posix.basename(filePath))
}

export function looksLikeClaudeAgentMarkdown(filePath: string, subpath: string) {
    if (!filePath.endsWith('.md') || isReadmePath(filePath)) return false
    if (subpath && filePath === subpath) return true
    return filePath.includes('.claude/agents/')
        || filePath.includes('/agents/')
        || filePath.includes('/subagents/')
        || filePath.startsWith('agents/')
        || filePath.startsWith('subagents/')
        || filePath.startsWith('categories/')
}

function parseInlineList(value: string) {
    return value
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
}

export function parseFrontmatter(raw: string) {
    const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')
    if (lines[0]?.trim() !== '---') return null
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (end < 0) return null

    const data: Record<string, string | string[]> = {}
    for (const line of lines.slice(1, end)) {
        const match = line.match(/^([^:#]+):\s*(.*)$/)
        if (!match) continue
        const key = match[1].trim()
        const rawValue = match[2].trim()
        if (!rawValue) continue
        const unquoted = rawValue.replace(/^['"]|['"]$/g, '')
        data[key] = key === 'tools' ? parseInlineList(unquoted) : unquoted
    }

    return {
        data,
        content: lines.slice(end + 1).join('\n').trim(),
    }
}

export function isApmManifestPath(sourcePath: string) {
    return /(^|\/)apm\.ya?ml$/i.test(sourcePath)
}

export function looksLikeSkillMarkdown(sourcePath: string) {
    return /(^|\/)SKILL\.md$/i.test(sourcePath)
}

export function looksLikeCodexTomlAgent(sourcePath: string, subpath: string) {
    if (!sourcePath.endsWith('.toml')) return false
    if (subpath && sourcePath === subpath) return true
    return sourcePath.includes('.codex/agents/')
        || sourcePath.startsWith('agents/')
        || sourcePath.includes('/agents/')
        || sourcePath.startsWith('categories/')
}

export function looksLikeInstructionMarkdown(sourcePath: string, subpath: string) {
    if (!sourcePath.endsWith('.md') || isReadmePath(sourcePath) || looksLikeSkillMarkdown(sourcePath)) return false
    if (looksLikePromptMarkdown(sourcePath, subpath)) return false
    if (subpath && sourcePath === subpath) return true
    return sourcePath.includes('.github/instructions/')
        || sourcePath.startsWith('instructions/')
        || sourcePath.includes('/instructions/')
        || /\.instructions\.md$/i.test(sourcePath)
}

function looksLikePromptMarkdown(sourcePath: string, subpath: string) {
    if (!sourcePath.endsWith('.md') || isReadmePath(sourcePath) || looksLikeSkillMarkdown(sourcePath)) return false
    if (subpath && sourcePath === subpath) {
        return /\.prompt\.md$/i.test(sourcePath)
            || sourcePath.startsWith('prompts/')
            || sourcePath.includes('/prompts/')
    }
    return /\.prompt\.md$/i.test(sourcePath)
        || sourcePath.startsWith('prompts/')
        || sourcePath.includes('/prompts/')
}

export function looksLikeMcpConfig(sourcePath: string, subpath: string) {
    const base = path.posix.basename(sourcePath).toLowerCase()
    if (subpath && sourcePath === subpath) return base.endsWith('.json')
    const targetMcpPaths = [
        '.codex/mcp.json',
        '.cursor/mcp.json',
        '.vscode/mcp.json',
        '.github/mcp.json',
        '.claude/mcp.json',
        '.gemini/mcp.json',
        '.windsurf/mcp_config.json',
        'opencode.json',
        '.opencode/opencode.json',
    ]
    return base === 'mcp.json'
        || base === '.mcp.json'
        || base === 'mcp-servers.json'
        || base === 'mcp_config.json'
        || targetMcpPaths.some((entry) => sourcePath === entry || sourcePath.endsWith(`/${entry}`))
}

export function firstParagraph(raw: string, fallback: string) {
    const paragraph = raw
        .replace(/^---[\s\S]*?---/, '')
        .split(/\n\s*\n/)
        .map((entry) => entry.replace(/^#+\s*/, '').trim())
        .find(Boolean)
    return paragraph?.slice(0, 220) || fallback
}

export function parseClaudeAgentMarkdown(sourcePath: string, raw: string): AgentCandidate | null {
    const parsed = parseFrontmatter(raw)
    if (!parsed) return null
    const name = typeof parsed.data.name === 'string' ? parsed.data.name.trim() : ''
    const description = typeof parsed.data.description === 'string' ? parsed.data.description.trim() : ''
    const instruction = parsed.content.trim()
    if (!name || !description || !instruction) return null
    return {
        adapter: 'claude-md',
        name,
        description,
        instruction,
        sourcePath,
        model: typeof parsed.data.model === 'string' ? parsed.data.model.trim() : null,
        tools: Array.isArray(parsed.data.tools) ? parsed.data.tools : [],
    }
}

export function categoryFromAgentPath(sourcePath: string) {
    const match = sourcePath.match(/^categories\/\d+-([^/]+)\//)
    return match ? match[1].replace(/-/g, ' ') : null
}

function unquoteTomlString(value: string) {
    const trimmed = value.trim()
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            return JSON.parse(trimmed) as string
        } catch {
            return trimmed.slice(1, -1)
        }
    }
    return trimmed
}

export function parseCodexTomlAgent(sourcePath: string, raw: string): AgentCandidate | null {
    const result: Record<string, string> = {}
    const lines = raw.replace(/\r\n/g, '\n').split('\n')
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/)
        if (!match) continue
        const key = match[1]
        if (!['name', 'description', 'model', 'model_reasoning_effort', 'developer_instructions'].includes(key)) continue

        let value = match[2].trim()
        if (value.startsWith('"""')) {
            value = value.slice(3)
            const block: string[] = []
            if (value.endsWith('"""')) {
                block.push(value.slice(0, -3))
            } else {
                if (value) block.push(value)
                index += 1
                while (index < lines.length) {
                    const nextLine = lines[index]
                    const end = nextLine.indexOf('"""')
                    if (end >= 0) {
                        block.push(nextLine.slice(0, end))
                        break
                    }
                    block.push(nextLine)
                    index += 1
                }
            }
            result[key] = block.join('\n').trim()
            continue
        }
        result[key] = unquoteTomlString(value)
    }

    const name = result.name?.trim() || slugify(path.posix.basename(sourcePath, '.toml'))
    const instruction = result.developer_instructions?.trim()
    if (!name || !instruction) return null
    return {
        adapter: 'codex-toml',
        name,
        description: result.description?.trim() || `${name} Codex agent`,
        instruction,
        sourcePath,
        model: result.model?.trim() || null,
        modelVariant: result.model_reasoning_effort ? `reasoning-${result.model_reasoning_effort}` : null,
    }
}
