import { Suspense, lazy, type ReactNode } from 'react';
import AppModeHeader from './AppModeHeader';
import type { AppHeaderConfig } from './AppHeaderContext';
import type { AppSidebarMode } from './app-shell-policy';

const LeftSidebar = lazy(() => import('./panels/LeftSidebar'));

type AppShellProps = {
    children: ReactNode
    pageHeader: AppHeaderConfig | null
    sidebarMode: AppSidebarMode
    sidebarShowsThreads: boolean
}

export default function AppShell({ children, pageHeader, sidebarMode, sidebarShowsThreads }: AppShellProps) {
    return (
        <>
            <AppModeHeader pageHeader={pageHeader} />
            <div className="studio-shell">
                <Suspense fallback={null}>
                    <LeftSidebar mode={sidebarMode} showThreads={sidebarShowsThreads} />
                </Suspense>
                <div className="studio-main">
                    {children}
                </div>
            </div>
        </>
    );
}
