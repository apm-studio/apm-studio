import { useMemo, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { useAppHeader } from '../../components/AppHeaderContext'
import { useStudioStore } from '../../store'
import { TargetExportSourceColumn, TargetExportSourceControls } from './TargetExportSourceColumn'
import { TargetExportAssetDetailsModal } from './TargetExportAssetDetailsModal'
import { TargetExportTargetsColumn } from './TargetExportTargetsColumn'
import { useTargetExportController, type TargetExportControllerState } from './useTargetExportController'
import type { TargetExportAssetDetailRequest } from './target-export-detail-model'
import '../../components/panels/PackageLibrary.css'
import './TargetExportPage.css'

interface TargetExportPageProps {
    active?: boolean
}

function TargetExportHeader({
    controller,
    userWorkspaceMode,
}: {
    controller: TargetExportControllerState
    userWorkspaceMode: boolean
}) {
    const {
        revertExportChanges,
        running,
        saveExport,
    } = controller
    const revertDisabled = userWorkspaceMode ? controller.scopeCopyRevertDisabled : controller.targetSyncRevertDisabled
    const saveDisabled = userWorkspaceMode ? controller.scopeCopySaveDisabled : controller.targetSyncSaveDisabled

    const headerActions = useMemo(() => (
        <>
            <button
                className="btn"
                type="button"
                onClick={() => revertExportChanges({
                    copyScopes: userWorkspaceMode,
                    syncTargets: !userWorkspaceMode,
                })}
                disabled={revertDisabled}
            >
                <RotateCcw size={13} />
                Revert
            </button>
            <button
                className="btn btn--primary"
                type="button"
                onClick={() => void saveExport({
                    copyScopes: userWorkspaceMode,
                    syncTargets: !userWorkspaceMode,
                })}
                disabled={saveDisabled}
            >
                <Save size={13} />
                {running ? 'Saving' : 'Save'}
            </button>
        </>
    ), [revertDisabled, revertExportChanges, running, saveDisabled, saveExport, userWorkspaceMode])
    const headerConfig = useMemo(() => ({
        actions: headerActions,
        hideContext: true,
    }), [headerActions])

    useAppHeader(headerConfig)
    return null
}

export function TargetExportPage({ active = true }: TargetExportPageProps) {
    const controller = useTargetExportController()
    const apmPackageScope = useStudioStore((state) => state.apmPackageScope)
    const userWorkspaceMode = apmPackageScope === 'user'
    const [assetDetailRequest, setAssetDetailRequest] = useState<TargetExportAssetDetailRequest | null>(null)
    const {
        error,
    } = controller

    return (
        <>
            {active ? <TargetExportHeader controller={controller} userWorkspaceMode={userWorkspaceMode} /> : null}
            <main className="target-export-page">
                {error ? (
                    <div className="alert alert--danger target-export-page__alert" role="alert">
                        {error}
                    </div>
                ) : null}

                <TargetExportSourceControls controller={controller} />

                <div className="target-export-layout">
                    <TargetExportSourceColumn
                        controller={controller}
                        onOpenDetails={setAssetDetailRequest}
                        scope={userWorkspaceMode ? 'user' : 'workspace'}
                        targetStageEnabled={!userWorkspaceMode}
                    />
                    {userWorkspaceMode ? (
                        <TargetExportSourceColumn
                            controller={controller}
                            onOpenDetails={setAssetDetailRequest}
                            scope="workspace"
                            targetStageEnabled={false}
                        />
                    ) : (
                        <TargetExportTargetsColumn
                            controller={controller}
                            onOpenDetails={setAssetDetailRequest}
                        />
                    )}
                </div>
                <TargetExportAssetDetailsModal
                    request={assetDetailRequest}
                    onClose={() => setAssetDetailRequest(null)}
                />
            </main>
        </>
    )
}
