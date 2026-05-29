import type { ChatMessageToolInfo } from '../../store/session/chat-message-types'

export function formatToolDuration(time: ChatMessageToolInfo['time']) {
    if (!time?.start) return null
    const durationMs = Math.max(0, (time.end || Date.now()) - time.start)
    if (durationMs < 1000) return `${durationMs}ms`
    if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`
    const minutes = Math.floor(durationMs / 60_000)
    const seconds = Math.round((durationMs % 60_000) / 1000)
    return `${minutes}m ${seconds}s`
}

export function getFilename(path: string): string {
    if (!path) return ''
    const parts = path.split('/')
    return parts[parts.length - 1] || path
}

export function getDirectory(path: string): string {
    if (!path.includes('/')) return ''
    const parts = path.split('/')
    return parts.slice(0, -1).join('/') + '/'
}

export function extractShellCommand(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    if (input.command) return String(input.command)
    if (input.CommandLine) return String(input.CommandLine)
    if (Array.isArray(input.args) && input.args.length > 0) return input.args.join(' ')
    return ''
}

export function extractFilePath(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    return String(input.path || input.TargetFile || input.file || input.filePath || input.AbsolutePath || '')
}

export function extractFileContent(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    return String(input.content || input.CodeContent || input.new_string || input.newString || '')
}

export function extractToolMetadata(tool: ChatMessageToolInfo): Record<string, unknown> | undefined {
    return tool.metadata
}

export function extractOldContent(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    return String(input.old_string || input.oldString || input.TargetContent || '')
}

export function extractNewContent(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    return String(input.new_string || input.newString || input.ReplacementContent || '')
}

export function countDiffLines(oldStr: string, newStr: string): { additions: number; deletions: number } {
    const oldLines = oldStr ? oldStr.split('\n').length : 0
    const newLines = newStr ? newStr.split('\n').length : 0
    return {
        additions: Math.max(0, newLines - oldLines + (oldLines > 0 ? oldLines : 0)),
        deletions: oldLines,
    }
}

export function extractPatchText(input: Record<string, unknown> | undefined): string {
    if (!input) return ''
    if (typeof input.diff === 'string') return input.diff
    if (typeof input.patch === 'string') return input.patch
    if (typeof input.content === 'string') return input.content
    return ''
}

export function readToolString(record: Record<string, unknown> | undefined, ...keys: string[]): string {
    if (!record) return ''
    for (const key of keys) {
        const value = record[key]
        if (typeof value === 'string' && value) {
            return value
        }
    }
    return ''
}

export type ApplyPatchMetadataFile = {
    filePath?: string
    relativePath?: string
    type?: 'add' | 'update' | 'delete' | 'move'
    diff?: string
    before?: string
    after?: string
    additions?: number
    deletions?: number
    movePath?: string
}

export function extractApplyPatchFiles(tool: ChatMessageToolInfo): ApplyPatchMetadataFile[] {
    const metadata = extractToolMetadata(tool)
    const files = metadata?.files
    if (!Array.isArray(files)) return []
    return files.filter((file): file is ApplyPatchMetadataFile => !!file && typeof file === 'object')
}

function normalizePatchLookupPath(value: string | undefined): string {
    return (value || '').replace(/\\/g, '/').replace(/^\.\//, '')
}

export function mergeApplyPatchFiles(
    metadataFiles: ApplyPatchMetadataFile[],
    parsedFiles: Array<{ filename: string; diff: string; type: 'add' | 'update' | 'delete' }>,
): ApplyPatchMetadataFile[] {
    if (metadataFiles.length === 0) {
        return parsedFiles.map((file) => ({
            filePath: file.filename,
            relativePath: file.filename,
            type: file.type,
            diff: file.diff,
        }))
    }

    return metadataFiles.map((file) => {
        const metadataPath = normalizePatchLookupPath(file.relativePath || file.filePath)
        const parsedMatch = parsedFiles.find((parsed) => {
            const parsedPath = normalizePatchLookupPath(parsed.filename)
            return parsedPath === metadataPath
                || parsedPath.endsWith(`/${metadataPath}`)
                || metadataPath.endsWith(`/${parsedPath}`)
        })

        if (!parsedMatch) return file

        return {
            ...file,
            type: file.type || parsedMatch.type,
            diff: file.diff || parsedMatch.diff,
        }
    })
}

export function parsePatchFiles(patchText: string): Array<{ filename: string; diff: string; type: 'add' | 'update' | 'delete' }> {
    if (!patchText) return []

    const fileBlocks: Array<{ filename: string; diff: string; type: 'add' | 'update' | 'delete' }> = []
    const lines = patchText.split('\n')
    let currentFile = ''
    let currentDiff: string[] = []
    let currentType: 'add' | 'update' | 'delete' = 'update'

    for (const line of lines) {
        const diffHeader = line.match(/^diff --git a\/(.*?) b\/(.*?)$/)
        const minusFile = line.match(/^--- (?:a\/)?(.+)$/)
        const plusFile = line.match(/^\+\+\+ (?:b\/)?(.+)$/)

        if (diffHeader) {
            if (currentFile && currentDiff.length) {
                fileBlocks.push({ filename: currentFile, diff: currentDiff.join('\n'), type: currentType })
            }
            currentFile = diffHeader[2] || diffHeader[1] || ''
            currentDiff = [line]
            currentType = 'update'
        } else if (plusFile && plusFile[1] !== '/dev/null' && !currentFile) {
            currentFile = plusFile[1]
            currentDiff.push(line)
        } else if (minusFile && minusFile[1] === '/dev/null') {
            currentType = 'add'
            currentDiff.push(line)
        } else if (plusFile && plusFile[1] === '/dev/null') {
            currentType = 'delete'
            currentDiff.push(line)
        } else {
            currentDiff.push(line)
        }
    }

    if (currentFile && currentDiff.length) {
        fileBlocks.push({ filename: currentFile, diff: currentDiff.join('\n'), type: currentType })
    }

    return fileBlocks
}

export const CONTEXT_NAMES = new Set(['read', 'read_file', 'read_many', 'list', 'list_dir', 'glob', 'grep', 'grep_search', 'find_by_name', 'view_file'])
export const SHELL_NAMES = new Set(['bash', 'shell', 'execute_command', 'execute_background_command', 'run_terminal_command', 'run_command'])
export const EDIT_NAMES = new Set(['replace_in_file', 'multi_replace_file_content', 'str_replace_editor', 'replace_file_content', 'edit'])
export const WRITE_NAMES = new Set(['write_to_file', 'create_file', 'write'])
export const PATCH_NAMES = new Set(['apply_patch'])
export const TODO_NAMES = new Set(['todos', 'todowrite', 'todo', 'todoread'])
export const SEARCH_NAMES = new Set(['websearch', 'webfetch', 'search_web', 'read_url_content'])
export const CODESEARCH_NAMES = new Set(['codesearch'])
export const TASK_NAMES = new Set(['task', 'browser_subagent'])
export const SKILL_NAMES = new Set(['skill'])
