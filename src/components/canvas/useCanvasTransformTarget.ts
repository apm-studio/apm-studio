import { useCallback, useEffect, useState } from 'react'
import type {
    WorkspaceCanvasTerminalNode,
    WorkspaceMarkdownEditorNode,
    WorkspaceAgentNode,
    WorkspaceTeamSnapshot,
} from '../../../shared/workspace-contracts'
type CanvasNodeKind = 'agent' | 'markdownEditor' | 'canvasTerminal' | 'team'

export function useCanvasTransformTarget(args: {
    teams: WorkspaceTeamSnapshot[]
    agents: WorkspaceAgentNode[]
    markdownEditors: WorkspaceMarkdownEditorNode[]
    canvasTerminals: WorkspaceCanvasTerminalNode[]
}) {
    const { teams, agents, markdownEditors, canvasTerminals } = args
    const [transformTarget, setTransformTarget] = useState<{ id: string; type: CanvasNodeKind } | null>(null)

    const clearTransformTarget = useCallback(() => {
        setTransformTarget(null)
    }, [])

    const activateTransformTarget = useCallback((type: CanvasNodeKind, id: string) => {
        setTransformTarget({ type, id })
    }, [])

    const deactivateTransformTarget = useCallback((type: CanvasNodeKind, id: string) => {
        setTransformTarget((current) => (
            current && current.type === type && current.id === id
                ? null
                : current
        ))
    }, [])

    useEffect(() => {
        if (!transformTarget) {
            return
        }

        const exists = (
            (transformTarget.type === 'team' && teams.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'agent' && agents.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'markdownEditor' && markdownEditors.some((item) => item.id === transformTarget.id))
            || (transformTarget.type === 'canvasTerminal' && canvasTerminals.some((item) => item.id === transformTarget.id))
        )

        if (!exists) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setTransformTarget(null)
        }
    }, [teams, agents, markdownEditors, canvasTerminals, transformTarget])

    return {
        transformTarget,
        clearTransformTarget,
        activateTransformTarget,
        deactivateTransformTarget,
    }
}
