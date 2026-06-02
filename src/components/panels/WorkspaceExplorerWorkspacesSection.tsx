import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { workspaceLabel } from './workspace-explorer-utils'

type Props = {
    workspacesHeight: number
    workspaceRows: ReactNode[]
    workingDir: string
    workspaceScopeActive?: boolean
    onOpenWorkspace: () => void
    onSelectWorkspaceScope?: () => void
    fill?: boolean
}

export default function WorkspaceExplorerWorkspacesSection({
    workspacesHeight,
    workspaceRows,
    workingDir,
    workspaceScopeActive = false,
    onOpenWorkspace,
    onSelectWorkspaceScope,
    fill = false,
}: Props) {
    return (
        <section
            className={`explorer-section explorer-section--workspaces ${fill ? 'explorer-section--fill' : ''}`}
            style={{ flex: fill ? '1 1 auto' : `0 0 ${workspacesHeight}px` }}
        >
            <div className="explorer__subheader">
                <span className="explorer__title">Workspaces</span>
                <button className="icon-btn" onClick={onOpenWorkspace} title="Open workspace directory">
                    <Plus size={12} />
                </button>
            </div>
            <button
                type="button"
                className={`explorer__context explorer__context--workspaces explorer__context-button ${workspaceScopeActive ? 'is-active' : ''}`}
                onClick={onSelectWorkspaceScope}
                title={workingDir || 'Use workspace package scope'}
            >
                <span className="explorer__context-label">Current</span>
                <strong>{workingDir ? workspaceLabel(workingDir) : 'No workspace open'}</strong>
            </button>
            <div className="explorer__tree explorer__tree--workspaces scroll-area">
                {workspaceRows.length > 0 ? workspaceRows : <div className="empty-state">No saved workspaces</div>}
            </div>
        </section>
    )
}
