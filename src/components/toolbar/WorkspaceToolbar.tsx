import { Suspense, lazy, useState, useEffect } from 'react';
import { discordApi } from '../../api-clients/discord';
import { opencodeApi } from '../../api-clients/opencode';
import { GitBranch, CheckCircle, AlertCircle, Settings, Moon, Sun, Terminal as TerminalIcon, Github, ChevronDown, MessageCircle } from 'lucide-react';
import { useStudioStore } from '../../store';
import { useServerHealth } from '../../hooks/queries/opencode';
import { DropdownMenu } from '../shared/DropdownMenu';

import './WorkspaceToolbar.css';

const SettingsModal = lazy(() =>
    import('../../features/providers').then((module) => ({ default: module.SettingsModal })),
);

export default function WorkspaceToolbar() {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'providers' | 'models' | 'discord'>('general');

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

    const serverConnected = !!serverHealthy;
    const [gitBranch, setGitBranch] = useState<string | null>(null);
    const [discordOnline, setDiscordOnline] = useState(false);
    const effectiveDiscordOnline = serverConnected && discordOnline;

    // Git branch polling
    useEffect(() => {
        const fetchVcs = () => {
            if (serverConnected) {
                opencodeApi.vcs.get()
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
            discordApi.status()
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

    return (
        <>
            <div className="toolbar">
                {gitBranch && (
                    <span className="toolbar__item" title={`Branch: ${gitBranch}`}>
                        <GitBranch size={12} className="icon-muted" /> {gitBranch}
                    </span>
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
            {settingsOpen ? (
                <Suspense fallback={null}>
                    <SettingsModal open={settingsOpen} initialTab={settingsInitialTab} onClose={() => setSettingsOpen(false)} />
                </Suspense>
            ) : null}
        </>
    );
}
