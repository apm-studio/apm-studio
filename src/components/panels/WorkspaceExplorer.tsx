import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import WorkspaceExplorerApmUserSection from './WorkspaceExplorerApmUserSection'
import WorkspaceExplorerWorkspacesSection from './WorkspaceExplorerWorkspacesSection'
import WorkspaceExplorerThreadsSection from './WorkspaceExplorerThreadsSection'
import { useWorkspaceExplorerThreadsController } from './useWorkspaceExplorerThreadsController'
import { useWorkspaceExplorerWorkspaces } from './useWorkspaceExplorerWorkspaces'
import './WorkspaceExplorer.css'
import './WorkspaceExplorerItems.css'

type WorkspaceExplorerProps = {
    workspaceOnly?: boolean
    showThreads?: boolean
    showApmUserScope?: boolean
}

export default function WorkspaceExplorer({
    workspaceOnly = false,
    showThreads = true,
    showApmUserScope = false,
}: WorkspaceExplorerProps) {
    return workspaceOnly
        ? <WorkspaceOnlyExplorer showApmUserScope={showApmUserScope} />
        : <WorkspaceExplorerFull showThreads={showThreads} showApmUserScope={showApmUserScope} />
}

function WorkspaceOnlyExplorer({ showApmUserScope }: { showApmUserScope: boolean }) {
    const { apmPackageScope, workingDir, workspaceRows, newWorkspace, selectWorkspaceScope } = useWorkspaceExplorerWorkspaces()
    const openWorkspace = () => {
        selectWorkspaceScope()
        newWorkspace()
    }

    return (
        <div className="explorer explorer--stacked explorer--workspace-only">
            {showApmUserScope ? <WorkspaceExplorerApmUserSection /> : null}
            <WorkspaceExplorerWorkspacesSection
                workspacesHeight={208}
                workspaceRows={workspaceRows}
                workingDir={workingDir}
                workspaceScopeActive={apmPackageScope === 'workspace'}
                onOpenWorkspace={openWorkspace}
                onSelectWorkspaceScope={selectWorkspaceScope}
                fill
            />
        </div>
    )
}

function WorkspaceExplorerFull({ showThreads, showApmUserScope }: { showThreads: boolean; showApmUserScope: boolean }) {
    const { workspacesHeight, onDividerMouseDown } = useWorkspaceSectionResize(208)
    const { apmPackageScope, workingDir, workspaceRows, newWorkspace, selectWorkspaceScope } = useWorkspaceExplorerWorkspaces()
    const threadSectionProps = useWorkspaceExplorerThreadsController({ showThreads, workingDir })
    const openWorkspace = () => {
        selectWorkspaceScope()
        newWorkspace()
    }

    return (
        <div className="explorer explorer--stacked">
            {showApmUserScope ? <WorkspaceExplorerApmUserSection /> : null}
            <WorkspaceExplorerWorkspacesSection
                workspacesHeight={workspacesHeight}
                workspaceRows={workspaceRows}
                workingDir={workingDir}
                workspaceScopeActive={apmPackageScope === 'workspace'}
                onOpenWorkspace={openWorkspace}
                onSelectWorkspaceScope={selectWorkspaceScope}
            />

            <div className="explorer__divider" onMouseDown={onDividerMouseDown} />

            <WorkspaceExplorerThreadsSection {...threadSectionProps} />
        </div>
    )
}

function useWorkspaceSectionResize(initialHeight: number) {
    const [workspacesHeight, setWorkspacesHeight] = useState(initialHeight)
    const dividerDragging = useRef(false)

    const suppressNextClick = useCallback(() => {
        const handleClickCapture = (event: MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            document.removeEventListener('click', handleClickCapture, true)
        }

        document.addEventListener('click', handleClickCapture, true)
        window.setTimeout(() => {
            document.removeEventListener('click', handleClickCapture, true)
        }, 0)
    }, [])

    const onDividerMouseDown = useCallback((event: ReactMouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        dividerDragging.current = true
        const startY = event.clientY
        const startHeight = workspacesHeight

        const onMove = (moveEvent: MouseEvent) => {
            if (!dividerDragging.current) return
            const delta = moveEvent.clientY - startY
            setWorkspacesHeight(Math.min(400, Math.max(80, startHeight + delta)))
        }
        const onUp = (upEvent: MouseEvent) => {
            upEvent.preventDefault()
            upEvent.stopPropagation()
            dividerDragging.current = false
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            suppressNextClick()
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
    }, [suppressNextClick, workspacesHeight])

    return { workspacesHeight, onDividerMouseDown }
}
