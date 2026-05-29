import { useMemo } from 'react'
import { RefreshCcw, RotateCw } from 'lucide-react'
import { useAppHeader } from '../../components/AppHeaderContext'
import { InjectSourceColumn } from './InjectSourceColumn'
import { InjectTargetsColumn } from './InjectTargetsColumn'
import { useInjectController } from './useInjectController'
import './InjectPage.css'

export function InjectPage() {
    const controller = useInjectController()
    const {
        error,
        loadingTargets,
        refreshTargets,
        running,
        runSync,
        syncDisabled,
        targetsReady,
        targetsResponse,
        workingDir,
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
        title: 'Sync to targets',
        subtitle: workingDir || 'No workspace selected',
        actions: headerActions,
    }), [headerActions, workingDir])

    useAppHeader(headerConfig)

    return (
        <main className="target-inject-page">
            {error ? (
                <div className="alert alert--danger target-inject-page__alert" role="alert">
                    {error}
                </div>
            ) : null}

            {!targetsReady && targetsResponse ? (
                <div className="alert alert--muted target-inject-page__alert">
                    Current target selection cannot receive the selected Studio unit.
                </div>
            ) : null}

            <div className="target-inject-layout">
                <InjectSourceColumn controller={controller} />
                <InjectTargetsColumn controller={controller} />
            </div>
        </main>
    )
}
