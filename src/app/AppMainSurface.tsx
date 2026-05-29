import { Suspense, lazy } from 'react'
import { CanvasArea } from '../features/workspace'
import { useStudioStore } from '../store'
import type { AppShellPolicy } from '../components/app-shell-policy'

const InjectPage = lazy(() =>
    import('../features/inject').then((module) => ({ default: module.InjectPage })),
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

    if (shellPolicy.surfaceMode === 'inject') {
        return (
            <Suspense fallback={null}>
                <InjectPage />
            </Suspense>
        )
    }

    if (shellPolicy.surfaceMode === 'import') {
        return (
            <Suspense fallback={null}>
                <ImportPage />
            </Suspense>
        )
    }

    return (
        <>
            <CanvasArea />
            {!isAnyFullscreenActive && (
                <Suspense fallback={null}>
                    {isTrackingOpen ? (
                        <WorkspaceTrackingPanel />
                    ) : isAssistantOpen ? (
                        <AssistantChat />
                    ) : null}
                </Suspense>
            )}
        </>
    )
}
