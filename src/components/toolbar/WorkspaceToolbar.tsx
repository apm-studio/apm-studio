import { Suspense, lazy, useState, useEffect } from 'react';
import { api } from '../../api';
import { showToast } from '../../lib/toast';
import { GitBranch, CheckCircle, AlertCircle, Settings, Moon, Sun, Hexagon, Terminal as TerminalIcon, Github, ChevronDown, Save, LogIn, UserRound, MessageCircle } from 'lucide-react';
import { useStudioStore } from '../../store';
import { useServerHealth, useApmAssetStatus } from '../../hooks/queries';
import { useApmLogin } from '../../hooks/useApmLogin';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries';
import { DropdownMenu } from '../shared/DropdownMenu';

import './WorkspaceToolbar.css';

const SettingsModal = lazy(() =>
    import('../../features/providers').then((module) => ({ default: module.SettingsModal })),
);
const PublishModal = lazy(() =>
    import('../modals/PublishModal').then((module) => ({ default: module.default })),
);

export default function WorkspaceToolbar() {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'providers' | 'models' | 'discord'>('general');
    const [publishOpen, setPublishOpen] = useState(false);

    const theme = useStudioStore(s => s.theme);
    const toggleTheme = useStudioStore(s => s.toggleTheme);
    const workingDir = useStudioStore(s => s.workingDir);
    const isAssistantOpen = useStudioStore(s => s.isAssistantOpen);
    const toggleAssistant = useStudioStore(s => s.toggleAssistant);
    const isTerminalOpen = useStudioStore(s => s.isTerminalOpen);
    const setTerminalOpen = useStudioStore(s => s.setTerminalOpen);
    const isTrackingOpen = useStudioStore(s => s.isTrackingOpen);
    const setTrackingOpen = useStudioStore(s => s.setTrackingOpen);
    const addCanvasTerminal = useStudioStore(s => s.addCanvasTerminal);

    const { data: serverHealthy } = useServerHealth();
    const { data: apmAssetStatus } = useApmAssetStatus();
    const { authUser, startLogin, logout, isAuthenticating, isLoggingOut } = useApmLogin();
    const queryClient = useQueryClient();

    const serverConnected = !!serverHealthy;
    const apmInitialized = apmAssetStatus?.initialized ?? false;
    const [gitBranch, setGitBranch] = useState<string | null>(null);
    const [discordOnline, setDiscordOnline] = useState(false);
    const effectiveDiscordOnline = serverConnected && discordOnline;

    // Git branch polling
    useEffect(() => {
        const fetchVcs = () => {
            if (serverConnected) {
                api.vcs.get()
                    .then((data: { branch?: string | null }) => setGitBranch(data.branch || null))
                    .catch(() => setGitBranch(null));
            } else {
                setGitBranch(null);
            }
        };
        fetchVcs();
        const timer = setInterval(fetchVcs, 15000);
        return () => clearInterval(timer);
    }, [serverConnected, workingDir]);

    useEffect(() => {
        if (!serverConnected) {
            return;
        }
        const fetchDiscord = () => {
            api.discord.status()
                .then((status) => setDiscordOnline(status.online && !!status.config.guildId && status.missingPermissions.length === 0))
                .catch(() => setDiscordOnline(false));
        };
        fetchDiscord();
        const timer = setInterval(fetchDiscord, 30000);
        return () => clearInterval(timer);
    }, [serverConnected]);

    const openSettings = (tab: 'general' | 'providers' | 'models' | 'discord' = 'general') => {
        setSettingsInitialTab(tab);
        setSettingsOpen(true);
    };

    const handleApmInit = async () => {
        if (apmInitialized) return;
        try {
            await api.apmAssets.init();
            queryClient.invalidateQueries({ queryKey: queryKeys.apmAssetStatus(workingDir) });
        } catch (err) {
            console.error('Failed to init APM Studio workspace:', err);
            showToast('Failed to initialize the APM Studio workspace for this project.', 'error', {
                title: 'Workspace init failed',
                dedupeKey: `apm:init:${workingDir || 'unknown'}`,
                actionLabel: 'Retry',
                onAction: () => {
                    void handleApmInit()
                },
            });
        }
    };

    return (
        <>
            <div className="toolbar">
                <button
                    type="button"
                    className={`toolbar__item apm-status ${apmInitialized ? 'apm-ok' : 'apm-missing'}`}
                    onClick={handleApmInit}
                    aria-label={apmInitialized ? 'APM Studio workspace initialized' : 'Initialize APM Studio workspace'}
                    title={apmInitialized
                        ? 'APM Studio initialized for this workspace'
                        : 'APM Studio not initialized - click to init'
                    }
                >
                    <Hexagon size={12} />
                    <span>APM</span>
                </button>

                {gitBranch && (
                    <span className="toolbar__item" title={`Branch: ${gitBranch}`}>
                        <GitBranch size={12} className="icon-muted" /> {gitBranch}
                    </span>
                )}

                {authUser?.authenticated ? (
                    <DropdownMenu
                        align="right"
                        trigger={
                            <button
                                type="button"
                                className="toolbar__item apm-auth-status apm-auth-status--ok"
                                aria-label={`APM Studio account @${authUser.username}`}
                                title={`Signed in as @${authUser.username}`}
                            >
                                <UserRound size={12} />
                                <span>@{authUser.username}</span>
                                <ChevronDown size={10} />
                            </button>
                        }
                        items={[
                            { label: isLoggingOut ? 'Signing out…' : 'Log out', onClick: () => void logout(), disabled: isLoggingOut },
                        ]}
                    />
                ) : (
                    <button
                        type="button"
                        className="toolbar__item apm-auth-status apm-auth-status--warn"
                        onClick={() => void startLogin(true)}
                        aria-label={isAuthenticating ? 'APM Studio sign in pending' : 'Sign in to APM Studio'}
                        title={isAuthenticating
                            ? 'Waiting for APM Studio login to complete in the browser'
                            : 'Review the APM Studio Terms of Service and sign in'
                        }
                    >
                        <LogIn size={12} />
                        <span>{isAuthenticating ? 'Signing in…' : 'Sign in'}</span>
                    </button>
                )}

                <span
                    className="toolbar__item"
                    title={serverConnected ? 'Local server connected' : 'Local server disconnected'}
                    aria-label={serverConnected ? 'Local server connected' : 'Local server disconnected'}
                >
                    {serverConnected ? (
                        <CheckCircle size={12} className="toolbar__status-icon toolbar__status-icon--ok" />
                    ) : (
                        <AlertCircle size={12} className="toolbar__status-icon toolbar__status-icon--warn" />
                    )}
                </span>

                <div className="divider-v" />

                <DropdownMenu
                    trigger={
                        <button type="button" className="icon-btn" title="Terminal" aria-label="Terminal options">
                            <TerminalIcon size={12} className={isTerminalOpen ? 'icon-active' : ''} />
                            <ChevronDown size={10} />
                        </button>
                    }
                    items={[
                        { label: `${isTerminalOpen ? 'Hide' : 'Show'} Pinned Terminal`, onClick: () => setTerminalOpen(!isTerminalOpen) },
                        { label: 'Add Terminal to Canvas', onClick: () => addCanvasTerminal() },
                    ]}
                />

                <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setTrackingOpen(!isTrackingOpen)}
                    title="Workspace Tracking"
                    aria-label="Toggle workspace tracking"
                    aria-pressed={isTrackingOpen}
                >
                    <Github size={12} className={isTrackingOpen ? 'icon-active' : ''} />
                </button>

                <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setPublishOpen(true)}
                    title="Save selected package locally"
                    aria-label="Save selected package locally"
                >
                    <Save size={12} />
                </button>

                <button
                    type="button"
                    className="icon-btn"
                    onClick={() => openSettings('discord')}
                    title={effectiveDiscordOnline ? 'Discord connected' : 'Discord settings'}
                    aria-label={effectiveDiscordOnline ? 'Discord connected' : 'Discord settings'}
                >
                    <MessageCircle size={12} className={effectiveDiscordOnline ? 'icon-active' : ''} />
                </button>

                <button type="button" className="icon-btn" onClick={toggleTheme} title="Toggle Theme" aria-label="Toggle theme">
                    {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
                </button>

                <button type="button" className="icon-btn" onClick={() => openSettings('general')} title="Settings" aria-label="Settings">
                    <Settings size={12} />
                </button>

                <button
                    type="button"
                    className={`toolbar__assistant-btn ${isAssistantOpen ? 'is-active' : ''}`}
                    onClick={toggleAssistant}
                    title={isAssistantOpen ? 'Hide APM Assistant' : 'Show APM Assistant'}
                    aria-pressed={isAssistantOpen}
                >
                    Assistant
                </button>
            </div>
            {publishOpen ? (
                <Suspense fallback={null}>
                    <PublishModal open={publishOpen} onClose={() => setPublishOpen(false)} />
                </Suspense>
            ) : null}
            {settingsOpen ? (
                <Suspense fallback={null}>
                    <SettingsModal open={settingsOpen} initialTab={settingsInitialTab} onClose={() => setSettingsOpen(false)} />
                </Suspense>
            ) : null}
        </>
    );
}
