import { useStudioStore } from '../../store'
import ActChatPanel from './ActChatPanel'
import ActInspectorPanel from './ActInspectorPanel'
import ActMetaView from './ActMetaView'

type ActSurfacePanelProps = {
    actId: string
}

export default function ActSurfacePanel({
    actId,
}: ActSurfacePanelProps) {
    const isEditing = useStudioStore((state) => state.actEditorState?.actId === actId)
    const workspaceMode = useStudioStore((state) => state.workspaceMode)
    const isManageMode = workspaceMode === 'manage'

    if (isManageMode) {
        return (
            <div className="act-frame__edit-body">
                <ActMetaView actId={actId} manageMode />
            </div>
        )
    }

    if (isEditing) {
        return (
            <div className="act-frame__edit-body">
                <ActInspectorPanel embedded />
            </div>
        )
    }

    return <ActChatPanel actId={actId} />
}
