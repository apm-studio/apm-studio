import { useEffect, useState, type RefObject } from 'react'
import { loadMaterialFileIconForPath } from '../../lib/material-file-icons'
import type { FileMention } from '../../hooks/useFileMentions'
import type { SkillSearchItem } from './agent-frame-utils'

function MentionFileIcon({ path }: { path: string }) {
    const [iconUrl, setIconUrl] = useState('')

    useEffect(() => {
        let active = true
        void loadMaterialFileIconForPath(path).then((url) => {
            if (active) setIconUrl(url)
        })
        return () => { active = false }
    }, [path])

    return (
        <span
            className="mention-result__icon"
            style={{
                ['--mention-icon' as string]: iconUrl ? `url(${iconUrl})` : 'none',
                background: iconUrl ? 'var(--text-secondary)' : 'transparent',
            }}
            aria-hidden="true"
        />
    )
}

interface ComposerMentionMenusProps {
    input: string
    setInput: (value: string) => void
    inputRef: RefObject<HTMLTextAreaElement | null>
    // File mention
    isFileMentioning: boolean
    fileMentionResults: FileMention[]
    fileMentionIndex: number
    extractFileMentionText: () => string | null
    setAttachments: React.Dispatch<React.SetStateAction<FileMention[]>>
    // Skill slash
    skillSlashMatch: string | null
    skillSearchSections: Array<{ key: string; title: string; items: SkillSearchItem[] }>
    skillSearchResults: SkillSearchItem[]
    skillSearchIndex: number
    addTurnSkillSelection: (item: SkillSearchItem) => void
    // Slash commands
    showSlashMenu: boolean
    slashIndex: number
    filteredCommands: Array<{ cmd: string; desc: string; mode: 'compose' }>
    applySelectedCommand: (command: string) => void
}

export default function ComposerMentionMenus(props: ComposerMentionMenusProps) {
    const {
        setInput,
        inputRef,
        isFileMentioning,
        fileMentionResults,
        fileMentionIndex,
        extractFileMentionText,
        setAttachments,
        skillSlashMatch,
        skillSearchSections,
        skillSearchResults,
        skillSearchIndex,
        addTurnSkillSelection,
        showSlashMenu,
        slashIndex,
        filteredCommands,
        applySelectedCommand,
    } = props

    return (
        <>
            {isFileMentioning && fileMentionResults.length > 0 ? (
                <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                    {fileMentionResults.map((file, i) => (
                        <div
                            key={file.absolute}
                            className={`slash-menu-item mention-menu-item ${i === fileMentionIndex ? 'active' : ''}`}
                            onClick={() => {
                                const newText = extractFileMentionText()
                                if (newText !== null) {
                                    setInput(newText)
                                    setAttachments((current) => [...current, file])
                                }
                                inputRef.current?.focus()
                            }}
                        >
                            <MentionFileIcon path={file.path} />
                            <span className="mention-result__content">
                                <span className="mention-result__name">{file.name}</span>
                                <span className="mention-result__path">{file.path}</span>
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}

            {skillSlashMatch !== null ? (
                <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                    {skillSearchSections.length > 0 ? skillSearchSections.map((section) => (
                        <div key={section.key} className="slash-menu__section">
                            <div className="slash-menu__section-title">{section.title}</div>
                            {section.items.map((item) => {
                                const resultIndex = skillSearchResults.findIndex((candidate) => candidate.key === item.key)
                                return (
                                    <div
                                        key={item.key}
                                        className={`slash-menu-item skill-menu-item ${resultIndex === skillSearchIndex ? 'active' : ''}`}
                                        onClick={() => addTurnSkillSelection(item)}
                                    >
                                        <span className={`skill-result__scope skill-result__scope--${item.scope}`}>{item.scope}</span>
                                        <span className="mention-result__content">
                                            <span className="mention-result__name">{item.label}</span>
                                            <span className="mention-result__path">{item.subtitle}</span>
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    )) : (
                        <div className="slash-menu__section">
                            <div className="slash-menu__section-title">Skill</div>
                            <div className="slash-menu-item">
                                <span className="slash-desc">No matching Skills found.</span>
                            </div>
                        </div>
                    )}
                </div>
            ) : null}

            {skillSlashMatch === null && showSlashMenu && filteredCommands.length > 0 ? (
                <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                    {filteredCommands.map((command, i) => (
                        <div
                            key={command.cmd}
                            className={`slash-menu-item ${i === slashIndex ? 'active' : ''}`}
                            onClick={() => {
                                applySelectedCommand(command.cmd)
                            }}
                        >
                            <span className="slash-cmd">{command.cmd}</span>
                            <span className="slash-desc">{command.desc}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </>
    )
}
