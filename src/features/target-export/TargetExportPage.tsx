import { useMemo } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { useAppHeader } from '../../components/AppHeaderContext'
import { useStudioStore } from '../../store'
import { TargetExportSourceColumn, TargetExportSourceControls } from './TargetExportSourceColumn'
import { TargetExportTargetsColumn } from './TargetExportTargetsColumn'
import { useTargetExportController } from './useTargetExportController'
import '../../components/panels/PackageLibrary.css'
import './TargetExportPage.css'

export function TargetExportPage() {
    const controller = useTargetExportController()
    const apmPackageScope = useStudioStore((state) => state.apmPackageScope)
    const {
        error,
        revertDisabled,
        revertExportChanges,
        running,
        saveDisabled,
        saveExport,
    } = controller

    const headerActions = useMemo(() => (
        <>
            <button className="btn" type="button" onClick={revertExportChanges} disabled={revertDisabled}>
                <RotateCcw size={13} />
                Revert
            </button>
            <button className="btn btn--primary" type="button" onClick={() => void saveExport()} disabled={saveDisabled}>
                <Save size={13} />
                {running ? 'Saving' : 'Save'}
            </button>
        </>
    ), [revertDisabled, revertExportChanges, running, saveDisabled, saveExport])
    const headerConfig = useMemo(() => ({
        actions: headerActions,
        hideContext: true,
    }), [headerActions])

    useAppHeader(headerConfig)

    return (
        <main className="target-export-page">
            {error ? (
                <div className="alert alert--danger target-export-page__alert" role="alert">
                    {error}
                </div>
            ) : null}

            <TargetExportSourceControls controller={controller} scope={apmPackageScope} />

            <div className="target-export-layout">
                <TargetExportSourceColumn controller={controller} scope={apmPackageScope} />
                <TargetExportTargetsColumn controller={controller} />
            </div>
        </main>
    )
}
