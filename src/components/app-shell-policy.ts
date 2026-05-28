import type { WorkspaceMode } from '../store/types';

export type AppSidebarMode = 'workspace-assets' | 'workspace-only';
export type AppSurfaceMode = 'workspace' | 'import' | 'export';

export type AppShellPolicy = {
    sidebarMode: AppSidebarMode
    sidebarShowsThreads: boolean
    surfaceMode: AppSurfaceMode
    showsWorkspaceTerminal: boolean
}

export function getAppShellPolicy(workspaceMode: WorkspaceMode): AppShellPolicy {
    const isWorkspaceCanvasMode = workspaceMode === 'manage' || workspaceMode === 'run';

    return {
        sidebarMode: isWorkspaceCanvasMode ? 'workspace-assets' : 'workspace-only',
        sidebarShowsThreads: workspaceMode === 'run',
        surfaceMode: workspaceMode === 'import' || workspaceMode === 'export' ? workspaceMode : 'workspace',
        showsWorkspaceTerminal: isWorkspaceCanvasMode,
    };
}
