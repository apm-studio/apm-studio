import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

type TagsInputProps = {
    tags: string[]
    onChange: (tags: string[]) => void
}

export default function TagsInput({ tags, onChange }: TagsInputProps) {
    const [draft, setDraft] = useState('')

    const commitDraft = () => {
        const trimmed = draft.trim()
        if (trimmed && !tags.includes(trimmed)) {
            onChange([...tags, trimmed])
        }
        setDraft('')
    }

    const removeTag = (index: number) => {
        onChange(tags.filter((_, i) => i !== index))
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === ',' || event.key === 'Enter') {
            event.preventDefault()
            commitDraft()
        } else if (event.key === 'Backspace' && !draft && tags.length > 0) {
            removeTag(tags.length - 1)
        }
    }

    return (
        <div className="markdown-editor-frame__field">
            <span className="markdown-editor-frame__field-label">Tags</span>
            <div className="tags-input nodrag nowheel">
                {tags.map((tag, index) => (
                    <span key={`${tag}-${index}`} className="tags-input__chip">
                        {tag}
                        <button type="button" className="tags-input__remove" onClick={() => removeTag(index)} aria-label={`Remove ${tag}`}>
                            <X size={10} aria-hidden="true" />
                        </button>
                    </span>
                ))}
                <input
                    className="tags-input__field nodrag nowheel"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={commitDraft}
                    placeholder={tags.length === 0 ? 'Type and press comma' : ''}
                />
            </div>
        </div>
    )
}
