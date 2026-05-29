import { createPortal } from 'react-dom'
import { useRef, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import PackageDetailBody from './PackageDetailBody'
import type { PackagePanelItem, PackagePanelHandler } from './package-panel-types'
import { useResolvedPackageDetail } from './useResolvedPackageDetail'

export function PackagePopover({ item, rect, onEnter, onLeave }: {
    item: PackagePanelItem
    rect: DOMRect
    onEnter: () => void
    onLeave: () => void
}) {
    const { resolvedItem, loading } = useResolvedPackageDetail(item)
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 420))
    const left = rect.right + 8

    return createPortal(
        <div
            className="package-popover"
            style={{ top, left }}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
        >
            <div className="package-popover__title">{resolvedItem?.name || item?.name}</div>
            <PackageDetailBody item={resolvedItem} loading={loading} />
        </div>,
        document.body,
    )
}

export function HoverableCard({
    item,
    children,
}: {
    item: PackagePanelItem
    children: React.ReactNode
}) {
    const [showPopover, setShowPopover] = useState(false)
    const [rect, setRect] = useState<DOMRect | null>(null)
    const ref = useRef<HTMLDivElement>(null)
    const enterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const show = () => {
        clearTimeout(leaveTimer.current)
        enterTimer.current = setTimeout(() => {
            if (ref.current) {
                setRect(ref.current.getBoundingClientRect())
                setShowPopover(true)
            }
        }, 350)
    }

    const scheduleHide = () => {
        clearTimeout(enterTimer.current)
        leaveTimer.current = setTimeout(() => setShowPopover(false), 200)
    }

    const cancelHide = () => {
        clearTimeout(leaveTimer.current)
    }

    return (
        <div ref={ref} onMouseEnter={show} onMouseLeave={scheduleHide} style={{ position: 'relative' }}>
            {children}
            {showPopover && rect && (
                <PackagePopover
                    item={item}
                    rect={rect}
                    onEnter={cancelHide}
                    onLeave={scheduleHide}
                />
            )}
        </div>
    )
}

export function PinnedDetailPanel({
    item,
    onClose,
    onDeleteDraft,
    onUninstall,
    onEditMcp,
    onDeleteMcp,
}: {
    item: PackagePanelItem | null
    onClose: () => void
    onDeleteDraft?: PackagePanelHandler
    onUninstall?: PackagePanelHandler
    onEditMcp?: PackagePanelHandler
    onDeleteMcp?: PackagePanelHandler
}) {
    const { resolvedItem, loading } = useResolvedPackageDetail(item)

    if (!item) {
        return (
            <div className="package-detail-panel package-detail-panel--empty">
                <div className="package-detail-panel__empty-copy">
                    Click a card to pin its details here.
                </div>
            </div>
        )
    }

    return (
        <div className="package-detail-panel">
            <div className="package-detail-panel__header">
                <div>
                    <div className="section-title">Pinned Details</div>
                    <div className="package-detail-panel__title">{resolvedItem?.name || item.name}</div>
                </div>
                <button className="icon-btn" onClick={onClose} title="Clear detail panel">
                    <X size={14} />
                </button>
            </div>
            {resolvedItem?.source === 'draft' && onDeleteDraft ? (
                <div className="btns">
                    <button className="btn btn--danger" onClick={() => onDeleteDraft(resolvedItem)}>
                        <Trash2 size={11} style={{ marginRight: 4 }} /> Delete Draft
                    </button>
                </div>
            ) : null}
            {resolvedItem?.kind === 'mcp' && (onEditMcp || onDeleteMcp) ? (
                <div className="btns">
                    {onEditMcp ? (
                        <button className="btn" onClick={() => onEditMcp(resolvedItem)}>
                            Edit Server
                        </button>
                    ) : null}
                    {onDeleteMcp ? (
                        <button className="btn btn--danger" onClick={() => onDeleteMcp(resolvedItem)}>
                            <Trash2 size={11} style={{ marginRight: 4 }} /> Remove Server
                        </button>
                    ) : null}
                </div>
            ) : null}
            {(resolvedItem?.source === 'user' || resolvedItem?.source === 'workspace') && onUninstall ? (
                <div className="btns">
                    <button className="btn btn--danger" onClick={() => onUninstall(resolvedItem)}>
                        <Trash2 size={11} style={{ marginRight: 4 }} /> Uninstall
                    </button>
                </div>
            ) : null}
            <PackageDetailBody item={resolvedItem} loading={loading} />
        </div>
    )
}
