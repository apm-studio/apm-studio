import { describe, expect, it } from 'vitest'
import { APP_MODE_ORDER, appModeLabel, modeContextLabel, modeTitle } from './app-mode-header-model'

describe('app mode header model', () => {
    it('orders primary mode tabs as Import, Inject, then Studio Agent', () => {
        expect(APP_MODE_ORDER.map(appModeLabel)).toEqual(['Import', 'Inject', 'Studio Agent'])
    })

    it('uses Inject for the external assistant target workflow', () => {
        expect(appModeLabel('export')).toBe('Inject')
        expect(modeTitle('export')).toBe('Inject APM primitives into assistant targets')
        expect(modeContextLabel('export')).toBe('Inject into assistant targets')
    })
})
