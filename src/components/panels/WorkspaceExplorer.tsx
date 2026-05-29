import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import WorkspaceExplorerWorkspacesSection from './WorkspaceExplorerWorkspacesSection'
import WorkspaceExplorerThreadsSection from './WorkspaceExplorerThreadsSection'
import { useWorkspaceExplorerThreadsController } from './useWorkspaceExplorerThreadsController'
import { useWorkspaceExplorerWorkspaces } from './useWorkspaceExplorerWorkspaces'
import './WorkspaceExplorer.css'
import './WorkspaceExplorerItems.css'

type WorkspaceExplorerProps = {
    workspaceOnly?: boolean
    showThreads?: boolean
}

export default function WorkspaceExplorer({ workspaceOnly = false, showThreads = true }: WorkspaceExplorerProps) {
    return workspaceOnly ? <WorkspaceOnlyExplorer /> : <WorkspaceExplorerFull showThreads={showThreads} />
}

function WorkspaceOnlyExplorer() {
    const { workingDir, workspaceRows, newWorkspace } = useWorkspaceExplorerWorkspaces()

    return (
        <div className="explorer explorer--stacked explorer--workspace-only">
            <WorkspaceExplorerWorkspacesSection
                workspacesHeight={208}
                workspaceRows={workspaceRows}
                workingDir={workingDir}
                onOpenWorkspace={newWorkspace}
                fill
            />
        </div>
    )
}

function WorkspaceExplorerFull({ showThreads }: { showThreads: boolean }) {
    const { workspacesHeight, onDividerMouseDown } = useWorkspaceSectionResize(208)
    const { workingDir, workspaceRows, newWorkspace } = useWorkspaceExplorerWorkspaces()
    const threadSectionProps = useWorkspaceExplorerThreadsController({ showThreads, workingDir })

    return (
        <div className="explorer explorer--stacked">
            <WorkspaceExplorerWorkspacesSection
                workspacesHeight={workspacesHeight}
                workspaceRows={workspaceRows}
                workingDir={workingDir}
                onOpenWorkspace={newWorkspace}
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
