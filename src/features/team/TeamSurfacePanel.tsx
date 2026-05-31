import { useStudioStore } from '../../store'
import TeamChatPanel from './TeamChatPanel'
import TeamInspectorPanel from './TeamInspectorPanel'
import TeamMetaView from './TeamMetaView'

type TeamSurfacePanelProps = {
    teamId: string
}

export default function TeamSurfacePanel({
    teamId,
}: TeamSurfacePanelProps) {
    const isEditing = useStudioStore((state) => state.teamEditorState?.teamId === teamId)
    const workspaceMode = useStudioStore((state) => state.workspaceMode)
    const viewMode = useStudioStore((state) => state.viewMode)
    const isManageMode = workspaceMode === 'studio-agent' && viewMode === 'canvas'

    if (isManageMode) {
        return (
            <div className="team-frame__edit-body">
                <TeamMetaView teamId={teamId} manageMode />
            </div>
        )
    }

    if (isEditing) {
        return (
            <div className="team-frame__edit-body">
                <TeamInspectorPanel embedded />
            </div>
        )
    }

    return <TeamChatPanel teamId={teamId} />
}
