import type { TeamThreadSummary } from '../../../shared/team-types.js'
import { subscribeTeamRuntimeEvents } from '../team-runtime/team-runtime-events.js'
import { readDiscordMappings } from './config-store.js'

interface DiscordTeamRuntimeSubscriptionDeps {
    handleRuntimeThreadUpdated: (workingDir: string, thread: TeamThreadSummary) => Promise<void>
}

export class DiscordTeamRuntimeSubscriptions {
    private readonly unsubscribers = new Map<string, () => void>()
    private readonly deps: DiscordTeamRuntimeSubscriptionDeps

    constructor(deps: DiscordTeamRuntimeSubscriptionDeps) {
        this.deps = deps
    }

    clear() {
        for (const unsubscribe of this.unsubscribers.values()) {
            unsubscribe()
        }
        this.unsubscribers.clear()
    }

    async subscribeMappedWorkspaces() {
        const mappings = await readDiscordMappings().catch(() => null)
        if (!mappings) {
            return
        }
        for (const workspace of Object.values(mappings.workspaces || {})) {
            if (workspace.workingDir) {
                this.ensure(workspace.workingDir)
            }
        }
    }

    ensure(workingDir: string) {
        if (!workingDir || this.unsubscribers.has(workingDir)) {
            return
        }

        const unsubscribe = subscribeTeamRuntimeEvents(workingDir, (event) => {
            if (event.type !== 'team.thread.updated') {
                return
            }
            void this.deps.handleRuntimeThreadUpdated(workingDir, event.properties.thread).catch((error) => {
                console.error('[discord] Team runtime update sync failed:', error)
            })
        })
        this.unsubscribers.set(workingDir, unsubscribe)
    }
}
