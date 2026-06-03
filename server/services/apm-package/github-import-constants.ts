const DEFAULT_IMPORT_LIMIT = 400
const MAX_IMPORT_LIMIT = 400
const DEFAULT_CATALOG_LIMIT = 48
const MAX_CATALOG_LIMIT = 120

export const DEFAULT_STUDIO_MODEL = { provider: 'openai', modelId: 'gpt-5.4' }
export const ALL_TARGET_LABELS = ['Codex', 'Gemini', 'Claude', 'OpenCode', 'Cursor', 'Windsurf', 'Copilot']
export const ALL_TARGET_IDS = ['codex', 'gemini', 'claude', 'opencode', 'cursor', 'windsurf', 'copilot']

function finiteLimit(value: number | undefined, defaultValue: number, maxValue: number) {
    if (!Number.isFinite(value || NaN)) return defaultValue
    return Math.min(maxValue, Math.max(1, Math.floor(value || defaultValue)))
}

export function importLimit(value: number | undefined) {
    return finiteLimit(value, DEFAULT_IMPORT_LIMIT, MAX_IMPORT_LIMIT)
}

export function catalogLimit(value: number | undefined) {
    return finiteLimit(value, DEFAULT_CATALOG_LIMIT, MAX_CATALOG_LIMIT)
}
