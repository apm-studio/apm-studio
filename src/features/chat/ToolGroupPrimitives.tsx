import { useCallback, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ChatMessageToolInfo } from '../../store/session/chat-message-types'
import { TextShimmer } from '../../components/chat/TextShimmer'
import { DiffChanges } from '../../components/chat/DiffChanges'
import { getDirectory, getFilename } from './tool-group-utils'

interface BasicToolProps {
    badge: string
    trigger?: ReactNode
    title?: string | ReactNode
    subtitle?: string | ReactNode
    status: ChatMessageToolInfo['status']
    duration?: string | null
    actions?: ReactNode
    children?: ReactNode
    hideDetails?: boolean
    defaultOpen?: boolean
    className?: string
}

export function BasicTool({
    badge,
    trigger,
    title,
    subtitle,
    status,
    duration,
    actions,
    children,
    hideDetails,
    defaultOpen = false,
    className = '',
}: BasicToolProps) {
    const pending = status === 'pending' || status === 'running'
    const isError = status === 'error'
    const [open, setOpen] = useState(defaultOpen)
    const hasContent = !!children && !hideDetails
    const canToggle = hasContent && !pending

    const statusClass = `basic-tool--${status}`
    const badgeLabel = pending ? 'RUN' : isError ? 'ERR' : badge

    return (
        <div className={`basic-tool ${statusClass} ${className}`}>
            <button
                className="basic-tool__trigger"
                onClick={() => canToggle && setOpen(!open)}
                type="button"
                style={{ cursor: canToggle ? 'pointer' : 'default' }}
            >
                <span className="basic-tool__disclosure" aria-hidden="true">
                    {canToggle ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : (
                        <span className="basic-tool__disclosure-spacer" />
                    )}
                </span>
                <span className={`basic-tool__status-dot${isError ? ' basic-tool__status-dot--error' : ''}`} />
                <span className={`basic-tool__badge${isError ? ' basic-tool__badge--error' : ''}`}>
                    {badgeLabel}
                </span>
                {trigger ? (
                    <span className="basic-tool__trigger-content">{trigger}</span>
                ) : (
                    <span className="basic-tool__info">
                        <span className="basic-tool__title">
                            {typeof title === 'string' ? (
                                <TextShimmer text={title} active={pending} />
                            ) : title}
                        </span>
                        {!pending && subtitle && (
                            <span className="basic-tool__subtitle">{subtitle}</span>
                        )}
                    </span>
                )}
                {!pending && actions && <span className="basic-tool__actions">{actions}</span>}
                {!pending && duration && <span className="basic-tool__duration">{duration}</span>}
            </button>
            {open && hasContent && (
                <div className="basic-tool__content">{children}</div>
            )}
        </div>
    )
}

export function ToolErrorCard({ error, toolName }: { error: string; toolName: string }) {
    const [copied, setCopied] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const handleCopy = useCallback(async () => {
        await navigator.clipboard.writeText(error)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [error])

    const preview = error.length > 120 ? error.slice(0, 120) + '...' : error

    return (
        <div className="tool-error-card">
            <div className="tool-error-card__header">
                <span className="tool-error-card__pill">ERROR</span>
                <span className="tool-error-card__name">{toolName}</span>
                <button
                    className="tool-error-card__copy"
                    onClick={(e) => { e.stopPropagation(); void handleCopy() }}
                    title={copied ? 'Copied!' : 'Copy error'}
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <button
                className="tool-error-card__body"
                onClick={() => setExpanded(!expanded)}
                type="button"
            >
                <pre className="tool-error-card__text">{expanded ? error : preview}</pre>
                {error.length > 120 && (
                    <span className="tool-error-card__toggle">
                        {expanded ? 'Less' : 'More'}
                    </span>
                )}
            </button>
        </div>
    )
}

export function EditWriteTrigger({
    label,
    pending,
    filename,
    directory,
    diffChanges,
}: {
    label: string
    pending: boolean
    filename: string
    directory: string
    diffChanges?: { additions: number; deletions: number } | null
}) {
    const hasPath = !!filename && !!directory
    return (
        <div className="edit-trigger">
            <div className="edit-trigger__title-area">
                <div className="edit-trigger__title">
                    <span className="edit-trigger__title-text">
                        <TextShimmer text={filename || label} active={pending} />
                    </span>
                    {!pending && hasPath && (
                        <span className="edit-trigger__directory">{directory}</span>
                    )}
                </div>
            </div>
            <div className="edit-trigger__actions">
                {!pending && diffChanges && (diffChanges.additions > 0 || diffChanges.deletions > 0) && (
                    <DiffChanges changes={diffChanges} />
                )}
            </div>
        </div>
    )
}

export function ToolFileAccordion({
    path,
    badge,
    defaultOpen = false,
    children,
}: {
    path: string
    badge?: ReactNode
    defaultOpen?: boolean
    children?: ReactNode
}) {
    const [open, setOpen] = useState(defaultOpen)
    const filename = getFilename(path)
    const directory = getDirectory(path)

    return (
        <div className={`tool-file-accordion${open ? ' tool-file-accordion--open' : ''}`}>
            <button className="tool-file-accordion__header" onClick={() => setOpen(!open)} type="button">
                <span className="tool-file-accordion__disclosure" aria-hidden="true">
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className="tool-file-accordion__name">{filename}</span>
                {directory && <span className="tool-file-accordion__dir">{directory}</span>}
                {badge && <span className="tool-file-accordion__badge">{badge}</span>}
            </button>
            {open && children && (
                <div className="tool-file-accordion__content">{children}</div>
            )}
        </div>
    )
}
