import { Suspense, lazy, useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { AlertCircle, X } from 'lucide-react';
import { useStudioStore } from './store';
import {
  getDragIcon,
  createDragStartHandler,
  createDragEndHandler,
} from './app-dnd-handlers';
import AppShell from './components/AppShell';
import { AppHeaderContext } from './components/AppHeaderContext';
import type { AppHeaderConfig } from './components/AppHeaderContext';
import { getAppShellPolicy } from './components/app-shell-policy';
import { AppMainSurface } from './app/AppMainSurface';
import { useStudioStartup, useStudioTheme } from './app/useStudioStartup';
import { useWorkspaceAutoSave } from './app/useWorkspaceAutoSave';

const ToastViewport = lazy(() =>
  import('./features/workspace').then((module) => ({ default: module.ToastViewport })),
);
const TerminalPanel = lazy(() =>
  import('./features/workspace').then((module) => ({ default: module.TerminalPanel })),
);

export default function App() {
  const theme = useStudioStore(s => s.theme);
  const isTerminalOpen = useStudioStore(s => s.isTerminalOpen);
  const setTerminalOpen = useStudioStore(s => s.setTerminalOpen);
  const workspaceMode = useStudioStore(s => s.workspaceMode);
  const viewMode = useStudioStore(s => s.viewMode);
  const isAnyFullscreenActive = viewMode !== 'canvas';
  const shellPolicy = getAppShellPolicy(workspaceMode);

  useWorkspaceAutoSave();
  useStudioTheme();
  useStudioStartup();

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
              <AppMainSurface
                shellPolicy={shellPolicy}
                isAnyFullscreenActive={isAnyFullscreenActive}
              />
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
