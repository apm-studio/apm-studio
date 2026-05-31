import { useMemo } from 'react'
import { RefreshCcw, RotateCw } from 'lucide-react'
import { useAppHeader } from '../../components/AppHeaderContext'
import { TargetManageSourceColumn } from './TargetManageSourceColumn'
import { TargetManageTargetsColumn } from './TargetManageTargetsColumn'
import { useTargetManageController } from './useTargetManageController'
import '../../components/panels/PackageLibrary.css'
import './TargetManagePage.css'

export function TargetManagePage() {
    const controller = useTargetManageController()
    const {
        error,
        loadingTargets,
        refreshTargets,
        running,
        runSync,
        syncDisabled,
    } = controller

    const headerActions = useMemo(() => (
        <>
            <button className="btn" type="button" onClick={() => void refreshTargets()} disabled={loadingTargets || running}>
                <RefreshCcw size={13} />
                Refresh
            </button>
            <button className="btn btn--primary" type="button" onClick={() => void runSync()} disabled={syncDisabled}>
                <RotateCw size={13} />
                {running ? 'Syncing' : 'Sync'}
            </button>
        </>
    ), [loadingTargets, refreshTargets, runSync, running, syncDisabled])
    const headerConfig = useMemo(() => ({
        actions: headerActions,
        hideContext: true,
    }), [headerActions])

    useAppHeader(headerConfig)

    return (
        <main className="target-manage-page">
            {error ? (
                <div className="alert alert--danger target-manage-page__alert" role="alert">
                    {error}
                </div>
            ) : null}

            <div className="target-manage-layout">
                <TargetManageSourceColumn controller={controller} />
                <TargetManageTargetsColumn controller={controller} />
            </div>
        </main>
    )
}
