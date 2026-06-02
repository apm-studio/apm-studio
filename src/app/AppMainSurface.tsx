import { Suspense, lazy, useEffect, useState } from 'react'
import { CanvasArea } from '../features/workspace'
import { useStudioStore } from '../store'
import type { AppShellPolicy } from '../components/app-shell-policy'
import {
    INITIAL_CACHED_MAIN_SURFACES,
    rememberMainSurface,
    shouldRenderMainSurface,
} from './app-main-surface-state'
import { shouldRenderStudioAgentAssistantPanel } from './studio-agent-ui-state'

const TargetExportPage = lazy(() =>
    import('../features/target-export').then((module) => ({ default: module.TargetExportPage })),
)
const ImportPage = lazy(() => import('../features/import/ImportPage'))
const AssistantChat = lazy(() =>
    import('../features/assistant/AssistantChat').then((module) => ({ default: module.AssistantChat })),
)
const WorkspaceTrackingPanel = lazy(() =>
    import('../features/workspace/WorkspaceTrackingPanel').then((module) => ({ default: module.WorkspaceTrackingPanel })),
)

type AppMainSurfaceProps = {
    shellPolicy: AppShellPolicy
    isAnyFullscreenActive: boolean
}

export function AppMainSurface({ shellPolicy, isAnyFullscreenActive }: AppMainSurfaceProps) {
    const isTrackingOpen = useStudioStore((state) => state.isTrackingOpen)
    const isAssistantOpen = useStudioStore((state) => state.isAssistantOpen)
    const activeSurfaceMode = shellPolicy.surfaceMode
    const [cachedSurfaces, setCachedSurfaces] = useState(() => (
        rememberMainSurface(INITIAL_CACHED_MAIN_SURFACES, activeSurfaceMode)
    ))

    useEffect(() => {
        // Cache only records which expensive route panes were visited; the active pane renders before this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCachedSurfaces((current) => rememberMainSurface(current, activeSurfaceMode))
    }, [activeSurfaceMode])

    const renderTargetExport = shouldRenderMainSurface(cachedSurfaces, activeSurfaceMode, 'target-export')
    const renderImport = shouldRenderMainSurface(cachedSurfaces, activeSurfaceMode, 'import')
    // APM Assistant remains implemented but is hidden from Studio Agent UI until its UX is upgraded.
    // Re-enable through studio-agent-ui-state instead of deleting/restoring Assistant code.
    const renderAssistantPanel = shouldRenderStudioAgentAssistantPanel({
        isAssistantOpen,
        isAnyFullscreenActive,
    })

    return (
        <>
            {activeSurfaceMode === 'workspace' ? (
                <>
                    <CanvasArea />
                    {!isAnyFullscreenActive && (
                        <Suspense fallback={null}>
                            {isTrackingOpen ? (
                                <WorkspaceTrackingPanel />
                            ) : renderAssistantPanel ? (
                                <AssistantChat />
                            ) : null}
                        </Suspense>
                    )}
                </>
            ) : null}

            {renderTargetExport ? (
                <div
                    className="app-main-surface-pane"
                    hidden={activeSurfaceMode !== 'target-export'}
                    aria-hidden={activeSurfaceMode !== 'target-export'}
                >
                    <Suspense fallback={null}>
                        <TargetExportPage active={activeSurfaceMode === 'target-export'} />
                    </Suspense>
                </div>
            ) : null}

            {renderImport ? (
                <div
                    className="app-main-surface-pane"
                    hidden={activeSurfaceMode !== 'import'}
                    aria-hidden={activeSurfaceMode !== 'import'}
                >
                    <Suspense fallback={null}>
                        <ImportPage active={activeSurfaceMode === 'import'} />
                    </Suspense>
                </div>
            ) : null}
        </>
    )
}
