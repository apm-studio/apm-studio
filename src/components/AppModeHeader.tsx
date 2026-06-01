import { Bot, PackagePlus, Upload } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStudioStore } from '../store'
import type { WorkspaceMode } from '../store/workspace/types'
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
        mode: 'studio-agent',
        label: 'Studio Agent',
        icon: <Bot size={13} />,
        title: 'Edit and run local Studio Agents',
    },
    {
        mode: 'export',
        label: 'Export',
        icon: <Upload size={13} />,
        title: 'Export APM primitives to assistant targets',
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
    if (mode === 'export') return 'Export assistant targets'
    return 'Studio Agent workspace'
}

export default function AppModeHeader({ pageHeader }: AppModeHeaderProps) {
    const workspaceMode = useStudioStore((state) => state.workspaceMode)
    const setWorkspaceMode = useStudioStore((state) => state.setWorkspaceMode)
    const workingDir = useStudioStore((state) => state.workingDir)
    const showCanvasChrome = workspaceMode === 'studio-agent'
    const shouldRenderPageHeader = !pageHeader?.hideContext || pageHeader?.actions

    const selectMode = (mode: WorkspaceMode) => {
        setWorkspaceMode(mode)
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
            ) : shouldRenderPageHeader ? (
                <div className={`app-mode-header__page ${pageHeader?.hideContext ? 'app-mode-header__page--actions-only' : ''}`}>
                    {!pageHeader?.hideContext ? (
                        <div className="app-mode-header__page-context">
                            <span className="app-mode-header__page-title">{pageHeader?.title || modeContextLabel(workspaceMode)}</span>
                            {pageHeader?.subtitle ? (
                                <span className="app-mode-header__page-subtitle">{pageHeader.subtitle}</span>
                            ) : null}
                        </div>
                    ) : null}
                    {pageHeader?.actions ? (
                        <div className="app-mode-header__page-actions">{pageHeader.actions}</div>
                    ) : null}
                </div>
            ) : null}
        </header>
    )
}
