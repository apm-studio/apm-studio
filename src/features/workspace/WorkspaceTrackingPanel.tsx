import { useCallback, useEffect, useRef, useState } from 'react'
import { FileCode, Github, X } from 'lucide-react'
import { opencodeApi } from '../../api-clients/opencode'
import { useStudioStore } from '../../store'
import type { FileStatusSummary, OpenCodeFileReadResponse } from '../../../shared/opencode-contracts'
import '../assistant/AssistantChat.css'
import './WorkspaceTrackingPanel.css'

type FilePreview = {
    path: string
    content: string
    error?: string
}

function readFilePreviewContent(value: OpenCodeFileReadResponse) {
    return typeof value.content === 'string' ? value.content : ''
}

export function WorkspaceTrackingPanel() {
    const isTrackingOpen = useStudioStore((state) => state.isTrackingOpen)
    const setTrackingOpen = useStudioStore((state) => state.setTrackingOpen)
    const workingDir = useStudioStore((state) => state.workingDir)
    const [files, setFiles] = useState<FileStatusSummary[]>([])
    const [selectedPath, setSelectedPath] = useState<string | null>(null)
    const [preview, setPreview] = useState<FilePreview | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [panelWidth, setPanelWidth] = useState(320)
    const dragging = useRef(false)

    const fetchFiles = useCallback(async () => {
        try {
            const res = await opencodeApi.file.status()
            setFiles(res || [])
        } catch {
            setFiles([])
        }
    }, [])

    const onResizeMouseDown = useCallback((event: React.MouseEvent) => {
        event.preventDefault()
        dragging.current = true
        const startX = event.clientX
        const startW = panelWidth
        const onMove = (moveEvent: MouseEvent) => {
            if (!dragging.current) return
            setPanelWidth(Math.min(520, Math.max(260, startW + (startX - moveEvent.clientX))))
        }
        const onUp = () => {
            dragging.current = false
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [panelWidth])

    useEffect(() => {
        if (!isTrackingOpen) {
            return
        }

        const initialRefresh = window.setTimeout(() => void fetchFiles(), 0)
        const interval = window.setInterval(() => void fetchFiles(), 10000)
        return () => {
            window.clearTimeout(initialRefresh)
            window.clearInterval(interval)
        }
    }, [fetchFiles, isTrackingOpen])

    useEffect(() => {
        if (!isTrackingOpen || !selectedPath) {
            return
        }

        let cancelled = false
        const previewRefresh = window.setTimeout(() => {
            setPreviewLoading(true)
            opencodeApi.file.read(selectedPath)
                .then((result) => {
                    if (cancelled) return
                    setPreview({
                        path: selectedPath,
                        content: readFilePreviewContent(result),
                    })
                })
                .catch((error: unknown) => {
                    if (cancelled) return
                    setPreview({
                        path: selectedPath,
                        content: '',
                        error: error instanceof Error ? error.message : 'Unable to read file.',
                    })
                })
                .finally(() => {
                    if (!cancelled) {
                        setPreviewLoading(false)
                    }
                })
        }, 0)

        return () => {
            cancelled = true
            window.clearTimeout(previewRefresh)
        }
    }, [isTrackingOpen, selectedPath])

    if (!isTrackingOpen) return null

    const isClean = files.length === 0
    const statusLabel = isClean ? 'Clean' : `${files.length} file${files.length === 1 ? '' : 's'}`

    return (
        <div className="assistant-panel workspace-tracking-panel" style={{ width: panelWidth }}>
            <div className="assistant-resize-handle" onMouseDown={onResizeMouseDown} />

            <div className="assistant-header">
                <div className="assistant-header__meta">
                    <div className="assistant-header__title">
                        <div className="assistant-header__icon">
                            <Github size={14} />
                        </div>
                        <span>Workspace Tracking</span>
                    </div>
                    <div className="assistant-header__subtitle">
                        <span title={workingDir || undefined}>{workingDir || 'Working tree status'}</span>
                        <span className={`assistant-status-pill workspace-tracking-panel__status-pill ${isClean ? '' : 'is-dirty'}`.trim()}>
                            {statusLabel}
                        </span>
                    </div>
                </div>
                <div className="assistant-header__actions">
                    <button
                        className="icon-btn assistant-header__close"
                        onClick={() => setTrackingOpen(false)}
                        title="Hide Workspace Tracking"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            <div className="assistant-content workspace-tracking-panel__content">
                {files.length === 0 ? (
                    <div className="assistant-empty workspace-tracking-panel__empty">
                        <Github size={40} className="assistant-empty__icon" />
                        <h3 className="assistant-empty__title">Working tree is clean</h3>
                        <p className="assistant-empty__desc">
                            No uncommitted files detected in this workspace.
                        </p>
                    </div>
                ) : (
                    <ul className="workspace-tracking-panel__list">
                        {files.map((file) => (
                            <li key={file.path} className={`workspace-tracking-panel__item ${selectedPath === file.path ? 'is-selected' : ''}`.trim()}>
                                <button
                                    className="workspace-tracking-panel__file-button"
                                    type="button"
                                    onClick={() => setSelectedPath((current) => current === file.path ? null : file.path)}
                                    title={file.path}
                                >
                                <FileCode size={12} className={`workspace-tracking-panel__icon workspace-tracking-panel__icon--${file.status}`} />
                                <div className="workspace-tracking-panel__info">
                                    <span className="workspace-tracking-panel__path" title={file.path}>
                                        {file.path.split('/').pop()}
                                    </span>
                                    {file.path.includes('/') ? (
                                        <span className="workspace-tracking-panel__dir">
                                            {file.path.slice(0, file.path.lastIndexOf('/'))}
                                        </span>
                                    ) : null}
                                </div>
                                <div className="workspace-tracking-panel__stats">
                                    {file.added > 0 ? <span className="workspace-tracking-panel__added">+{file.added}</span> : null}
                                    {file.removed > 0 ? <span className="workspace-tracking-panel__removed">-{file.removed}</span> : null}
                                </div>
                                </button>
                                {selectedPath === file.path ? (
                                    <div className="workspace-tracking-panel__preview">
                                        {previewLoading ? (
                                            <span className="workspace-tracking-panel__preview-muted">Loading…</span>
                                        ) : preview?.error ? (
                                            <span className="workspace-tracking-panel__preview-muted">{preview.error}</span>
                                        ) : (
                                            <pre>{(preview?.content || '').slice(0, 4000) || 'No text content.'}</pre>
                                        )}
                                    </div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
