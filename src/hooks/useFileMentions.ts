import { useState, useEffect, useRef, type RefObject } from 'react'
import { api } from '../api'

export interface FileMention {
    name: string
    path: string
    absolute: string
    type: string
}

export type ParsedFileMention = {
    query: string
    startIndex: number
} | null

export function parseFileMention(value: string, cursorPosition: number): ParsedFileMention {
    const textBeforeCursor = value.slice(0, cursorPosition)
    const match = /(^|\s)#\s*([^\n#]*)$/.exec(textBeforeCursor)

    if (!match) return null

    const prefix = match[1] || ''
    const rawQuery = match[2] || ''

    return {
        query: rawQuery.trim(),
        startIndex: match.index + prefix.length,
    }
}

export function useFileMentions(externalInputRef?: RefObject<HTMLTextAreaElement | null>) {
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionResults, setMentionResults] = useState<FileMention[]>([])
    const [mentionIndex, setMentionIndex] = useState(0)
    const [isMentioning, setIsMentioning] = useState(false)
    const fallbackRef = useRef<HTMLTextAreaElement>(null)
    const inputRef = externalInputRef || fallbackRef

    function checkMention(value?: string, cursorPosition?: number | null) {
        const input = inputRef.current
        const sourceValue = typeof value === 'string' ? value : input?.value
        const cursor = typeof cursorPosition === 'number' ? cursorPosition : input?.selectionStart
        if (typeof sourceValue !== 'string' || typeof cursor !== 'number') return
        const mention = parseFileMention(sourceValue, cursor)

        if (mention) {
            setIsMentioning(true)
            setMentionQuery(mention.query)
        } else {
            setIsMentioning(false)
            setMentionQuery(null)
            setMentionResults([])
        }
    }

    useEffect(() => {
        if (mentionQuery === null) return

        let active = true
        async function fetchFiles() {
            try {
                const res = await api.workspace.findFiles(mentionQuery || '')
                if (active) {
                    setMentionResults(res.filter(f => f.type === 'file'))
                    setMentionIndex(0)
                }
            } catch (err) {
                console.error("Mention search error", err)
            }
        }

        const timer = setTimeout(fetchFiles, 150)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [mentionQuery])

    function extractMentionText() {
        if (!inputRef.current) return null
        const cursor = inputRef.current.selectionStart
        const text = inputRef.current.value

        const mention = parseFileMention(text, cursor)
        if (!mention) return null

        const newText = text.slice(0, mention.startIndex) + text.slice(cursor)

        setIsMentioning(false)
        setMentionQuery(null)
        setMentionResults([])

        return newText
    }

    return {
        inputRef,
        isMentioning,
        mentionResults,
        mentionIndex,
        setMentionIndex,
        checkMention,
        extractMentionText,
        setIsMentioning,
    }
}
