import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, ExternalLink, RefreshCw, Unplug, AlertCircle } from 'lucide-react'
import { api } from '../../api'
import type { DiscordIntegrationStatus } from '../../api-clients/discord'
import { showToast } from '../../lib/toast'
import { useStudioStore } from '../../store'

const PERMISSIONS = [
    'Manage channels',
    'Send messages',
    'Read message history',
    'Use slash commands',
    'Message content intent',
]

function statusLabel(status: DiscordIntegrationStatus | null) {
    if (!status) return 'Loading'
    if (!status.config.hasToken) return 'Not configured'
    if (!status.online) return 'Bot offline'
    if (!status.config.guildId) return 'Select a server'
    if (status.missingPermissions.length > 0) return 'Missing permissions'
    if (status.messageContentLikelyMissing) return 'Message content intent missing'
    return 'Bot online'
}

export default function SettingsDiscord() {
    const workspaceId = useStudioStore((state) => state.workspaceId)
    const workingDir = useStudioStore((state) => state.workingDir)
    const saveWorkspace = useStudioStore((state) => state.saveWorkspace)
    const [status, setStatus] = useState<DiscordIntegrationStatus | null>(null)
    const [token, setToken] = useState('')
    const [guildId, setGuildId] = useState('')
    const [allowedRoleIdsText, setAllowedRoleIdsText] = useState('')
    const [allowedUserIdsText, setAllowedUserIdsText] = useState('')
    const [requireManageGuild, setRequireManageGuild] = useState(true)
    const [enabled, setEnabled] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [syncing, setSyncing] = useState<'current' | 'all' | null>(null)
    const [error, setError] = useState<string | null>(null)

    const selectedGuildKnown = useMemo(
        () => !!guildId && status?.guilds.some((guild) => guild.id === guildId),
        [guildId, status?.guilds],
    )

    const loadStatus = async () => {
        setLoading(true)
        setError(null)
        try {
            const next = await api.discord.status()
            setStatus(next)
            setEnabled(next.config.enabled)
            setGuildId(next.config.guildId || '')
            setRequireManageGuild(next.config.requireManageGuild)
            setAllowedRoleIdsText(next.config.allowedRoleIds.join('\n'))
            setAllowedUserIdsText(next.config.allowedUserIds.join('\n'))
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadStatus()
    }, [])

    const saveConfig = async () => {
        setSaving(true)
        setError(null)
        try {
            const next = await api.discord.updateConfig({
                enabled,
                ...(token.trim() ? { token: token.trim() } : {}),
                guildId,
                requireManageGuild,
                allowedRoleIds: allowedRoleIdsText.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
                allowedUserIds: allowedUserIdsText.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
            })
            setStatus(next)
            setToken('')
            setEnabled(next.config.enabled)
            setGuildId(next.config.guildId || '')
            setRequireManageGuild(next.config.requireManageGuild)
            setAllowedRoleIdsText(next.config.allowedRoleIds.join('\n'))
            setAllowedUserIdsText(next.config.allowedUserIds.join('\n'))
            showToast('Discord settings saved.', 'success', {
                title: 'Discord',
                dedupeKey: 'discord:settings-saved',
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSaving(false)
        }
    }

    const disconnect = async () => {
        setSaving(true)
        setError(null)
        try {
            const next = await api.discord.disconnect()
            setStatus(next)
            setEnabled(false)
            setGuildId('')
            setToken('')
            setAllowedRoleIdsText('')
            setAllowedUserIdsText('')
            setRequireManageGuild(true)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSaving(false)
        }
    }

    const sync = async (scope: 'current' | 'all') => {
        setSyncing(scope)
        setError(null)
        try {
            let targetWorkspaceId = workspaceId
            if (scope === 'current') {
                await saveWorkspace()
                targetWorkspaceId = useStudioStore.getState().workspaceId
                if (!targetWorkspaceId) {
                    throw new Error('Save the current workspace before syncing Discord.')
                }
            }
            const result = await api.discord.sync(scope === 'current' ? targetWorkspaceId : null)
            const failedCount = result.failedWorkspaces?.length || 0
            showToast(
                scope === 'current'
                    ? 'Current workspace synced to Discord.'
                    : failedCount > 0
                        ? `Refreshed the Discord Studio control. ${failedCount} failed.`
                        : 'Refreshed the Discord Studio control.',
                failedCount > 0 ? 'warning' : 'success',
                { title: 'Discord sync', dedupeKey: `discord:sync:${scope}` },
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setSyncing(null)
            void loadStatus()
        }
    }

    const canSyncCurrent = (!!workspaceId || !!workingDir) && status?.online && status.config.guildId && status.missingPermissions.length === 0
    const canSyncAll = status?.online && status.config.guildId && status.missingPermissions.length === 0

    return (
        <div className="stg-panel">
            <div className="stg-panel__header stg-panel__header--split">
                <div>
                    <h2 className="stg-panel__title">Discord</h2>
                    <div className="stg-row__desc">{statusLabel(status)}</div>
                </div>
                <button className="icon-btn" onClick={() => void loadStatus()} title="Refresh Discord status" disabled={loading}>
                    <RefreshCw size={14} />
                </button>
            </div>

            {error ? <div className="alert alert--danger">{error}</div> : null}

            <div className="stg-section">
                <h3 className="stg-section__title">Connection</h3>
                <div className="stg-group">
                    <div className="stg-row">
                        <div className="stg-row__text">
                            <span className="stg-row__title">Enable Discord integration</span>
                            <span className="stg-row__desc">Run the Discord bot from this Studio server.</span>
                        </div>
                        <label className="toggle-switch">
                            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                            <span className="toggle-switch__track" />
                        </label>
                    </div>

                    <div className="stg-row stg-row--top">
                        <div className="stg-row__text">
                            <span className="stg-row__title">Bot token</span>
                            <span className="stg-row__desc">
                                {status?.config.hasToken ? 'Token saved. Leave blank to keep the current token.' : 'Paste a Discord bot token. It is stored on the Studio server only.'}
                            </span>
                        </div>
                        <input
                            className="text-input stg-input"
                            type="password"
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                            placeholder={status?.config.hasToken ? 'Saved token' : 'Bot token'}
                        />
                    </div>

                    <div className="stg-row stg-row--top">
                        <div className="stg-row__text">
                            <span className="stg-row__title">Server</span>
                            <span className="stg-row__desc">Choose a bot-visible server, or paste a server ID manually.</span>
                        </div>
                        <div className="stg-field-stack">
                            <select className="stg-select" value={selectedGuildKnown ? guildId : ''} onChange={(event) => setGuildId(event.target.value)}>
                                <option value="">Select server...</option>
                                {(status?.guilds || []).map((guild) => (
                                    <option key={guild.id} value={guild.id}>{guild.name}</option>
                                ))}
                            </select>
                            <input
                                className="text-input stg-input"
                                value={guildId}
                                onChange={(event) => setGuildId(event.target.value)}
                                placeholder="Manual server ID"
                            />
                        </div>
                    </div>
                </div>

                <div className="stg-actions">
                    <button className="btn btn--primary" onClick={() => void saveConfig()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save settings'}
                    </button>
                    {status?.inviteUrl ? (
                        <a className="btn" href={status.inviteUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={12} /> Invite bot
                        </a>
                    ) : null}
                    <button className="btn" onClick={() => void disconnect()} disabled={saving || !status?.config.hasToken}>
                        <Unplug size={12} /> Disconnect
                    </button>
                </div>
                </div>

                <div className="stg-section">
                    <h3 className="stg-section__title">Access control</h3>
                    <div className="stg-group">
                        <div className="stg-row">
                            <div className="stg-row__text">
                                <span className="stg-row__title">Require Manage Server</span>
                                <span className="stg-row__desc">Default strict mode. Users with Discord Manage Server can use Studio commands and chat.</span>
                            </div>
                            <label className="toggle-switch">
                                <input type="checkbox" checked={requireManageGuild} onChange={(event) => setRequireManageGuild(event.target.checked)} />
                                <span className="toggle-switch__track" />
                            </label>
                        </div>
                        <div className="stg-row stg-row--top">
                            <div className="stg-row__text">
                                <span className="stg-row__title">Allowed role IDs</span>
                                <span className="stg-row__desc">Optional Discord role IDs that may use Studio even without Manage Server.</span>
                            </div>
                            <textarea
                                className="text-input stg-input stg-textarea"
                                value={allowedRoleIdsText}
                                onChange={(event) => setAllowedRoleIdsText(event.target.value)}
                                placeholder="One role ID per line"
                                rows={3}
                            />
                        </div>
                        <div className="stg-row stg-row--top">
                            <div className="stg-row__text">
                                <span className="stg-row__title">Allowed user IDs</span>
                                <span className="stg-row__desc">Optional Discord user IDs for direct exceptions.</span>
                            </div>
                            <textarea
                                className="text-input stg-input stg-textarea"
                                value={allowedUserIdsText}
                                onChange={(event) => setAllowedUserIdsText(event.target.value)}
                                placeholder="One user ID per line"
                                rows={3}
                            />
                        </div>
                    </div>
                </div>

            <div className="stg-section">
                <h3 className="stg-section__title">Sync</h3>
                <div className="stg-group">
                    <div className="stg-row">
                        <div className="stg-row__text">
                            <span className="stg-row__title">Current workspace</span>
                            <span className="stg-row__desc">Save and sync the control channel, Agent/Team categories, and thread channels.</span>
                        </div>
                        <button className="btn" onClick={() => void sync('current')} disabled={!canSyncCurrent || syncing !== null}>
                            {syncing === 'current' ? 'Syncing…' : 'Sync current'}
                        </button>
                    </div>
                    <div className="stg-row">
                        <div className="stg-row__text">
                            <span className="stg-row__title">Studio control</span>
                            <span className="stg-row__desc">Refresh the Discord workspace switcher without opening every thread channel.</span>
                        </div>
                        <button className="btn" onClick={() => void sync('all')} disabled={!canSyncAll || syncing !== null}>
                            {syncing === 'all' ? 'Refreshing…' : 'Refresh workspace list'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="stg-section">
                <h3 className="stg-section__title">Checklist</h3>
                <div className="stg-group">
                    {PERMISSIONS.map((permission) => {
                        const missing = status?.missingPermissions.includes(permission)
                            || (permission === 'Message content intent' && status?.messageContentLikelyMissing)
                        return (
                            <div className="stg-row" key={permission}>
                                <div className="stg-row__text">
                                    <span className="stg-row__title">{permission}</span>
                                </div>
                                {missing ? <AlertCircle size={14} color="#f24822" /> : <CheckCircle size={14} color="#14ae5c" />}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
