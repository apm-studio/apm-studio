import { describe, expect, it } from 'vitest'
import { APP_MODE_ORDER, appModeLabel, modeContextLabel, modeTitle } from './app-mode-header-model'

describe('app mode header model', () => {
    it('orders primary mode tabs as Import, Export, then Studio Agent', () => {
        expect(APP_MODE_ORDER.map(appModeLabel)).toEqual(['Import', 'Export', 'Studio Agent'])
    })

    it('uses Export for the external assistant target workflow', () => {
        expect(appModeLabel('export')).toBe('Export')
        expect(modeTitle('export')).toBe('Export APM primitives to assistant targets')
        expect(modeContextLabel('export')).toBe('Export to assistant targets')
    })
})
