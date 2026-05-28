import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { AlertCircle, X } from 'lucide-react';
import { useStudioStore } from './store';
import { CanvasArea } from './features/workspace';
import { api, setApiWorkingDirContext } from './api';
import {
  getDragIcon,
  createDragStartHandler,
  createDragEndHandler,
} from './app-dnd-handlers';
import {
  clearStartupAssetTargetFromUrl,
  openStartupAssetTarget,
  readStartupAssetTarget,
} from './lib/startup-asset-target';
import { resolveStartupWorkspaceTarget } from './lib/startup-workspace';
import AppShell from './components/AppShell';
import { AppHeaderContext } from './components/AppHeaderContext';
import type { AppHeaderConfig } from './components/AppHeaderContext';
import { getAppShellPolicy } from './components/app-shell-policy';

const ToastViewport = lazy(() =>
  import('./features/workspace').then((module) => ({ default: module.ToastViewport })),
);
const TerminalPanel = lazy(() =>
  import('./features/workspace').then((module) => ({ default: module.TerminalPanel })),
);
const ExportPage = lazy(() =>
  import('./features/export').then((module) => ({ default: module.ExportPage })),
);
const ExplorePresetCatalog = lazy(() => import('./features/explore/ExplorePresetCatalog'));
const AssistantChat = lazy(() =>
  import('./features/assistant/AssistantChat').then((module) => ({ default: module.AssistantChat })),
);
const WorkspaceTrackingPanel = lazy(() =>
  import('./features/workspace/WorkspaceTrackingPanel').then((module) => ({ default: module.WorkspaceTrackingPanel })),
);

export default function App() {
  const theme = useStudioStore(s => s.theme);
  const workingDir = useStudioStore(s => s.workingDir);
  const performers = useStudioStore(s => s.performers);
  const acts = useStudioStore(s => s.acts);
  const drafts = useStudioStore(s => s.drafts);
  const markdownEditors = useStudioStore(s => s.markdownEditors);
  const chatKeyToSession = useStudioStore(s => s.chatKeyToSession);
  const canvasTerminals = useStudioStore(s => s.canvasTerminals);

  const workspaceDirty = useStudioStore(s => s.workspaceDirty);
  const isTerminalOpen = useStudioStore(s => s.isTerminalOpen);
  const setTerminalOpen = useStudioStore(s => s.setTerminalOpen);
  const isTrackingOpen = useStudioStore(s => s.isTrackingOpen);
  const isAssistantOpen = useStudioStore(s => s.isAssistantOpen);
  const workspaceMode = useStudioStore(s => s.workspaceMode);
  const viewMode = useStudioStore(s => s.viewMode);
  const isAnyFullscreenActive = viewMode !== 'canvas';
  const shellPolicy = getAppShellPolicy(workspaceMode);

  const isInitialMount = useRef(true);

  const isStudioTheme = (value: string | undefined): value is 'light' | 'dark' => (
    value === 'light' || value === 'dark'
  );

  // Auto-save Workspace configuration (debounced 2 seconds)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!workspaceDirty) {
      return;
    }

    const timer = setTimeout(() => {
      useStudioStore.getState().saveWorkspace();
    }, 2000);

    return () => clearTimeout(timer);
  }, [workspaceDirty, performers, acts, drafts, markdownEditors, workingDir, chatKeyToSession, canvasTerminals]);

  // Apply theme to HTML root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Initialize server events and auto-restore last session
  useEffect(() => {
    const store = useStudioStore.getState();
    store.initRealtimeEvents();
    const startupAssetTarget = readStartupAssetTarget(window.location.search);

    // Auto-restore: load studio config → apply theme → restore the requested workspace path
    api.studio.getConfig()
      .then(async (config) => {
        setApiWorkingDirContext(config.projectDir || null);
        if (isStudioTheme(config.theme) && config.theme !== useStudioStore.getState().theme) {
          useStudioStore.setState({ theme: config.theme });
          localStorage.setItem('apm-theme', config.theme);
        }

        const workspaces = await api.workspaces.list(config.projectDir ? true : false).catch(() => []);
        const startupTarget = resolveStartupWorkspaceTarget(config, workspaces);

        if (startupTarget.kind === 'workspace') {
          await useStudioStore.getState().loadWorkspace(startupTarget.workspaceId);
        } else if (startupTarget.kind === 'project-dir') {
          const currentWorkingDir = useStudioStore.getState().workingDir;
          if (currentWorkingDir !== startupTarget.projectDir) {
            useStudioStore.getState().setWorkingDir(startupTarget.projectDir);
          }
        }

        if (startupAssetTarget) {
          try {
            await openStartupAssetTarget(startupAssetTarget);
          } finally {
            clearStartupAssetTargetFromUrl();
          }
        }
      })
      .catch(() => { /* server not up yet, skip restore */ });

    return () => {
      useStudioStore.getState().cleanupRealtimeEvents();
    };
  }, []);

  const [activeDrag, setActiveDrag] = useState<{ kind: string; label: string } | null>(null);
  const [dropWarning, setDropWarning] = useState<string | null>(null);
  const [dropWarningVersion, setDropWarningVersion] = useState(0);
  const [termHeight, setTermHeight] = useState(250);
  const [pageHeader, setPageHeader] = useState<AppHeaderConfig | null>(null);

  useEffect(() => {
    if (!dropWarning) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setDropWarning(null);
    }, 4800);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [dropWarning, dropWarningVersion]);

  const showDropWarning = (message: string) => {
    setDropWarning(message);
    setDropWarningVersion((current) => current + 1);
  };

  const clearActiveDrag = () => {
    setActiveDrag(null);
  };

  const handleDragStart = createDragStartHandler(setActiveDrag);
  const handleDragEnd = createDragEndHandler(clearActiveDrag, showDropWarning);

  const mainSurface = shellPolicy.surfaceMode === 'export' ? (
    <Suspense fallback={null}>
      <ExportPage />
    </Suspense>
  ) : shellPolicy.surfaceMode === 'import' ? (
    <Suspense fallback={null}>
      <ExplorePresetCatalog />
    </Suspense>
  ) : (
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
  );

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={`studio-app theme-${theme}`}>

        {dropWarning ? (
          <div className="app-warning-banner" role="status" aria-live="polite">
            <div className="app-warning-banner__copy">
              <AlertCircle size={13} />
              <span>{dropWarning}</span>
            </div>
            <button className="icon-btn" onClick={() => setDropWarning(null)} title="Dismiss warning">
              <X size={12} />
            </button>
          </div>
        ) : null}
        <AppHeaderContext.Provider value={setPageHeader}>
          <ReactFlowProvider>
            <AppShell
              pageHeader={pageHeader}
              sidebarMode={shellPolicy.sidebarMode}
              sidebarShowsThreads={shellPolicy.sidebarShowsThreads}
            >
              {mainSurface}
            </AppShell>
            {shellPolicy.showsWorkspaceTerminal && !isAnyFullscreenActive && (
              <Suspense fallback={null}>
                <TerminalPanel
                  isOpen={isTerminalOpen}
                  onToggle={() => setTerminalOpen(!isTerminalOpen)}
                  height={termHeight}
                  onHeightChange={setTermHeight}
                />
              </Suspense>
            )}
          </ReactFlowProvider>
        </AppHeaderContext.Provider>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="drag-overlay-card">
            {getDragIcon(activeDrag.kind)}
            <span>{activeDrag.label}</span>
          </div>
        ) : null}
      </DragOverlay>
      <Suspense fallback={null}>
        <ToastViewport />
      </Suspense>
    </DndContext>
  );
}
