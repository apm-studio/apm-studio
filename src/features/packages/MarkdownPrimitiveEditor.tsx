import type { SyntheticEvent } from 'react'
import { ExternalLink, FileText, Save, X } from 'lucide-react'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import MarkdownRenderer from '../../components/shared/MarkdownRenderer'
import TagsInput from './TagsInput'

import './MarkdownEditorFrame.css'

export type MarkdownPrimitiveEditorProps = {
    title: string
    dirty: boolean
    saveLabel: string
    showOpenButton: boolean
    name: string
    description: string
    tags: string[]
    content: string
    previewContent: string
    helpText: string
    placeholder: string
    saveState: 'unsaved' | 'saved'
    status: null | { tone: 'success' | 'error'; message: string }
    busyLabel: string | null
    selected: boolean
    width: number
    height: number
    transformActive: boolean
    onActivateTransform?: () => void
    onDeactivateTransform?: () => void
    onNameChange: (value: string) => void
    onDescriptionChange: (value: string) => void
    onTagsChange: (tags: string[]) => void
    onContentChange: (value: string) => void
    onSaveDraft: () => void
    onOpen?: () => void
    onClose: () => void
}

export function MarkdownEditorMissing({ onClose }: { onClose: () => void }) {
    return (
        <div className="markdown-editor-frame markdown-editor-frame--missing">
            <div className="markdown-editor-frame__header">
                <span>Draft not found</span>
                <button className="icon-btn" onClick={onClose} title="Close editor">
                    <X size={12} />
                </button>
            </div>
        </div>
    )
}

export default function MarkdownPrimitiveEditor({
    title,
    dirty,
    saveLabel,
    showOpenButton,
    name,
    description,
    tags,
    content,
    previewContent,
    helpText,
    placeholder,
    saveState,
    status,
    busyLabel,
    selected,
    width,
    height,
    transformActive,
    onActivateTransform,
    onDeactivateTransform,
    onNameChange,
    onDescriptionChange,
    onTagsChange,
    onContentChange,
    onSaveDraft,
    onOpen,
    onClose,
}: MarkdownPrimitiveEditorProps) {
    const stopCanvasEvent = (event: SyntheticEvent) => {
        event.stopPropagation()
    }

    return (
        <CanvasWindowFrame
            className="markdown-editor-frame"
            width={width}
            height={height}
            transformActive={transformActive}
            onActivateTransform={onActivateTransform}
            onDeactivateTransform={onDeactivateTransform}
            selected={selected}
            minWidth={420}
            minHeight={300}
            headerStart={(
                <div className="markdown-editor-frame__title">
                    <FileText size={13} />
                    <span className="markdown-editor-frame__title-text">{title}</span>
                    <span className={`markdown-editor-frame__badge markdown-editor-frame__badge--${saveState}`}>
                        {saveState === 'saved' ? 'Saved Draft' : 'Unsaved Draft'}
                    </span>
                    {dirty ? <span className="markdown-editor-frame__dirty">Unsaved Changes</span> : null}
                </div>
            )}
            headerEnd={(
                <div className="markdown-editor-frame__actions">
                    <button className="btn btn--primary btn--sm markdown-editor-frame__action-btn markdown-editor-frame__action-btn--save" onClick={onSaveDraft} disabled={!name.trim()}>
                        <Save size={12} /> {saveLabel}
                    </button>
                    {showOpenButton ? (
                        <button
                            className="btn btn--sm markdown-editor-frame__action-btn"
                            onClick={onOpen}
                            disabled={saveState !== 'saved'}
                            title={saveState === 'saved' ? 'Open the saved Skill folder' : 'Save this draft to create the Skill folder first'}
                        >
                            <ExternalLink size={12} /> Open
                        </button>
                    ) : null}
                    <button className="icon-btn markdown-editor-frame__close-btn" onClick={onClose} title="Close editor">
                        <X size={12} />
                    </button>
                </div>
            )}
        >
            <div className="markdown-editor-frame__help" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                {helpText}
            </div>

            <div className="markdown-editor-frame__meta nodrag nowheel" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                <div className="markdown-editor-frame__meta-row">
                    <label className="markdown-editor-frame__field">
                        <span className="markdown-editor-frame__field-label">Name</span>
                        <input className="text-input nodrag nowheel" value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Enter primitive name" />
                    </label>
                    <TagsInput tags={tags} onChange={onTagsChange} />
                </div>
                <label className="markdown-editor-frame__field">
                    <span className="markdown-editor-frame__field-label">Description</span>
                    <input className="text-input nodrag nowheel" value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="What this primitive does" />
                </label>
            </div>

            <div className="markdown-editor-frame__body" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                <div className="markdown-editor-frame__editor-pane">
                    <span className="markdown-editor-frame__pane-label">Markdown Editor</span>
                    <textarea
                        className="markdown-editor-frame__textarea nodrag nowheel"
                        value={content}
                        onChange={(event) => onContentChange(event.target.value)}
                        spellCheck={false}
                        placeholder={placeholder}
                    />
                </div>
                <div className="markdown-editor-frame__preview-pane">
                    <span className="markdown-editor-frame__pane-label">Markdown Preview</span>
                    <div className="markdown-editor-frame__preview nowheel" onPointerDownCapture={stopCanvasEvent} onClick={stopCanvasEvent}>
                        {previewContent
                            ? <MarkdownRenderer content={previewContent} />
                            : <span className="markdown-editor-frame__preview-empty">Your preview will appear here as you write.</span>}
                    </div>
                </div>
            </div>

            {status ? (
                <div className={`markdown-editor-frame__status markdown-editor-frame__status--${status.tone}`}>
                    {status.message}
                </div>
            ) : null}

            {busyLabel ? (
                <div className="markdown-editor-frame__status">
                    {busyLabel}
                </div>
            ) : null}
        </CanvasWindowFrame>
    )
}
