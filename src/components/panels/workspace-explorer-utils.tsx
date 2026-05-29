import type { WorkspaceAgentNode } from '../../../shared/workspace-contracts'
/* eslint-disable react-refresh/only-export-components */
/**
 * workspace-explorer-utils.ts – Pure helpers, types, and sub-components
 * extracted from WorkspaceExplorer.tsx.
 *
 * Contains: types, data-building functions (session groupers, thread-row builder),
 * and presentational sub-components (LayerRow, SessionNameEditor, SessionRowActions).
 */

import type { ReactNode } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { parseStudioSessionTitle } from '../../../shared/session-metadata'
import type { FocusSnapshot } from '../../store/workspace/types'
import { resolveNodeBaselineHidden } from '../../lib/focus-utils'

// ── Types ───────────────────────────────────────────────

export type AgentSessionRecord = {
    id: string
    title?: string
    sidebarTitle?: string
    createdAt?: number
    updatedAt?: number
    parentId?: string | null
}

export type AgentSessionRow = {
    session: AgentSessionRecord
    agentId: string
    active: boolean
}

export type AgentSessionTreeRow = AgentSessionRow & {
    children: AgentSessionTreeRow[]
    depth: number
}

export type ExplorerRenamingSession = null | {
    key: string
    kind: 'agent'
    sessionId: string
    value: string
}

export type ThreadRow = {
    id: string
    kind: 'agent'
    label: string
    meta: string
    hidden: boolean
    active: boolean
    children: AgentSessionTreeRow[]
}

// ── Pure helpers ────────────────────────────────────────

export function workspaceLabel(workingDir: string) {
    const normalized = workingDir.trim().replace(/[\\/]+$/, '')
    return normalized.split(/[/\\]/).pop() || 'Workspace'
}

export function workspaceShortPath(workingDir: string) {
    const trimmed = workingDir.trim()
    const separator = trimmed.includes('\\') && !trimmed.includes('/') ? '\\' : '/'
    const normalized = trimmed.replace(/[\\/]+$/, '')
    const segments = normalized.split(/[/\\]/).filter(Boolean)
    return segments.length > 2 ? `...${separator}${segments.slice(-2).join(separator)}` : workingDir
}

export function buildAgentSessionRows(
    sessions: AgentSessionRecord[],
    agents: WorkspaceAgentNode[],
    chatKeyToSession: Record<string, string>,
): AgentSessionRow[] {
    const rows = sessions
        .map((session) => {
            const metadata = parseStudioSessionTitle(session.title)
            const agentId = metadata?.agentId || null
            const agent = agentId ? agents.find((item) => item.id === agentId) || null : null
            if (!agent) {
                return null
            }
            return {
                session,
                agentId,
                active: chatKeyToSession[agent.id] === session.id,
            }
        })
        .filter((entry): entry is AgentSessionRow => !!entry && typeof entry.agentId === 'string')

    const seen = new Set<string>()
    return rows.filter((entry) => {
        if (seen.has(entry.session.id)) {
            return false
        }
        seen.add(entry.session.id)
        return true
    })
}

function compareSessionRows(left: AgentSessionRow, right: AgentSessionRow) {
    const activityDelta = resolveSessionActivityAt(right.session) - resolveSessionActivityAt(left.session)
    if (activityDelta !== 0) {
        return activityDelta
    }
    return (right.session.createdAt || 0) - (left.session.createdAt || 0)
}

function buildAgentSessionTree(entries: AgentSessionRow[]): AgentSessionTreeRow[] {
    const nodeById = new Map<string, AgentSessionTreeRow>()
    entries.forEach((entry) => {
        nodeById.set(entry.session.id, {
            ...entry,
            children: [],
            depth: 0,
        })
    })

    const roots: AgentSessionTreeRow[] = []
    nodeById.forEach((node) => {
        const parentId = node.session.parentId || null
        const parent = parentId ? nodeById.get(parentId) || null : null
        if (parent && parent.agentId === node.agentId) {
            parent.children.push(node)
            return
        }
        roots.push(node)
    })

    const sortTree = (nodes: AgentSessionTreeRow[], depth = 0): AgentSessionTreeRow[] => (
        [...nodes]
            .sort(compareSessionRows)
            .map((node) => ({
                ...node,
                depth,
                children: sortTree(node.children, depth + 1),
            }))
    )

    return sortTree(roots)
}

