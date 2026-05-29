import { Suspense, lazy, useState, useCallback, useEffect, useRef } from 'react';
import { ChevronRight, LayoutGrid } from 'lucide-react';
import { useStudioStore } from '../../store';
import type { AppSidebarMode } from '../app-shell-policy';
import WorkspaceExplorer from './WorkspaceExplorer';
import './LeftSidebar.css';

const PackageLibrary = lazy(() =>
    import('../../features/packages').then((module) => ({ default: module.PackageLibrary })),
);

type LeftSidebarProps = {
    mode?: AppSidebarMode
    showThreads?: boolean
}

export default function LeftSidebar({ mode = 'workspace-primitives', showThreads = true }: LeftSidebarProps) {
    const isPackageLibraryOpen = useStudioStore((s) => s.isPackageLibraryOpen);
    const setPackageLibraryOpen = useStudioStore((s) => s.setPackageLibraryOpen);
    const focusSnapshot = useStudioStore((s) => s.focusSnapshot);
    const [sidebarWidth, setSidebarWidth] = useState(240);
    const [drawerWidth, setDrawerWidth] = useState(320);

    const suppressNextClick = useCallback(() => {
        const handleClickCapture = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            document.removeEventListener('click', handleClickCapture, true);
        };

        document.addEventListener('click', handleClickCapture, true);
        window.setTimeout(() => {
            document.removeEventListener('click', handleClickCapture, true);
        }, 0);
    }, []);

    const useResize = (setter: (w: number) => void, min: number, max: number) => {
        const dragging = useRef(false);

        const onMouseDown = useCallback((e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            dragging.current = true;
            const startX = e.clientX;
            const startW = (() => {
                const el = (e.target as HTMLElement).parentElement;
                return el ? el.getBoundingClientRect().width : 240;
            })();

            const onMove = (ev: MouseEvent) => {
                if (!dragging.current) return;
                const delta = ev.clientX - startX;
                setter(Math.min(max, Math.max(min, startW + delta)));
            };
            const onUp = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                dragging.current = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                suppressNextClick();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }, [setter, min, max]);

        return onMouseDown;
    };

    const onSidebarResize = useResize(setSidebarWidth, 180, 400);
    const onDrawerResize = useResize(setDrawerWidth, 240, 480);

    const isFocusActive = !!focusSnapshot;
    const workspaceOnly = mode === 'workspace-only';
    const canUsePackageLibrary = !isFocusActive && mode === 'workspace-primitives';
    const isPackageDrawerOpen = canUsePackageLibrary && isPackageLibraryOpen;

    useEffect(() => {
        if (!canUsePackageLibrary && isPackageLibraryOpen) {
            setPackageLibraryOpen(false);
        }
    }, [canUsePackageLibrary, isPackageLibraryOpen, setPackageLibraryOpen]);

    return (
        <div className={`sidebar-container ${isPackageDrawerOpen ? 'sidebar-container--drawer-open' : ''}`}>
            <div className="sidebar" style={{ width: sidebarWidth }}>
                <div className="sidebar-main-top" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <WorkspaceExplorer workspaceOnly={workspaceOnly} showThreads={showThreads} />
                </div>
                {canUsePackageLibrary && (
                    <div className="sidebar-main-bottom sidebar-main-bottom--package-drawer">
                        <button
                            className={`package-library-btn ${isPackageDrawerOpen ? 'active' : ''}`}
                            onClick={() => setPackageLibraryOpen(!isPackageLibraryOpen)}
                        >
                            <LayoutGrid size={14} />
                            <span>Packages</span>
                            <ChevronRight size={12} className={`package-library-arrow ${isPackageDrawerOpen ? 'rotated' : ''}`} />
                        </button>
                    </div>
                )}
                <div
                    className="sidebar-resize-handle"
                    onMouseDown={onSidebarResize}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                />
            </div>
            <div
                className={`sidebar-drawer left-drawer ${isPackageDrawerOpen ? 'open' : ''}`}
                style={isPackageDrawerOpen ? { width: drawerWidth } : undefined}
            >
                <div
                    className="sidebar-resize-handle sidebar-resize-handle--drawer"
                    onMouseDown={onDrawerResize}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                />
                {isPackageDrawerOpen ? (
                    <Suspense fallback={null}>
                        <PackageLibrary onClose={() => setPackageLibraryOpen(false)} />
                    </Suspense>
                ) : null}
            </div>
        </div>
    );
}
