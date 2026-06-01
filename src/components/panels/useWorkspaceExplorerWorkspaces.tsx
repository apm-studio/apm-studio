import { useCallback, useEffect, useMemo } from 'react'
import { Folder, MoreHorizontal } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { studioApi } from '../../api-clients/studio'
import { showToast } from '../../lib/toast'
import { useStudioStore } from '../../store'
import { DropdownMenu } from '../shared/DropdownMenu'
import { LayerRow, workspaceLabel, workspaceShortPath } from './workspace-explorer-utils'

export function useWorkspaceExplorerWorkspaces() {
    const {
        workspaceId,
        workingDir,
        workspaceList,
        apmPackageScope,
        setApmPackageScope,
        newWorkspace,
        closeWorkspace,
        loadWorkspace,
        listWorkspaces,
        deleteWorkspace,
    } = useStudioStore(useShallow((state) => ({
        workspaceId: state.workspaceId,
        workingDir: state.workingDir,
        workspaceList: state.workspaceList,
        apmPackageScope: state.apmPackageScope,
        setApmPackageScope: state.setApmPackageScope,
        newWorkspace: state.newWorkspace,
        closeWorkspace: state.closeWorkspace,
        loadWorkspace: state.loadWorkspace,
        listWorkspaces: state.listWorkspaces,
        deleteWorkspace: state.deleteWorkspace,
    })))

    const openWorkspacePath = useCallback(async (targetPath: string) => {
        try {
            await studioApi.openPath(targetPath)
        } catch (error) {
            console.error('Failed to open workspace path', error)
            showToast('Studio could not open that workspace path.', 'error', {
                title: 'Open failed',
                dedupeKey: `workspace:open:${targetPath}`,
            })
        }
    }, [])

    const selectWorkspaceScope = useCallback(() => {
        setApmPackageScope('workspace')
    }, [setApmPackageScope])

    useEffect(() => {
        listWorkspaces()
    }, [listWorkspaces, workingDir])

    const workspaceRows = useMemo(() => workspaceList.map((entry) => (
        <LayerRow
            key={entry.id}
            icon={<Folder size={12} className={entry.id === workspaceId ? 'icon-active' : 'icon-muted'} />}
            label={workspaceLabel(entry.workingDir)}
            meta={workspaceShortPath(entry.workingDir)}
            active={entry.id === workspaceId && apmPackageScope === 'workspace'}
            onClick={() => {
                setApmPackageScope('workspace')
                loadWorkspace(entry.id)
            }}
            actions={
                <DropdownMenu
                    align="right"
                    trigger={(
                        <button className="icon-btn" title="Workspace actions">
                            <MoreHorizontal size={10} />
                        </button>
                    )}
                    items={[
                        {
                            label: 'Open',
                            onClick: () => {
                                void openWorkspacePath(entry.workingDir)
                            },
                        },
                        'separator',
                        {
                            label: 'Close workspace',
                            onClick: () => closeWorkspace(entry.id),
                        },
                        'separator',
                        {
                            label: 'Delete workspace',
                            onClick: () => deleteWorkspace(entry.id),
                            variant: 'danger',
                        },
                    ]}
                />
            }
        />
    )), [apmPackageScope, closeWorkspace, deleteWorkspace, loadWorkspace, openWorkspacePath, setApmPackageScope, workspaceId, workspaceList])

    return {
        apmPackageScope,
        workspaceId,
        workingDir,
        workspaceRows,
        newWorkspace,
        selectWorkspaceScope,
    }
}
