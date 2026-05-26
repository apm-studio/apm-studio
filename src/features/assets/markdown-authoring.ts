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
            title: 'Skill Pack Editor',
            helpText: 'Agent Roster edits the SKILL.md file for this skill pack. If you need scripts/, references/, assets/, or agents/openai.yaml, save the draft first, open the bundle folder, and edit those files there. Keep the bundle folder name unchanged so the draft stays linked.',
            placeholder: 'Write the SKILL.md for this skill pack. Need scripts/, references/, assets/, or agents/openai.yaml? Save the draft first, then open the bundle folder and edit those files directly.',
            showOpenButton: true,
            showExportButton: true,
        }
    }

    return {
        title: 'Persona Editor',
        helpText: 'This persona stays local to the editor until you save it. After the first save, Agent Roster keeps it as a draft and applies later edits to that same draft.',
        placeholder: 'Write the persona instructions, workflows, and system guidance in Markdown.',
        showOpenButton: false,
        showExportButton: false,
    }
}
