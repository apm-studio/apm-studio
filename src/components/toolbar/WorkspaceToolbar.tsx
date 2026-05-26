import { Suspense, lazy, useState, useEffect } from 'react';
import { api } from '../../api';
import { showToast } from '../../lib/toast';
import { GitBranch, CheckCircle, AlertCircle, Settings, Moon, Sun, Hexagon, Terminal as TerminalIcon, Github, ChevronDown, Save, LogIn, UserRound, MessageCircle, RefreshCcw } from 'lucide-react';
import { useStudioStore } from '../../store';
import { useServerHealth, useRosterStatus } from '../../hooks/queries';
import { useRosterLogin } from '../../hooks/useRosterLogin';
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
    const setWorkspaceMode = useStudioStore(s => s.setWorkspaceMode);
    const addCanvasTerminal = useStudioStore(s => s.addCanvasTerminal);

    const { data: serverHealthy } = useServerHealth();
    const { data: rosterStatus } = useRosterStatus();
    const { authUser, startLogin, logout, isAuthenticating, isLoggingOut } = useRosterLogin();
    const queryClient = useQueryClient();

    const serverConnected = !!serverHealthy;
    const rosterInitialized = rosterStatus?.initialized ?? false;
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

    const handleRosterInit = async () => {
        if (rosterInitialized) return;
        try {
            await api.roster.init();
            queryClient.invalidateQueries({ queryKey: queryKeys.rosterStatus(workingDir) });
        } catch (err) {
            console.error('Failed to init 8PM Studio workspace:', err);
            showToast('Failed to initialize the 8PM Studio workspace for this project.', 'error', {
                title: 'Workspace init failed',
                dedupeKey: `roster:init:${workingDir || 'unknown'}`,
                actionLabel: 'Retry',
                onAction: () => {
                    void handleRosterInit()
                },
            });
        }
    };

    return (
        <>
            <div className="toolbar">
                <button
                    type="button"
                    className={`toolbar__item roster-status ${rosterInitialized ? 'roster-ok' : 'roster-missing'}`}
                    onClick={handleRosterInit}
                    aria-label={rosterInitialized ? '8PM Studio workspace initialized' : 'Initialize 8PM Studio workspace'}
                    title={rosterInitialized
                        ? '8PM Studio initialized for this workspace'
                        : '8PM Studio not initialized - click to init'
                    }
                >
                    <Hexagon size={12} />
                    <span>8PM</span>
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
                                className="toolbar__item roster-auth-status roster-auth-status--ok"
                                aria-label={`8PM Studio account @${authUser.username}`}
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
                        className="toolbar__item roster-auth-status roster-auth-status--warn"
                        onClick={() => void startLogin(true)}
                        aria-label={isAuthenticating ? '8PM Studio sign in pending' : 'Sign in to 8PM Studio'}
                        title={isAuthenticating
                            ? 'Waiting for 8PM Studio login to complete in the browser'
                            : 'Review the 8PM Studio Terms of Service and sign in'
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
                    onClick={() => setWorkspaceMode('agent-sync')}
                    title="Agent Sync"
                    aria-label="Open Agent Sync"
                >
                    <RefreshCcw size={12} />
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
                    title={isAssistantOpen ? 'Hide 8PM Assistant' : 'Show 8PM Assistant'}
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
