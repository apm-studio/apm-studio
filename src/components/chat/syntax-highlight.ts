import hljs from 'highlight.js/lib/core'

import bash from 'highlight.js/lib/languages/bash'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('diff', diff)

hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('tsx', typescript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('jsx', javascript)
hljs.registerLanguage('py', python)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('zsh', bash)
hljs.registerLanguage('cs', csharp)

export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

export function langFromFilename(filename: string): string | undefined {
    if (!filename) return undefined
    const ext = filename.split('.').pop()?.toLowerCase()
    if (!ext) return undefined
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        py: 'python', css: 'css', json: 'json', html: 'xml', xml: 'xml', svg: 'xml',
        sh: 'bash', bash: 'bash', zsh: 'bash',
        md: 'markdown', yaml: 'yaml', yml: 'yaml',
        sql: 'sql', go: 'go', rs: 'rust',
        java: 'java', cs: 'csharp',
        diff: 'diff', patch: 'diff',
    }
    return map[ext]
}

export function highlightCode(code: string, lang?: string) {
    if (!code) return ''
    try {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value
        }
        const result = hljs.highlightAuto(code)
        return result.value
    } catch {
        return escapeHtml(code)
    }
}

export function highlightLine(content: string, lang?: string) {
    if (!content) return '&nbsp;'
    if (content === ' ') return ' '
    try {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(content, { language: lang }).value
        }
    } catch {
        // Fall through to plain escaped text when line-level highlighting fails.
    }
    return escapeHtml(content)
}
