import type { MouseEvent, PointerEvent } from 'react'
import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { ChevronUp, GripVertical, Pencil, Server } from 'lucide-react'
import type { McpServerSummary } from '../../../shared/opencode-contracts'
import Tip from '../../features/team/Tip'
import { buildMcpDragPayload } from './package-library-utils'
import { isRemoteDraft, type McpEntryDraft } from './mcp-catalog-utils'
import { McpEntryBody } from './PackageLibraryMcpFields'

function stopDragTrigger(event: PointerEvent | MouseEvent) {
    event.stopPropagation()
}

function describeMcpTransport(entry: McpEntryDraft) {
    return isRemoteDraft(entry) ? 'HTTP' : 'STDIO'
}

function resolveLiveStatus(entry: McpEntryDraft, live: McpServerSummary | null) {
    if (live?.status === 'connected') {
        return 'connected'
    }
    if (entry.enabled === false) {
        return 'disabled'
    }
    return live?.status || 'disconnected'
}

function describeMcpStatus(status: string) {
    switch (status) {
        case 'connected':
            return 'Connected'
        case 'needs_auth':
            return 'Authentication required'
        case 'needs_client_registration':
            return 'OAuth setup required'
        case 'failed':
            return 'Connection failed'
        case 'disabled':
            return 'Startup off'
        default:
            return 'Ready to test'
    }
}

function describeMcpCardSummary({
    entry,
    savedEntry,
    live,
    liveStatus,
    dirty,
}: {
    entry: McpEntryDraft
    savedEntry: McpEntryDraft | null
    live: McpServerSummary | null
    liveStatus: string
    dirty: boolean
}) {
    const entryName = entry.name.trim()
    if (!entryName) return 'Name required'
    if (!savedEntry) return 'Fill in details, then save this server.'
    if (dirty) return 'Unsaved changes'
    if (live?.error) return 'Needs attention'
    if (live?.clientRegistrationRequired) return 'OAuth setup'
    if (liveStatus === 'disabled') return 'Saved with startup off'
    if (liveStatus === 'connected') return 'Ready'
    if (liveStatus === 'needs_auth') return 'Auth needed'
    if (liveStatus === 'failed') return 'Retry connection'
    return 'Ready to connect'
}

function describeMcpDetailTip({
    entry,
    savedEntry,
    live,
    liveStatus,
    dirty,
}: {
    entry: McpEntryDraft
    savedEntry: McpEntryDraft | null
    live: McpServerSummary | null
    liveStatus: string
    dirty: boolean
}) {
    const entryName = entry.name.trim()
    if (!entryName) return 'Add a name before saving this MCP server.'
    if (!savedEntry) return 'This server is only in the editor right now. Save the card to add it to Studio.'
    if (dirty) return 'Test, authenticate, and drag actions always use the saved MCP config. Save this card first.'
    if (live?.error) return live.error
    if (live?.clientRegistrationRequired) {
        return 'This remote MCP needs OAuth client credentials. Save client ID and secret, then authenticate.'
    }
    if (liveStatus === 'disabled') {
        return 'Startup off keeps the server in the library without auto-connecting it. You can still test or connect it later.'
    }
    if (liveStatus === 'needs_auth') {
        return 'Authentication is required before Studio can use this MCP.'
    }
    if (liveStatus === 'failed') {
        return 'The last connection test failed. Check the config and try again.'
    }
    return 'This server is saved and ready for connection tests, auth, and agent assignment.'
}

export type McpCardProps = {
    entry: McpEntryDraft
    savedEntry: McpEntryDraft | null
    live: McpServerSummary | null
    isActive: boolean
    isDirty: boolean
    interactionLocked: boolean
    mcpCatalogSaving: boolean
    pendingMcpAuthName: string | null
    onEdit: () => void
    onChange: (entry: McpEntryDraft) => void
    onSave: () => Promise<void>
    onDiscard: () => void
    onDelete: () => Promise<void>
    onCollapse: () => void
    connectMcpServer: (name: string) => Promise<void>
    startMcpAuthFlow: (name: string) => Promise<void>
    clearMcpAuth: (name: string) => Promise<void>
}

