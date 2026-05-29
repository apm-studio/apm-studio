import type { StateCreator } from 'zustand'
import type { StudioState } from '../types'
import { createTeamAuthoringActions } from './team-authoring-actions'
import { createTeamCanvasActions } from './team-canvas-actions'
import { createTeamDefinitionActions } from './team-definition-actions'
import { createTeamEditorActions } from './team-editor-actions'
import { createTeamParticipantActions } from './team-participant-actions'
import { createTeamRelationActions } from './team-relation-actions'
import { createTeamThreadActions } from './team-thread-actions'
import type { TeamSlice } from './types'

export const createTeamSlice: StateCreator<StudioState, [], [], TeamSlice> = (set, get) => ({
    teams: [],
    selectedTeamId: null,
    teamEditorState: null,

    // ── Thread state ────────────────────────────────────
    teamThreads: {},
    activeThreadId: null,
    activeThreadParticipantKey: null,
    ...createTeamDefinitionActions(set, get),
    ...createTeamParticipantActions(set, get),
    ...createTeamEditorActions(set),
    ...createTeamRelationActions(set, get),
    ...createTeamCanvasActions(set),
    ...createTeamAuthoringActions(set, get),
    ...createTeamThreadActions(set, get),
})
