import { describe, expect, it } from 'vitest'
import { buildPermissionModePatch, resolvePermissionMode } from './settings-permissions'

describe('settings permission mode helpers', () => {
    it('treats missing or empty OpenCode permission config as default mode', () => {
        expect(resolvePermissionMode({})).toBe('default')
        expect(resolvePermissionMode({ permission: {} })).toBe('default')
    })

    it('detects Studio-managed auto approval config', () => {
        expect(resolvePermissionMode({ permission: 'allow' })).toBe('auto')
        expect(resolvePermissionMode({ permission: { '*': 'allow' } })).toBe('auto')
    })

    it('leaves custom OpenCode permission config unmanaged', () => {
        expect(resolvePermissionMode({ permission: 'ask' })).toBe('custom')
        expect(resolvePermissionMode({ permission: { bash: 'allow' } })).toBe('custom')
        expect(resolvePermissionMode({ permission: { '*': 'allow', read: { '*.env': 'ask' } } })).toBe('custom')
    })

    it('builds patches for the two Studio-managed modes', () => {
        expect(buildPermissionModePatch(true)).toEqual({ permission: { '*': 'allow' } })
        expect(buildPermissionModePatch(false)).toEqual({ permission: {} })
    })
})
