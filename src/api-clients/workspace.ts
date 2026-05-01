import { fetchJSON, normalizeWorkspaceFileEntry } from '../api-core'

export const workspaceApi = {
    findFiles: async (query: string) => {
        const normalized = query.trim()

        const entries = await fetchJSON<Array<string | {
            name: string
            path: string
            absolute: string
            type: string
        }>>(`/api/find/files?pattern=${encodeURIComponent(normalized)}`)

        return entries
            .map((entry) => normalizeWorkspaceFileEntry(entry))
            .filter((entry) => entry.type === 'file')
    },
}
