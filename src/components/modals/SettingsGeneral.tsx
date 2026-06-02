/**
 * SettingsGeneral — General UI preferences panel.
 * Mirrors OpenCode's settings-general.tsx (reasoning and tool expansion prefs).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { opencodeApi } from '../../api-clients/opencode'
import { useStudioStore } from '../../store'
import { useUISettings } from '../../store/settings/slice'
import {
    buildPermissionModePatch,
    resolvePermissionMode,
    type PermissionMode,
} from './settings-permissions'

interface ToggleRowProps {
    title: string
    description: string
    checked: boolean
    onChange: (value: boolean) => void
    disabled?: boolean
}

function ToggleRow({ title, description, checked, onChange, disabled }: ToggleRowProps) {
    return (
        <div className="stg-row">
            <div className="stg-row__text">
                <span className="stg-row__title">{title}</span>
                <span className="stg-row__desc">{description}</span>
            </div>
            <label className="toggle-switch">
                <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <span className="toggle-switch__track" />
            </label>
        </div>
    )
}

type ShellOption = {
    path: string
    name: string
    acceptable: boolean
}

export default function SettingsGeneral() {
    const settings = useUISettings()
    const recordStudioChange = useStudioStore((state) => state.recordStudioChange)
    const [shellOptions, setShellOptions] = useState<ShellOption[]>([])
    const [savedShell, setSavedShell] = useState('')
    const [shellValue, setShellValue] = useState('')
    const [shellLoading, setShellLoading] = useState(true)
    const [shellSaving, setShellSaving] = useState(false)
    const [shellError, setShellError] = useState<string | null>(null)
    const [shellStatus, setShellStatus] = useState<string | null>(null)
    const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')
    const [permissionSaving, setPermissionSaving] = useState(false)
    const [permissionError, setPermissionError] = useState<string | null>(null)
    const [permissionStatus, setPermissionStatus] = useState<string | null>(null)

    const normalizedShellOptions = useMemo(() => {
        if (!shellValue || shellOptions.some((option) => option.path === shellValue)) {
            return shellOptions
        }
        return [
            ...shellOptions,
            { path: shellValue, name: shellValue, acceptable: true },
        ]
    }, [shellOptions, shellValue])

    const loadShellConfig = useCallback(async () => {
        setShellLoading(true)
        setShellError(null)
        try {
            const [config, shells] = await Promise.all([
                opencodeApi.config.getGlobal().catch(() => ({})),
                opencodeApi.terminal.shells().catch(() => []),
            ])
            const configRecord = config as Record<string, unknown>
            const shell = typeof configRecord.shell === 'string' ? configRecord.shell.trim() : ''
            setSavedShell(shell)
            setShellValue(shell)
            setShellOptions(shells)
            setPermissionMode(resolvePermissionMode(configRecord))
        } catch (error) {
            setShellError(error instanceof Error ? error.message : String(error))
        } finally {
            setShellLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadShellConfig()
    }, [loadShellConfig])

    const saveShellConfig = useCallback(async () => {
        setShellSaving(true)
        setShellError(null)
        setShellStatus(null)
        try {
            const nextShell = shellValue.trim()
            await opencodeApi.config.updateGlobal({ shell: nextShell || undefined })
            setSavedShell(nextShell)
            setShellValue(nextShell)
            recordStudioChange({ kind: 'runtime_config' })
            setShellStatus('Saved')
        } catch (error) {
            setShellError(error instanceof Error ? error.message : String(error))
        } finally {
            setShellSaving(false)
        }
    }, [recordStudioChange, shellValue])

    const savePermissionMode = useCallback(async (autoApprove: boolean) => {
        setPermissionSaving(true)
        setPermissionError(null)
        setPermissionStatus(null)
        try {
            await opencodeApi.config.updateGlobal(buildPermissionModePatch(autoApprove))
            setPermissionMode(autoApprove ? 'auto' : 'default')
            recordStudioChange({ kind: 'runtime_config' })
            setPermissionStatus('Saved')
        } catch (error) {
            setPermissionError(error instanceof Error ? error.message : String(error))
        } finally {
            setPermissionSaving(false)
        }
    }, [recordStudioChange])

    const shellDirty = shellValue.trim() !== savedShell
    const permissionCustom = permissionMode === 'custom'
    const permissionDescription = permissionCustom
        ? 'Custom rules detected. Studio will not overwrite them.'
        : 'Skip permission prompts for new agent actions.'

    return (
        <div className="stg-panel">
            <div className="stg-panel__header">
                <h2 className="stg-panel__title">General</h2>
            </div>

            <div className="stg-section">
                <div className="stg-group">
                    <ToggleRow
                        title="Show reasoning summaries"
                        description="Show compact reasoning notes in chats."
                        checked={settings.showReasoningSummaries}
                        onChange={settings.setShowReasoningSummaries}
                    />

                    <ToggleRow
                        title="Expand shell tool parts"
                        description="Open shell output by default."
                        checked={settings.shellToolPartsExpanded}
                        onChange={settings.setShellToolPartsExpanded}
                    />

                    <ToggleRow
                        title="Expand edit tool parts"
                        description="Open file diffs by default."
                        checked={settings.editToolPartsExpanded}
                        onChange={settings.setEditToolPartsExpanded}
                    />
                </div>
            </div>

            <div className="stg-section">
                <h3 className="stg-section__title">Runtime</h3>
                <div className="stg-group">
                    <div className="stg-row">
                        <div className="stg-row__text">
                            <span className="stg-row__title">Auto-approve permissions</span>
                            <span className="stg-row__desc">{permissionDescription}</span>
                            {permissionError ? <span className="stg-inline-error">{permissionError}</span> : null}
                            {permissionStatus ? <span className="stg-inline-status">{permissionStatus}</span> : null}
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={permissionMode === 'auto'}
                                disabled={shellLoading || permissionSaving || permissionCustom}
                                onChange={(event) => {
                                    void savePermissionMode(event.target.checked)
                                }}
                            />
                            <span className="toggle-switch__track" />
                        </label>
                    </div>

                    <div className="stg-row stg-row--top">
                        <div className="stg-row__text">
                            <span className="stg-row__title">Default shell</span>
                            <span className="stg-row__desc">Used by terminal and agent commands.</span>
                            {shellError ? <span className="stg-inline-error">{shellError}</span> : null}
                            {shellStatus ? <span className="stg-inline-status">{shellStatus}</span> : null}
                        </div>
                        <div className="stg-inline-control">
                            <select
                                className="select stg-select stg-shell-select"
                                value={shellValue}
                                disabled={shellLoading || shellSaving}
                                onChange={(event) => {
                                    setShellStatus(null)
                                    setShellValue(event.target.value)
                                }}
                            >
                                <option value="">System default</option>
                                {normalizedShellOptions.map((shell) => (
                                    <option
                                        key={shell.path}
                                        value={shell.path}
                                        disabled={!shell.acceptable}
                                    >
                                        {shell.name || shell.path}
                                    </option>
                                ))}
                            </select>
                            <button
                                className="btn btn--sm"
                                type="button"
                                disabled={!shellDirty || shellSaving || shellLoading}
                                onClick={() => { void saveShellConfig() }}
                            >
                                {shellSaving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
