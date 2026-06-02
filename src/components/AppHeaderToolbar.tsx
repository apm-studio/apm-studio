import { Suspense, lazy, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, GitBranch, Moon, Settings, Sun } from 'lucide-react'
import { opencodeApi } from '../api-clients/opencode'
import { useServerHealth } from '../hooks/queries/opencode'
import { useStudioStore } from '../store'
import './AppHeaderToolbar.css'

const SettingsModal = lazy(() =>
    import('../features/providers').then((module) => ({ default: module.SettingsModal })),
)

export default function AppHeaderToolbar() {
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [gitBranch, setGitBranch] = useState<string | null>(null)

    const theme = useStudioStore((state) => state.theme)
    const toggleTheme = useStudioStore((state) => state.toggleTheme)
    const workingDir = useStudioStore((state) => state.workingDir)
    const { data: serverHealthy } = useServerHealth()
    const serverConnected = !!serverHealthy
    const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

    useEffect(() => {
        const fetchVcs = () => {
            if (!serverConnected) {
                setGitBranch(null)
                return
            }

            opencodeApi.vcs.get()
                .then((data: { branch?: string | null }) => setGitBranch(data.branch || null))
                .catch(() => setGitBranch(null))
        }

        fetchVcs()
        const timer = window.setInterval(fetchVcs, 15000)
        return () => window.clearInterval(timer)
    }, [serverConnected, workingDir])

    const openSettings = () => {
        setSettingsOpen(true)
    }

    return (
        <>
            <div className="app-header-toolbar" aria-label="Global app controls">
                {gitBranch ? (
                    <span className="app-header-toolbar__item app-header-toolbar__branch" title={`Branch: ${gitBranch}`}>
                        <GitBranch size={12} />
                    </span>
                ) : null}

                <span
                    className="app-header-toolbar__item"
                    title={serverConnected ? 'Local server connected' : 'Local server disconnected'}
                    aria-label={serverConnected ? 'Local server connected' : 'Local server disconnected'}
                >
                    {serverConnected ? (
                        <CheckCircle size={12} className="app-header-toolbar__status-icon app-header-toolbar__status-icon--ok" />
                    ) : (
                        <AlertCircle size={12} className="app-header-toolbar__status-icon app-header-toolbar__status-icon--warn" />
                    )}
                </span>

                <button type="button" className="icon-btn" onClick={toggleTheme} title={themeLabel} aria-label={themeLabel}>
                    {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
                </button>

                <button type="button" className="icon-btn" onClick={openSettings} title="Settings" aria-label="Settings">
                    <Settings size={12} />
                </button>
            </div>

            {settingsOpen ? (
                <Suspense fallback={null}>
                    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
                </Suspense>
            ) : null}
        </>
    )
}
