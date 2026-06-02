import type { WorkspaceMode } from '../store/workspace/types'

export const APP_MODE_ORDER: WorkspaceMode[] = ['import', 'export', 'studio-agent']

const APP_MODE_LABELS: Record<WorkspaceMode, string> = {
    import: 'Import',
    'studio-agent': 'Studio Agent',
    export: 'Inject',
}

const APP_MODE_TITLES: Record<WorkspaceMode, string> = {
    import: 'Import packages and source primitives from GitHub',
    'studio-agent': 'Edit and run local Studio Agents',
    export: 'Inject APM primitives into assistant targets',
}

const APP_MODE_CONTEXT_LABELS: Record<WorkspaceMode, string> = {
    import: 'Import packages and source primitives',
    'studio-agent': 'Studio Agent workspace',
    export: 'Inject into assistant targets',
}

export function appModeLabel(mode: WorkspaceMode) {
    return APP_MODE_LABELS[mode]
}

export function modeTitle(mode: WorkspaceMode) {
    return APP_MODE_TITLES[mode]
}

export function modeContextLabel(mode: WorkspaceMode) {
    return APP_MODE_CONTEXT_LABELS[mode]
}
