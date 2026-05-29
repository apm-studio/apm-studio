import { parsePatch } from 'diff'

export type DiffRow = {
    left: string
    right: string
    type: 'added' | 'removed' | 'unchanged' | 'modified'
}

export type UnifiedDiffRow = {
    content: string
    type: 'added' | 'removed' | 'unchanged'
}

function splitContentLines(content: string): string[] {
    return content === '' ? [] : content.split('\n')
}

function normalizeDiffLineContent(content: string) {
    return content === '' ? ' ' : content
}

export function buildDiffRowsFromContent(before: string, after: string): DiffRow[] {
    const beforeLines = splitContentLines(before)
    const afterLines = splitContentLines(after)

    let prefix = 0
    while (
        prefix < beforeLines.length
        && prefix < afterLines.length
        && beforeLines[prefix] === afterLines[prefix]
    ) {
        prefix += 1
    }

    let suffix = 0
    while (
        suffix < beforeLines.length - prefix
        && suffix < afterLines.length - prefix
        && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
    ) {
        suffix += 1
    }

    const rows: DiffRow[] = []

    for (let index = 0; index < prefix; index += 1) {
        rows.push({
            left: normalizeDiffLineContent(beforeLines[index] ?? ''),
            right: normalizeDiffLineContent(beforeLines[index] ?? ''),
            type: 'unchanged',
        })
    }

    const beforeMiddle = beforeLines.slice(prefix, beforeLines.length - suffix)
    const afterMiddle = afterLines.slice(prefix, afterLines.length - suffix)

    const middleLength = Math.max(beforeMiddle.length, afterMiddle.length)
    for (let index = 0; index < middleLength; index += 1) {
        const left = beforeMiddle[index]
        const right = afterMiddle[index]

        if (left !== undefined && right !== undefined) {
            rows.push({
                left: normalizeDiffLineContent(left),
                right: normalizeDiffLineContent(right),
                type: 'modified',
            })
            continue
        }

        if (left !== undefined) {
            rows.push({
                left: normalizeDiffLineContent(left),
                right: '',
                type: 'removed',
            })
            continue
        }

        if (right !== undefined) {
            rows.push({
                left: '',
                right: normalizeDiffLineContent(right),
                type: 'added',
            })
        }
    }

    for (let index = 0; index < suffix; index += 1) {
        rows.push({
            left: normalizeDiffLineContent(beforeLines[beforeLines.length - suffix + index] ?? ''),
            right: normalizeDiffLineContent(beforeLines[beforeLines.length - suffix + index] ?? ''),
            type: 'unchanged',
        })
    }

    return rows
}

function pairDiffGroup(lines: string[], startIndex: number) {
    const removals: string[] = [lines[startIndex].slice(1)]
    let cursor = startIndex + 1

    while (cursor < lines.length && lines[cursor]?.startsWith('-')) {
        removals.push(lines[cursor].slice(1))
        cursor += 1
    }

    const additions: string[] = []
    while (cursor < lines.length && lines[cursor]?.startsWith('+')) {
        additions.push(lines[cursor].slice(1))
        cursor += 1
    }

    const rows: DiffRow[] = []
    const size = Math.max(removals.length, additions.length)
    for (let index = 0; index < size; index += 1) {
        const left = removals[index]
        const right = additions[index]

        if (left !== undefined && right !== undefined) {
            rows.push({
                left: normalizeDiffLineContent(left),
                right: normalizeDiffLineContent(right),
                type: 'modified',
            })
            continue
        }

        if (left !== undefined) {
            rows.push({
                left: normalizeDiffLineContent(left),
                right: '',
                type: 'removed',
            })
            continue
        }

        if (right !== undefined) {
            rows.push({
                left: '',
                right: normalizeDiffLineContent(right),
                type: 'added',
            })
        }
    }

    return { rows, nextIndex: cursor }
}

function buildDiffRowsFromLoosePatch(rawDiff: string): DiffRow[] {
    const rows: DiffRow[] = []
    const lines = rawDiff.split('\n')
    let inHunk = false

    for (let index = 0; index < lines.length; ) {
        const line = lines[index] ?? ''
        if (line.startsWith('@@')) {
            inHunk = true
            index += 1
            continue
        }

        if (!inHunk || line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('\\')) {
            index += 1
            continue
        }

        if (line.startsWith('-')) {
            const paired = pairDiffGroup(lines, index)
            rows.push(...paired.rows)
            index = paired.nextIndex
            continue
        }

        if (line.startsWith('+')) {
            rows.push({
                left: '',
                right: normalizeDiffLineContent(line.slice(1)),
                type: 'added',
            })
            index += 1
            continue
        }

        rows.push({
            left: normalizeDiffLineContent(line.startsWith(' ') ? line.slice(1) : line),
            right: normalizeDiffLineContent(line.startsWith(' ') ? line.slice(1) : line),
            type: 'unchanged',
        })
        index += 1
    }

    return rows
}

function ensurePatchHeaders(rawDiff: string, filename?: string) {
    if (!rawDiff.includes('@@') || rawDiff.includes('--- ') || rawDiff.includes('+++ ')) {
        return rawDiff
    }

    const safeFilename = (filename || 'file').replace(/^\/+/, '')
    return [`--- a/${safeFilename}`, `+++ b/${safeFilename}`, rawDiff].join('\n')
}

export function buildDiffRowsFromRawDiff(rawDiff: string, filename?: string): DiffRow[] {
    const patchText = ensurePatchHeaders(rawDiff, filename)

    try {
        const patches = parsePatch(patchText)
        const rows: DiffRow[] = []

        for (const patch of patches) {
            for (const hunk of patch.hunks ?? []) {
                const lines = hunk.lines ?? []
                for (let index = 0; index < lines.length; ) {
                    const line = lines[index] ?? ''
                    const prefix = line[0]
                    const content = line.slice(1)

                    if (prefix === '-') {
                        const paired = pairDiffGroup(lines, index)
                        rows.push(...paired.rows)
                        index = paired.nextIndex
                        continue
                    }

                    if (prefix === '+') {
                        rows.push({
                            left: '',
                            right: normalizeDiffLineContent(content),
                            type: 'added',
                        })
                        index += 1
                        continue
                    }

                    if (prefix === ' ') {
                        rows.push({
                            left: normalizeDiffLineContent(content),
                            right: normalizeDiffLineContent(content),
                            type: 'unchanged',
                        })
                        index += 1
                        continue
                    }

                    index += 1
                }
            }
        }

        if (rows.length > 0) {
            return rows
        }
    } catch (error) {
        console.error('Failed to parse patch:', error)
    }

    return buildDiffRowsFromLoosePatch(rawDiff)
}

export function buildUnifiedDiffRows(rows: DiffRow[]): UnifiedDiffRow[] {
    return rows.reduce<UnifiedDiffRow[]>((result, row) => {
        if (row.type === 'modified') {
            result.push(
                { content: row.left, type: 'removed' as const },
                { content: row.right, type: 'added' as const },
            )
            return result
        }

        if (row.type === 'removed') {
            result.push({ content: row.left, type: 'removed' as const })
            return result
        }

        if (row.type === 'added') {
            result.push({ content: row.right, type: 'added' as const })
            return result
        }

        result.push({ content: row.left, type: 'unchanged' as const })
        return result
    }, [])
}
