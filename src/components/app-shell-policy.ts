import type { WorkspaceMode } from '../store/workspace/types'

export type AppSidebarMode = 'workspace-primitives' | 'workspace-only'
export type AppSurfaceMode = 'workspace' | 'import' | 'target-manage'

export type AppShellPolicy = {
    sidebarMode: AppSidebarMode
    sidebarShowsThreads: boolean
    surfaceMode: AppSurfaceMode
    showsWorkspaceTerminal: boolean
}

export function getAppShellPolicy(workspaceMode: WorkspaceMode): AppShellPolicy {
    const isWorkspaceCanvasMode = workspaceMode === 'studio-agent'

    return {
        sidebarMode: isWorkspaceCanvasMode ? 'workspace-primitives' : 'workspace-only',
        sidebarShowsThreads: false,
        surfaceMode: workspaceMode === 'import'
            ? 'import'
            : workspaceMode === 'manage'
                ? 'target-manage'
                : 'workspace',
        showsWorkspaceTerminal: isWorkspaceCanvasMode,
    }
}
