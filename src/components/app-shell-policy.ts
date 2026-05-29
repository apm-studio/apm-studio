import type { WorkspaceMode } from '../store/workspace/types';

export type AppSidebarMode = 'workspace-primitives' | 'workspace-only';
export type AppSurfaceMode = 'workspace' | 'import' | 'inject';

export type AppShellPolicy = {
    sidebarMode: AppSidebarMode
    sidebarShowsThreads: boolean
    surfaceMode: AppSurfaceMode
    showsWorkspaceTerminal: boolean
}

export function getAppShellPolicy(workspaceMode: WorkspaceMode): AppShellPolicy {
    const isWorkspaceCanvasMode = workspaceMode === 'manage' || workspaceMode === 'run';

    return {
        sidebarMode: isWorkspaceCanvasMode ? 'workspace-primitives' : 'workspace-only',
        sidebarShowsThreads: workspaceMode === 'run',
        surfaceMode: workspaceMode === 'import' || workspaceMode === 'inject' ? workspaceMode : 'workspace',
        showsWorkspaceTerminal: isWorkspaceCanvasMode,
    };
}
