import type { MarkdownEditorKind } from '../../types'

export type MarkdownEditorModeConfig = {
    title: string
    helpText: string
    placeholder: string
    showOpenButton: boolean
    showExportButton: boolean
}

export function nameToSlug(name: string) {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'untitled'
}

export function equalStringArray(left: string[] = [], right: string[] = []) {
    if (left.length !== right.length) return false
    return left.every((value, index) => value === right[index])
}

export function markdownEditorModeConfig(kind: MarkdownEditorKind): MarkdownEditorModeConfig {
    if (kind === 'dance') {
        return {
            title: 'Skill Editor',
            helpText: '8PM Studio edits the SKILL.md file for this skill. If you need scripts/, references/, assets/, or agents/openai.yaml, save the draft first, open the skill folder, and edit those files there. Keep the folder name unchanged so the draft stays linked.',
            placeholder: 'Write the SKILL.md for this skill. Need scripts/, references/, assets/, or agents/openai.yaml? Save the draft first, then open the skill folder and edit those files directly.',
            showOpenButton: true,
            showExportButton: true,
        }
    }

    return {
        title: 'Instruction Editor',
        helpText: 'These instructions stay local to the editor until you save them. After the first save, 8PM Studio keeps them as a draft and applies later edits to that same draft.',
        placeholder: 'Write the agent instructions, workflows, and system guidance in Markdown.',
        showOpenButton: false,
        showExportButton: false,
    }
}
