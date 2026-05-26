import { Suspense, lazy, useState, useEffect } from 'react';
import { api } from '../../api';
import { showToast } from '../../lib/toast';
import { GitBranch, CheckCircle, AlertCircle, Settings, Moon, Sun, Hexagon, Terminal as TerminalIcon, Github, ChevronDown, Upload, LogIn, UserRound, MessageCircle, RefreshCcw } from 'lucide-react';
import { useStudioStore } from '../../store';
import { useServerHealth, useDotStatus } from '../../hooks/queries';
import { useDotLogin } from '../../hooks/useDotLogin';
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
    const { data: dotStatus } = useDotStatus();
    const { authUser, startLogin, logout, isAuthenticating, isLoggingOut } = useDotLogin();
    const queryClient = useQueryClient();

    const serverConnected = !!serverHealthy;
    const dotInitialized = dotStatus?.initialized ?? false;
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

    const handleDotInit = async () => {
        if (dotInitialized) return;
        try {
            await api.dot.init();
            queryClient.invalidateQueries({ queryKey: queryKeys.dotStatus(workingDir) });
        } catch (err) {
            console.error('Failed to init Agent Roaster workspace:', err);
            showToast('Failed to initialize the Agent Roaster workspace for this project.', 'error', {
                title: 'Workspace init failed',
                dedupeKey: `dot:init:${workingDir || 'unknown'}`,
                actionLabel: 'Retry',
                onAction: () => {
                    void handleDotInit()
                },
            });
        }
    };

    return (
        <>
            <div className="toolbar">
                <button
                    type="button"
                    className={`toolbar__item dot-status ${dotInitialized ? 'dot-ok' : 'dot-missing'}`}
                    onClick={handleDotInit}
                    aria-label={dotInitialized ? 'Agent Roaster workspace initialized' : 'Initialize Agent Roaster workspace'}
                    title={dotInitialized
                        ? 'Agent Roaster initialized for this workspace'
                        : 'Agent Roaster not initialized - click to init'
                    }
                >
                    <Hexagon size={12} />
                    <span>Roaster</span>
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
                                className="toolbar__item dot-auth-status dot-auth-status--ok"
                                aria-label={`Agent Roaster account @${authUser.username}`}
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
                        className="toolbar__item dot-auth-status dot-auth-status--warn"
                        onClick={() => void startLogin(true)}
                        aria-label={isAuthenticating ? 'Agent Roaster sign in pending' : 'Sign in to Agent Roaster'}
                        title={isAuthenticating
                            ? 'Waiting for Agent Roaster login to complete in the browser'
                            : 'Review the Agent Roaster Terms of Service and sign in'
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
                    title="Save or publish selected asset"
                    aria-label="Save or publish selected asset"
                >
                    <Upload size={12} />
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
                    title={isAssistantOpen ? 'Hide Studio Assistant' : 'Show Studio Assistant'}
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
