import { useMemo } from 'react'

import {
    buildDiffRowsFromContent,
    buildDiffRowsFromRawDiff,
    buildUnifiedDiffRows,
} from './diff-block-rows'
import { highlightLine, langFromFilename } from './syntax-highlight'
import './SyntaxBlock.css'

/**
 * Inline diff view: unified, IDE-like diff viewer for either raw patches or before/after content.
 */
export function DiffBlock(props: {
    before: string
    after: string
    filename?: string
    rawDiff?: string
    maxHeight?: number
}) {
    const {
        before,
        after,
        rawDiff,
        maxHeight = 400,
    } = props

    const lang = langFromFilename(props.filename || '')
    const rows = useMemo(() => {
        if (rawDiff) {
            return buildDiffRowsFromRawDiff(rawDiff, props.filename)
        }
        return buildDiffRowsFromContent(before, after)
    }, [after, before, props.filename, rawDiff])
    const unifiedRows = useMemo(() => buildUnifiedDiffRows(rows), [rows])

    return (
        <div className="diff-block" style={{ maxHeight: `${maxHeight}px` }} data-scrollable>
            {unifiedRows.map((row, index) => (
                <div
                    key={`${row.type}:${index}:${row.content}`}
                    className="diff-block__row"
                    data-diff-type={row.type === 'unchanged' ? undefined : row.type}
                    data-type={row.type}
                >
                    <span className="diff-block__marker" aria-hidden="true">
                        {row.type === 'removed' ? '-' : row.type === 'added' ? '+' : ' '}
                    </span>
                    <code
                        className={`diff-block__code hljs${lang ? ` language-${lang}` : ''}`}
                        dangerouslySetInnerHTML={{ __html: highlightLine(row.content, lang) }}
                    />
                </div>
            ))}
        </div>
    )
}
