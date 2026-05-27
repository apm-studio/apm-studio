/**
 * UI Settings store — lightweight Zustand store persisted to localStorage.
 * Mirrors OpenCode desktop's settings context (context/settings.tsx).
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UISettings {
    showReasoningSummaries: boolean
    shellToolPartsExpanded: boolean
    editToolPartsExpanded: boolean
}

interface UISettingsStore extends UISettings {
    setShowReasoningSummaries: (value: boolean) => void
    setShellToolPartsExpanded: (value: boolean) => void
    setEditToolPartsExpanded: (value: boolean) => void
}

const defaults: UISettings = {
    showReasoningSummaries: true,
    shellToolPartsExpanded: true,
    editToolPartsExpanded: false,
}

export const useUISettings = create<UISettingsStore>()(
    persist(
        (set) => ({
            ...defaults,
            setShowReasoningSummaries: (value) => set({ showReasoningSummaries: value }),
            setShellToolPartsExpanded: (value) => set({ shellToolPartsExpanded: value }),
            setEditToolPartsExpanded: (value) => set({ editToolPartsExpanded: value }),
        }),
        {
            name: 'apm-studio-ui-settings',
            version: 1,
        },
    ),
)
