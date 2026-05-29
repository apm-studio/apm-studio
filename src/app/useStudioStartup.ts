import { useEffect } from 'react'
import { setApiWorkingDirContext } from '../api-core'
import { studioApi } from '../api-clients/studio'
import { savedWorkspacesApi } from '../api-clients/saved-workspaces'
import { resolveStartupWorkspaceTarget } from '../lib/startup-workspace'
import { useStudioStore } from '../store'

function isStudioTheme(value: string | undefined): value is 'light' | 'dark' {
    return value === 'light' || value === 'dark'
}

export function useStudioTheme() {
    const theme = useStudioStore((state) => state.theme)

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
    }, [theme])
}

export function useStudioStartup() {
    useEffect(() => {
        const store = useStudioStore.getState()
        store.initRealtimeEvents()

        studioApi.getConfig()
            .then(async (config) => {
                setApiWorkingDirContext(config.projectDir || null)
                if (isStudioTheme(config.theme) && config.theme !== useStudioStore.getState().theme) {
                    useStudioStore.setState({ theme: config.theme })
                    localStorage.setItem('apm-theme', config.theme)
                }

                const workspaces = await savedWorkspacesApi.list(config.projectDir ? true : false).catch(() => [])
                const startupTarget = resolveStartupWorkspaceTarget(config, workspaces)

                if (startupTarget.kind === 'workspace') {
                    await useStudioStore.getState().loadWorkspace(startupTarget.workspaceId)
                } else if (startupTarget.kind === 'project-dir') {
                    const currentWorkingDir = useStudioStore.getState().workingDir
                    if (currentWorkingDir !== startupTarget.projectDir) {
                        useStudioStore.getState().setWorkingDir(startupTarget.projectDir)
                    }
                }
            })
            .catch(() => {})

        return () => {
            useStudioStore.getState().cleanupRealtimeEvents()
        }
    }, [])
}
