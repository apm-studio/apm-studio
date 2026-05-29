import { useMemo } from 'react'

import { highlightCode, langFromFilename } from './syntax-highlight'
import './SyntaxBlock.css'

interface SyntaxBlockProps {
    /** Code content */
    code: string
    /** Explicit language (overrides filename detection) */
    language?: string
    /** Filename for language detection and display */
    filename?: string
    /** Show line numbers */
    lineNumbers?: boolean
    /** Max height before scroll */
    maxHeight?: number
    /** Style variant */
    variant?: 'default' | 'diff-old' | 'diff-new'
}

/**
 * Syntax-highlighted code block using highlight.js.
 * Reuses the same github-dark theme already loaded by MarkdownRenderer.
 */
export function SyntaxBlock({
    code,
    language,
    filename,
    lineNumbers = true,
    maxHeight = 400,
    variant = 'default',
}: SyntaxBlockProps) {
    const lang = language || langFromFilename(filename || '')
    const highlighted = useMemo(() => highlightCode(code, lang), [code, lang])
    const lines = useMemo(() => code.split('\n'), [code])

    return (
        <div
            className={`syntax-block syntax-block--${variant}`}
            style={{ maxHeight: `${maxHeight}px` }}
            data-scrollable
        >
            <pre className="syntax-block__pre">
                {lineNumbers && (
                    <span className="syntax-block__gutter" aria-hidden="true">
                        {lines.map((_, i) => (
                            <span key={i} className="syntax-block__line-num">{i + 1}</span>
                        ))}
                    </span>
                )}
                <code
                    className={`syntax-block__code hljs${lang ? ` language-${lang}` : ''}`}
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                />
            </pre>
        </div>
    )
}
