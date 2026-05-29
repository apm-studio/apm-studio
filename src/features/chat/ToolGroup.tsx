import type { ChatMessageToolInfo } from '../../store/session/chat-message-types'
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { TextShimmer } from '../../components/chat/TextShimmer'
import {
    CodeSearchToolRow,
    CompactContextToolRow,
    EditToolRow,
    GenericToolRow,
    PatchToolRow,
    SearchToolRow,
    ShellToolRow,
    SkillToolRow,
    StandaloneContextToolRow,
    TaskToolRow,
    TodoToolRow,
    WriteToolRow,
} from './ToolSpecificRows'
import {
    CODESEARCH_NAMES,
    CONTEXT_NAMES,
    EDIT_NAMES,
    PATCH_NAMES,
    SEARCH_NAMES,
    SHELL_NAMES,
    SKILL_NAMES,
    TASK_NAMES,
    TODO_NAMES,
    WRITE_NAMES,
} from './tool-group-utils'
import './ToolGroup.css'

/* ═══════════════════════════════════════════════════════
   ToolCallRow — per-tool rendering using BasicTool
   ═══════════════════════════════════════════════════════ */

export function ToolCallRow({ tool, compact = false }: { tool: ChatMessageToolInfo; compact?: boolean }) {
    const isShell = SHELL_NAMES.has(tool.name)
    const isEdit = EDIT_NAMES.has(tool.name)
    const isWrite = WRITE_NAMES.has(tool.name)
    const isPatch = PATCH_NAMES.has(tool.name)
    const isTodo = TODO_NAMES.has(tool.name)
    const isContext = CONTEXT_NAMES.has(tool.name)
    const isSearch = SEARCH_NAMES.has(tool.name)
    const isCodeSearch = CODESEARCH_NAMES.has(tool.name)
    const isTask = TASK_NAMES.has(tool.name)
    const isSkill = SKILL_NAMES.has(tool.name)
    const pending = tool.status === 'pending' || tool.status === 'running'
    const isError = tool.status === 'error'
    const rowProps = { tool, pending, isError }

    /* ── Shell/Bash ── */
    if (isShell) {
        return <ShellToolRow {...rowProps} />
    }

    /* ── Edit (str_replace, multi_replace, etc.) ── */
    if (isEdit) {
        return <EditToolRow {...rowProps} />
    }

    /* ── Write (write_to_file, create_file) ── */
    if (isWrite) {
        return <WriteToolRow {...rowProps} />
    }

    /* ── apply_patch (unified diff) ── */
    if (isPatch) {
        return <PatchToolRow {...rowProps} />
    }

    /* ── Todo ── */
    if (isTodo) {
        return <TodoToolRow {...rowProps} />
    }

    /* ── Context tools (read/glob/grep/list) — compact in group ── */
    if (isContext && compact) {
        return <CompactContextToolRow {...rowProps} />
    }

    /* ── Context tool (standalone, not in group) ── */
    if (isContext) {
        return <StandaloneContextToolRow {...rowProps} />
    }

    /* ── Search tools ── */
    if (isSearch) {
        return <SearchToolRow {...rowProps} />
    }

    /* ── Code search ── */
    if (isCodeSearch) {
        return <CodeSearchToolRow {...rowProps} />
    }

    /* ── Task/Sub-agent ── */
    if (isTask) {
        return <TaskToolRow {...rowProps} />
    }

    /* ── Skill ── */
    if (isSkill) {
        return <SkillToolRow {...rowProps} />
    }

    /* ── Generic fallback ── */
    return <GenericToolRow {...rowProps} />
}

/* ═══════════════════════════════════════════════════════
   ContextToolGroup — batched read/glob/grep/list
   ═══════════════════════════════════════════════════════ */

function ContextToolGroup({ tools }: { tools: ChatMessageToolInfo[] }) {
    const [open, setOpen] = useState(false)
    const running = tools.some((t) => t.status === 'running' || t.status === 'pending')
    const errorCount = tools.filter((t) => t.status === 'error').length

    const summary = useMemo(() => {
        const reads = tools.filter(t => t.name === 'read' || t.name === 'read_file' || t.name === 'view_file' || t.name === 'read_many').length
        const searches = tools.filter(t => t.name === 'grep' || t.name === 'grep_search' || t.name === 'find_by_name').length
        const lists = tools.filter(t => t.name === 'list' || t.name === 'list_dir' || t.name === 'glob').length
        const parts: string[] = []
        if (reads > 0) parts.push(`${reads} read${reads > 1 ? 's' : ''}`)
        if (searches > 0) parts.push(`${searches} search${searches > 1 ? 'es' : ''}`)
        if (lists > 0) parts.push(`${lists} list${lists > 1 ? 's' : ''}`)
        return parts.join(', ') || `${tools.length} tool${tools.length > 1 ? 's' : ''}`
    }, [tools])

    return (
        <div className="context-group">
            <button className="context-group__trigger" onClick={() => setOpen(!open)} type="button">
                <span className="context-group__disclosure" aria-hidden="true">
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className={`context-group__status-dot${errorCount > 0 ? ' context-group__status-dot--error' : ''}`} />
                <span className="context-group__badge">
                    {running ? 'RUN' : 'CTX'}
                </span>
                <span className="context-group__title">
                    <TextShimmer
                        text={running ? 'Gathering context' : 'Gathered context'}
                        active={running}
                    />
                </span>
                {!running && (
                    <span className="context-group__summary">{summary}</span>
                )}
                {errorCount > 0 && (
                    <span className="context-group__error-badge">{errorCount} error{errorCount > 1 ? 's' : ''}</span>
                )}
            </button>
            {open && (
                <div className="context-group__list">
                    {tools.map((tool) => (
                        <ToolCallRow key={tool.callId} tool={tool} compact />
                    ))}
                </div>
            )}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════
   ToolGroup — groups consecutive tools with context batching
   ═══════════════════════════════════════════════════════ */

export function ToolGroup({ tools }: { tools: ChatMessageToolInfo[] }) {
    // Partition tools into context groups and non-context tools
    const segments = useMemo(() => {
        const result: Array<{ kind: 'context'; tools: ChatMessageToolInfo[] } | { kind: 'tool'; tool: ChatMessageToolInfo }> = []
        let contextBuffer: ChatMessageToolInfo[] = []

        for (const tool of tools) {
            if (CONTEXT_NAMES.has(tool.name)) {
                contextBuffer.push(tool)
            } else {
                if (contextBuffer.length > 0) {
                    result.push({ kind: 'context', tools: [...contextBuffer] })
                    contextBuffer = []
                }
                result.push({ kind: 'tool', tool })
            }
        }
        if (contextBuffer.length > 0) {
            result.push({ kind: 'context', tools: contextBuffer })
        }

        return result
    }, [tools])

    return (
        <div className="tool-group-v2">
            {segments.map((seg, idx) => {
                if (seg.kind === 'context') {
                    if (seg.tools.length === 1) {
                        return <ToolCallRow key={`ctx-${idx}`} tool={seg.tools[0]} />
                    }
                    return <ContextToolGroup key={`ctxg-${idx}`} tools={seg.tools} />
                }
                return <ToolCallRow key={seg.tool.callId || `t-${idx}`} tool={seg.tool} />
            })}
        </div>
    )
}
