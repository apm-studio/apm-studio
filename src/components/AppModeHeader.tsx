import { PackagePlus, Play, Upload, Wrench } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStudioStore } from '../store'
import type { WorkspaceMode } from '../store/workspace/types'
import { getCanvasViewportSize } from '../lib/focus-utils'
import StudioViewHeader from './canvas/StudioViewHeader'
import type { AppHeaderConfig } from './AppHeaderContext'
import './AppModeHeader.css'

type AppModeOption = {
    mode: WorkspaceMode
    label: string
    icon: ReactNode
    title: string
}

const APP_MODE_OPTIONS: AppModeOption[] = [
    {
        mode: 'import',
        label: 'Import',
        icon: <PackagePlus size={13} />,
        title: 'Import packages and source primitives from GitHub',
    },
    {
        mode: 'manage',
        label: 'Manage',
        icon: <Wrench size={13} />,
        title: 'Edit and manage local APM packages on the canvas',
    },
    {
        mode: 'run',
        label: 'Run',
        icon: <Play size={13} />,
        title: 'Run local agents and teams in Full or Split view',
    },
    {
        mode: 'inject',
        label: 'Inject',
        icon: <Upload size={13} />,
        title: 'Sync local package units into external assistant targets',
    },
]

function workspaceLabel(workingDir: string) {
    if (!workingDir) {
        return 'No workspace selected'
    }

    const parts = workingDir.split('/').filter(Boolean)
    return parts.at(-1) || workingDir
}

type AppModeHeaderProps = {
    pageHeader: AppHeaderConfig | null
}

function modeContextLabel(mode: WorkspaceMode) {
    if (mode === 'import') return 'Import packages and source primitives'
    if (mode === 'inject') return 'Sync assistant targets'
    if (mode === 'run') return 'Run workspace'
    return 'Manage workspace'
}

export default function AppModeHeader({ pageHeader }: AppModeHeaderProps) {
    const workspaceMode = useStudioStore((state) => state.workspaceMode)
    const setWorkspaceMode = useStudioStore((state) => state.setWorkspaceMode)
    const workingDir = useStudioStore((state) => state.workingDir)
    const viewMode = useStudioStore((state) => state.viewMode)
    const showCanvasChrome = workspaceMode === 'manage' || workspaceMode === 'run'

    const selectMode = (mode: WorkspaceMode) => {
        setWorkspaceMode(mode)
        const state = useStudioStore.getState()
        if (mode === 'manage') {
            state.exitFocusMode()
            return
        }
        if (mode !== 'run' || viewMode !== 'canvas') {
            return
        }

        const viewportSize = getCanvasViewportSize()
        if (state.selectedTeamId) {
            state.enterFocusMode(state.selectedTeamId, 'team', viewportSize)
            return
        }
        if (state.selectedAgentId) {
            state.enterFocusMode(state.selectedAgentId, 'agent', viewportSize)
            return
        }
        state.enterEmptyFullView()
    }

    return (
        <header className={`app-mode-header app-mode-header--${workspaceMode}`}>
            <div className="app-mode-header__base">
                <div className="app-mode-header__brand" title={workingDir || undefined}>
                    <span className="app-mode-header__mark" aria-hidden="true">APM</span>
                    <span className="app-mode-header__brand-copy">
                        <span className="app-mode-header__product">APM Studio</span>
                        <span className="app-mode-header__workspace">{workspaceLabel(workingDir)}</span>
                    </span>
                </div>
                <nav className="app-mode-header__nav" aria-label="Studio mode">
                    {APP_MODE_OPTIONS.map((option) => (
                        <button
                            key={option.mode}
                            type="button"
                            className={`app-mode-header__mode ${workspaceMode === option.mode ? 'is-active' : ''}`}
                            aria-pressed={workspaceMode === option.mode}
                            title={option.title}
                            onClick={() => selectMode(option.mode)}
                        >
                            {option.icon}
                            <span>{option.label}</span>
                        </button>
                    ))}
                </nav>
            </div>
            {showCanvasChrome ? (
                <StudioViewHeader />
            ) : (
                <div className="app-mode-header__page">
                    <div className="app-mode-header__page-context">
                        <span className="app-mode-header__page-title">{pageHeader?.title || modeContextLabel(workspaceMode)}</span>
                        {pageHeader?.subtitle ? (
                            <span className="app-mode-header__page-subtitle">{pageHeader.subtitle}</span>
                        ) : null}
                    </div>
                    {pageHeader?.actions ? (
                        <div className="app-mode-header__page-actions">{pageHeader.actions}</div>
                    ) : null}
                </div>
            )}
        </header>
    )
}
