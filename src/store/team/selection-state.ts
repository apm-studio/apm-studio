import { resolvePreferredTeamThreadId } from '../../lib/team-threads'
import type { StudioState } from '../types'
import type { TeamEditorState, TeamEditorTab } from './types'

export function buildTeamSelectionState(state: StudioState, teamId: string) {
    return {
        selectedTeamId: teamId,
        selectedAgentId: null,
        selectedAgentSessionId: null,
        teamEditorState: state.teamEditorState?.teamId === teamId ? state.teamEditorState : null,
    }
}

export function buildTeamEditorSelectionState(
    state: StudioState,
    teamId: string,
    teamEditorState: TeamEditorState,
) {
    return {
        ...buildTeamSelectionState(state, teamId),
        teamEditorState,
    }
}

export function createTeamEditorState(
    teamId: string,
    mode: TeamEditorState['mode'],
    options: { participantKey?: string | null; relationId?: string | null; tab?: TeamEditorTab | null } = {},
): TeamEditorState {
    return {
        teamId,
        mode,
        ...(options.tab !== undefined ? { tab: options.tab } : {}),
        participantKey: options.participantKey ?? null,
        relationId: options.relationId ?? null,
    }
}

export function resolveTeamEditorStateAfterRelationRemoval(
    teamEditorState: TeamEditorState | null,
    teamId: string,
    relationId: string,
    nextParticipants: Record<string, unknown>,
) {
    if (teamEditorState?.teamId !== teamId) {
        return teamEditorState
    }

    if (
        teamEditorState.mode === 'participant'
        && teamEditorState.participantKey
        && !nextParticipants[teamEditorState.participantKey]
    ) {
        return createTeamEditorState(teamId, 'team')
    }

    if (
        teamEditorState.mode === 'relation'
        && teamEditorState.relationId === relationId
    ) {
        return createTeamEditorState(teamId, 'team')
    }

    return teamEditorState
}

function resolveValidTeamParticipantSelection(
    state: StudioState,
    teamId: string,
    participantKey: string | null,
) {
    if (!participantKey) {
        return null
    }

    const team = state.teams.find((entry) => entry.id === teamId)
    return team?.participants[participantKey] ? participantKey : null
}

function resolveThreadParticipantSelection(
    state: StudioState,
    teamId: string,
    threadId: string | null,
    participantKey?: string | null,
) {
    if (!threadId) {
        return null
    }

    const requestedParticipantKey = participantKey === undefined
        ? state.activeThreadParticipantKey
        : participantKey

    return resolveValidTeamParticipantSelection(state, teamId, requestedParticipantKey)
}

export function buildSelectTeamState(state: StudioState, teamId: string | null) {
    if (teamId === null) {
        return {
            selectedTeamId: null,
            selectedAgentId: null,
            selectedAgentSessionId: null,
            teamEditorState: null,
        }
    }

    const nextThreads = state.teamThreads[teamId] || []
    const nextActiveThreadId = resolvePreferredTeamThreadId(nextThreads, state.activeThreadId)
    const shouldPreserveParticipantSelection = nextActiveThreadId === state.activeThreadId

    return {
        ...buildTeamSelectionState(state, teamId),
        activeThreadId: nextActiveThreadId,
        activeThreadParticipantKey: shouldPreserveParticipantSelection
            ? resolveValidTeamParticipantSelection(state, teamId, state.activeThreadParticipantKey)
            : null,
    }
}

export function resolveSelectedTeamThreadState(
    state: StudioState,
    teamId: string,
    threads: Array<{ id: string; createdAt: number }>,
    preferredThreadId: string | null = state.activeThreadId,
) {
    if (state.selectedTeamId !== teamId) {
        return {
            activeThreadId: state.activeThreadId,
            activeThreadParticipantKey: state.activeThreadParticipantKey,
        }
    }

    const nextActiveThreadId = resolvePreferredTeamThreadId(threads, preferredThreadId)
    return {
        activeThreadId: nextActiveThreadId,
        activeThreadParticipantKey: resolveThreadParticipantSelection(state, teamId, nextActiveThreadId),
    }
}

export function buildTeamThreadSelectionState(
    state: StudioState,
    teamId: string,
    threadId: string | null,
    participantKey?: string | null,
) {
    return {
        ...buildTeamSelectionState(state, teamId),
        activeThreadId: threadId,
        activeThreadParticipantKey: resolveThreadParticipantSelection(state, teamId, threadId, participantKey),
    }
}

export function buildDeletedTeamThreadState(
    state: StudioState,
    teamId: string,
    threadId: string,
) {
    const remainingThreads = (state.teamThreads[teamId] || []).filter((thread) => thread.id !== threadId)

    return {
        teamThreads: { ...state.teamThreads, [teamId]: remainingThreads },
        ...resolveSelectedTeamThreadState(
            state,
            teamId,
            remainingThreads,
            state.selectedTeamId === teamId && state.activeThreadId === threadId
                ? null
                : state.activeThreadId,
        ),
    }
}