export function groupAgentSessionsById(agentSessionRows: AgentSessionRow[]) {
    const groupedRows = new Map<string, AgentSessionRow[]>()
    agentSessionRows.forEach((entry) => {
        const current = groupedRows.get(entry.agentId) || []
        current.push(entry)
        groupedRows.set(entry.agentId, current)
    })
    const map = new Map<string, AgentSessionTreeRow[]>()
    groupedRows.forEach((entries, agentId) => {
        map.set(agentId, buildAgentSessionTree(entries))
    })
    return map
}

export function resolveSessionActivityAt(
    session: Pick<AgentSessionRecord, 'createdAt' | 'updatedAt'>,
    latestMessageTimestamp?: number | null,
) {
    return Math.max(
        session.updatedAt || 0,
        session.createdAt || 0,
        latestMessageTimestamp || 0,
    )
}

export function resolveTeamThreadActivityAt(
    thread: { createdAt?: number; participantSessions?: Record<string, string> },
    sessionActivityById: Record<string, number>,
) {
    const participantActivity = Object.values(thread.participantSessions || {}).reduce(
        (latest, sessionId) => Math.max(latest, sessionActivityById[sessionId] || 0),
        0,
    )
    return Math.max(thread.createdAt || 0, participantActivity)
}

export function buildThreadRows(args: {
    sharedAgents: WorkspaceAgentNode[]
    editingTarget: { type: 'agent'; id: string } | null
    agentSessionsById: Map<string, AgentSessionTreeRow[]>
    focusSnapshot: FocusSnapshot | null
    selectedAgentId: string | null
    selectedAgentSessionId: string | null
}): ThreadRow[] {
    return args.sharedAgents.map((agent) => ({
        id: agent.id,
        kind: 'agent',
        label: agent.name,
        meta: agent.model?.modelId || 'No model selected',
        hidden: resolveNodeBaselineHidden(args.focusSnapshot, agent.id, 'agent', !!agent.hidden),
        active: (args.selectedAgentId === agent.id) || (args.editingTarget?.type === 'agent' && args.editingTarget.id === agent.id),
        children: args.agentSessionsById.get(agent.id) || [],
    }))
}

// ── Sub-components ──────────────────────────────────────

export function LayerRow({
    icon,
    label,
    meta,
    metaTone = 'default',
    active = false,
    onClick,
    actions,
    muted = false,
}: {
    icon: ReactNode
    label: ReactNode
    meta?: string
    metaTone?: 'default' | 'success' | 'warn' | 'danger'
    active?: boolean
    muted?: boolean
    onClick?: () => void
    actions?: ReactNode
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            className={`layer-row ${active ? 'active' : ''} ${muted ? 'muted' : ''}`}
            onClick={onClick}
            onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && onClick) {
                    event.preventDefault()
                    onClick()
                }
            }}
        >
            <span className="layer-row__icon">{icon}</span>
            <span className="layer-row__body">
                <span className="layer-row__label">{label}</span>
                {meta ? (
                    <span className={`layer-row__meta layer-row__meta--${metaTone}`}>
                        {meta}
                    </span>
                ) : null}
            </span>
            {actions ? (
                <span
                    className="layer-row__actions"
                    onClick={(event) => event.stopPropagation()}
                >
                    {actions}
                </span>
            ) : null}
        </div>
    )
}

export function SessionNameEditor({
    renaming,
    display,
    onChange,
    onCommit,
    onCancel,
}: {
    renaming: ExplorerRenamingSession
    display: ReactNode
    onChange: (value: string) => void
    onCommit: () => void
    onCancel: () => void
}) {
    if (!renaming) {
        return <>{display}</>
    }

    return (
        <input
            autoFocus
            className="thread-inline-input"
            value={renaming.value}
            onChange={(event) => onChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault()
                    onCommit()
                } else if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancel()
                }
            }}
        />
    )
}

export function SessionRowActions({
    renaming,
    onCommit,
    onCancel,
    onRename,
    onDelete,
    renameTitle,
    deleteTitle,
}: {
    renaming: ExplorerRenamingSession
    onCommit: () => void
    onCancel: () => void
    onRename: () => void
    onDelete: () => void
    renameTitle: string
    deleteTitle: string
}) {
    if (renaming) {
        return (
            <>
                <button className="icon-btn" onClick={onCommit} title="Save name">
                    <Check size={10} />
                </button>
                <button className="icon-btn" onClick={onCancel} title="Cancel rename">
                    <X size={10} />
                </button>
            </>
        )
    }

    return (
        <>
            <button className="icon-btn" onClick={onRename} title={renameTitle}>
                <Pencil size={10} />
            </button>
            <button className="icon-btn remove-btn" onClick={onDelete} title={deleteTitle}>
                <Trash2 size={10} />
            </button>
        </>
    )
}