export function McpEditableCard({
    entry,
    savedEntry,
    live,
    isActive,
    isDirty,
    interactionLocked,
    mcpCatalogSaving,
    pendingMcpAuthName,
    onEdit,
    onChange,
    onSave,
    onDiscard,
    onDelete,
    onCollapse,
    connectMcpServer,
    startMcpAuthFlow,
    clearMcpAuth,
}: McpCardProps) {
    const entryName = entry.name.trim()
    const liveStatus = resolveLiveStatus(savedEntry || entry, live)
    const transportLabel = describeMcpTransport(entry)
    const savedName = savedEntry?.name.trim() || ''
    const runtimeActionsLocked = !savedEntry || !savedName || isDirty || mcpCatalogSaving
    const authPending = savedName ? pendingMcpAuthName === savedName : false
    const runtimeEntry = savedEntry || null
    const canAuthenticate = !!runtimeEntry && isRemoteDraft(runtimeEntry) && runtimeEntry.oauthEnabled
    const canClearAuth = canAuthenticate
        && !!live
        && (
            live.authStatus === 'needs_auth'
            || live.status === 'connected'
            || live.status === 'disabled'
            || live.status === 'disconnected'
            || live.status === 'failed'
        )
    const dragPayload = useMemo(() => buildMcpDragPayload({
        name: savedName || entryName || 'New MCP Server',
        status: liveStatus,
        tools: live?.tools || [],
        resources: live?.resources || [],
    }), [entryName, live?.resources, live?.tools, liveStatus, savedName])
    const canDrag = !!savedEntry && !!savedName && !isDirty
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `mcp-editor-${entry.key}`,
        data: dragPayload,
        disabled: !canDrag,
    })
    const rootDragProps = !isActive && canDrag ? { ...attributes, ...listeners } : {}
    const handleDragProps = isActive && canDrag ? { ...attributes, ...listeners } : {}
    const description = describeMcpCardSummary({
        entry,
        savedEntry,
        live,
        liveStatus,
        dirty: isDirty,
    })
    const detailTip = describeMcpDetailTip({
        entry,
        savedEntry,
        live,
        liveStatus,
        dirty: isDirty,
    })
    const actionTip = !savedEntry
        ? 'Save this card before testing or authenticating.'
        : isDirty
            ? 'Save this card before running server actions.'
            : 'Server actions use the saved MCP config.'
    const authLabel = authPending
        ? 'Waiting…'
        : liveStatus === 'connected'
            ? 'Re-authenticate'
            : liveStatus === 'failed'
                ? 'Retry Auth'
                : 'Authenticate'

    return (
        <div
            ref={setNodeRef}
            className={[
                'primitive-card',
                'package-mcp-editor',
                isDragging ? 'is-dragging package-mcp-editor--dragging' : '',
                isActive ? 'is-selected package-mcp-editor--expanded' : '',
                !isActive && canDrag ? 'package-mcp-editor--card-draggable' : '',
            ].filter(Boolean).join(' ')}
            {...rootDragProps}
        >
            <div className="primitive-card__header">
                <button
                    type="button"
                    className={`package-mcp-editor__drag-handle${canDrag ? '' : ' is-disabled'}`}
                    title={canDrag ? 'Drag onto an agent' : 'Save this server before dragging'}
                    {...handleDragProps}
                >
                    <GripVertical size={10} className="drag-handle" />
                </button>
                <Server size={12} className="primitive-icon mcp" />
                <span className="primitive-card__name">{entryName || 'New MCP Server'}</span>
                <div className="package-mcp-editor__header-actions">
                    {isActive ? (
                        savedEntry && !isDirty ? (
                            <button
                                className="package-mcp-editor__collapse-btn"
                                type="button"
                                title="Close editor"
                                onClick={onCollapse}
                                onPointerDown={stopDragTrigger}
                            >
                                <ChevronUp size={11} />
                                <span>Close</span>
                            </button>
                        ) : (
                            <button
                                className="package-mcp-editor__collapse-btn"
                                type="button"
                                title={savedEntry ? 'Discard changes' : 'Discard new server'}
                                onClick={onDiscard}
                                onPointerDown={stopDragTrigger}
                            >
                                <span>Discard</span>
                            </button>
                        )
                    ) : (
                        <button
                            className="primitive-card__edit-btn"
                            type="button"
                            title={interactionLocked ? 'Save or discard the open server first' : 'Edit server'}
                            onClick={(event) => {
                                event.stopPropagation()
                                onEdit()
                            }}
                            onPointerDown={stopDragTrigger}
                            disabled={interactionLocked}
                        >
                            <Pencil size={11} />
                        </button>
                    )}
                </div>
            </div>

            <div className="primitive-card__author">
                <span className={`package-mcp-editor__status-dot package-mcp-editor__status-dot--${liveStatus}`} />
                {[transportLabel, savedEntry ? describeMcpStatus(liveStatus) : 'Not saved'].join(' · ')}
            </div>

            <div className="primitive-card__desc package-mcp-editor__desc-row">
                <span>{description}</span>
                <Tip text={detailTip} />
            </div>

            {isActive ? (
                <>
                    {live?.error && !isDirty ? <div className="package-authoring-hint">{live.error}</div> : null}

                    <McpEntryBody entry={entry} onChange={onChange} />

                    <div className="package-mcp-editor__footer">
                        <div className="package-mcp-editor__footer-note">
                            Card actions
                            <Tip text={actionTip} />
                        </div>

                        <div className="package-mcp-editor__action-stack">
                            <div className="package-mcp-editor__action-row">
                                <button
                                    className={`btn btn--sm${isDirty || !savedEntry ? ' btn--primary' : ''}`}
                                    type="button"
                                    onClick={() => void onSave()}
                                    onPointerDown={stopDragTrigger}
                                    disabled={mcpCatalogSaving || !isDirty}
                                >
                                    {mcpCatalogSaving ? 'Saving…' : savedEntry ? 'Save Changes' : 'Save Server'}
                                </button>
                                {savedEntry ? (
                                    <button
                                        className="btn btn--sm"
                                        type="button"
                                        onClick={onDiscard}
                                        onPointerDown={stopDragTrigger}
                                        disabled={mcpCatalogSaving || !isDirty}
                                    >
                                        Revert
                                    </button>
                                ) : null}
                                {savedEntry ? (
                                    <button
                                        className="btn btn--danger btn--sm"
                                        type="button"
                                        onClick={() => void onDelete()}
                                        onPointerDown={stopDragTrigger}
                                        disabled={mcpCatalogSaving}
                                    >
                                        Delete
                                    </button>
                                ) : null}
                            </div>

                            <div className="package-mcp-editor__action-row">
                                <button
                                    className="btn btn--sm"
                                    type="button"
                                    title={runtimeActionsLocked ? actionTip : 'Test connection'}
                                    onClick={() => savedName && void connectMcpServer(savedName)}
                                    onPointerDown={stopDragTrigger}
                                    disabled={runtimeActionsLocked}
                                >
                                    Test Connection
                                </button>
                                {canAuthenticate ? (
                                    <button
                                        className="btn btn--sm"
                                        type="button"
                                        title={runtimeActionsLocked ? actionTip : 'Authenticate'}
                                        onClick={() => savedName && void startMcpAuthFlow(savedName)}
                                        onPointerDown={stopDragTrigger}
                                        disabled={runtimeActionsLocked || authPending}
                                    >
                                        {authLabel}
                                    </button>
                                ) : null}
                                {canClearAuth ? (
                                    <button
                                        className="btn btn--danger btn--sm"
                                        type="button"
                                        title={runtimeActionsLocked ? actionTip : 'Clear auth'}
                                        onClick={() => savedName && void clearMcpAuth(savedName)}
                                        onPointerDown={stopDragTrigger}
                                        disabled={runtimeActionsLocked || authPending}
                                    >
                                        Clear Auth
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    )
}
