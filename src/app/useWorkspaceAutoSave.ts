import { useEffect, useRef } from 'react'
import { useStudioStore } from '../store'

export function useWorkspaceAutoSave() {
    const workingDir = useStudioStore((state) => state.workingDir)
    const agents = useStudioStore((state) => state.agents)
    const teams = useStudioStore((state) => state.teams)
    const drafts = useStudioStore((state) => state.drafts)
    const markdownEditors = useStudioStore((state) => state.markdownEditors)
    const chatKeyToSession = useStudioStore((state) => state.chatKeyToSession)
    const canvasTerminals = useStudioStore((state) => state.canvasTerminals)
    const workspaceDirty = useStudioStore((state) => state.workspaceDirty)
    const isInitialMount = useRef(true)

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false
            return
        }

        if (!workspaceDirty) {
            return
        }

        const timer = setTimeout(() => {
            useStudioStore.getState().saveWorkspace()
        }, 2000)

        return () => clearTimeout(timer)
    }, [workspaceDirty, agents, teams, drafts, markdownEditors, workingDir, chatKeyToSession, canvasTerminals])
}
