import { Compass, PenTool, Play, RefreshCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStudioStore } from '../store'
import type { WorkspaceMode } from '../store/types'
import './AppModeHeader.css'

type AppModeOption = {
    mode: WorkspaceMode
    label: string
    icon: ReactNode
    title: string
}

const APP_MODE_OPTIONS: AppModeOption[] = [
    {
        mode: 'explore',
        label: 'Explore',
        icon: <Compass size={13} />,
        title: 'Explore presets and community package sources',
    },
    {
        mode: 'canvas',
        label: 'Design',
        icon: <PenTool size={13} />,
        title: 'Design local packages on the Studio canvas',
    },
    {
        mode: 'run',
        label: 'Run',
        icon: <Play size={13} />,
        title: 'Run agents, teams, terminals, and live assistant sessions',
    },
    {
        mode: 'agent-sync',
        label: 'Sync',
        icon: <RefreshCcw size={13} />,
        title: 'Sync local packages into external assistants',
    },
]

function workspaceLabel(workingDir: string) {
    if (!workingDir) {
        return 'No workspace selected'
    }

    const parts = workingDir.split('/').filter(Boolean)
    return parts.at(-1) || workingDir
}

export default function AppModeHeader() {
    const workspaceMode = useStudioStore((state) => state.workspaceMode)
    const setWorkspaceMode = useStudioStore((state) => state.setWorkspaceMode)
    const workingDir = useStudioStore((state) => state.workingDir)

    return (
        <header className="app-mode-header">
            <div className="app-mode-header__identity" title={workingDir || undefined}>
                <div className="app-mode-header__brand">
                    <span className="app-mode-header__mark">8PM</span>
                    <span className="app-mode-header__workspace">{workspaceLabel(workingDir)}</span>
                </div>
                <div className="app-mode-header__status" aria-label="Studio runtime context">
                    <span>Local</span>
                    <span>APM</span>
                    <span>Codex</span>
                </div>
            </div>
            <nav className="app-mode-header__nav" aria-label="Studio mode">
                {APP_MODE_OPTIONS.map((option) => (
                    <button
                        key={option.mode}
                        type="button"
                        className={`app-mode-header__mode ${workspaceMode === option.mode ? 'is-active' : ''}`}
                        aria-pressed={workspaceMode === option.mode}
                        title={option.title}
                        onClick={() => setWorkspaceMode(option.mode)}
                    >
                        {option.icon}
                        <span>{option.label}</span>
                    </button>
                ))}
            </nav>
        </header>
    )
}
