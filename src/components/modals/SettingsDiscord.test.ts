import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import SettingsDiscord from './SettingsDiscord'

vi.mock('../../api-clients/discord', () => ({
    discordApi: {
        status: vi.fn(),
    },
}))

vi.mock('../../store', () => ({
    useStudioStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
        workspaceId: 'workspace-1',
        saveWorkspace: vi.fn(),
    }),
}))

vi.mock('../../lib/toast', () => ({
    showToast: vi.fn(),
}))

describe('SettingsDiscord', () => {
    it('renders the Discord settings panel shell', () => {
        const html = renderToStaticMarkup(React.createElement(SettingsDiscord))
        expect(html).toContain('Discord')
        expect(html).toContain('Enable Discord integration')
        expect(html).toContain('Bot token')
        expect(html).toContain('Sync current')
    })
})
