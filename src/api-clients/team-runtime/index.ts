import type {
    TeamBoardEntriesResponse,
    TeamDefinition,
    TeamRuntimeDeleteResponse,
    TeamRuntimeDefinitionPatchRequest,
    TeamThreadCreateRequest,
    TeamThreadCreateResponse,
    TeamThreadEventsResponse,
    TeamThreadRenameRequest,
    TeamThreadResponse,
    TeamThreadsResponse,
} from '../../../shared/team-types'
import { deleteJSON, fetchJSON, patchJSON, postJSON } from '../../api-core'

export const teamRuntimeApi = {
    createThread: (teamId: string, teamDefinition?: TeamDefinition) =>
        postJSON<TeamThreadCreateResponse>(
            `/api/team/${teamId}/threads`,
            teamDefinition ? ({ teamDefinition } satisfies TeamThreadCreateRequest) : undefined,
        ),

    syncDefinition: (teamId: string, teamDefinition: TeamDefinition) =>
        patchJSON<TeamThreadsResponse>(
            `/api/team/${teamId}/runtime-definition`,
            { teamDefinition } satisfies TeamRuntimeDefinitionPatchRequest,
        ),

    listThreads: (teamId: string) =>
        fetchJSON<TeamThreadsResponse>(
            `/api/team/${teamId}/threads`,
        ),

    renameThread: (teamId: string, threadId: string, name: string) =>
        patchJSON<TeamThreadResponse>(
            `/api/team/${teamId}/thread/${threadId}`,
            { name } satisfies TeamThreadRenameRequest,
        ),

    getThread: (teamId: string, threadId: string) =>
        fetchJSON<TeamThreadResponse>(`/api/team/${teamId}/thread/${threadId}`),

    events: (teamId: string, threadId: string, count = 50, before = 0) =>
        fetchJSON<TeamThreadEventsResponse>(
            `/api/team/${teamId}/thread/${threadId}/events?count=${count}&before=${before}`,
        ),

    deleteThread: (teamId: string, threadId: string) =>
        deleteJSON<TeamRuntimeDeleteResponse>(`/api/team/${teamId}/thread/${threadId}`),

    deleteTeam: (teamId: string) =>
        deleteJSON<TeamRuntimeDeleteResponse>(`/api/team/${teamId}`),

    readBoard: (teamId: string, threadId: string, key?: string) =>
        fetchJSON<TeamBoardEntriesResponse>(
            `/api/team/${teamId}/thread/${threadId}/read-board${key ? `?key=${encodeURIComponent(key)}` : ''}`,
        ),
}
