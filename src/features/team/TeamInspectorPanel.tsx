/**
 * TeamInspectorPanel — Team editor surface.
 *
 * It switches between:
 * - team meta/config
 * - participant binding
 * - relation detail
 */
import { Settings, User, ArrowRightLeft, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'
import '../agent/AgentFrame.css'
import TeamMetaView from './TeamMetaView'
import TeamParticipantBindingView from './TeamParticipantBindingView'
import TeamRelationView from './TeamRelationView'
import './TeamInspectorPanel.css'
import './TeamInspectorDetails.css'

type TeamInspectorPanelProps = {
    embedded?: boolean
}

export default function TeamInspectorPanel({ embedded = false }: TeamInspectorPanelProps) {
    const { teams, teamEditorState, closeTeamEditor } = useStudioStore(useShallow((state) => ({
        teams: state.teams,
        teamEditorState: state.teamEditorState,
        closeTeamEditor: state.closeTeamEditor,
    })))

    if (!teamEditorState) return null

    const team = teams.find((entry) => entry.id === teamEditorState.teamId) || null
    const mode = teamEditorState.mode

    const modeLabels = {
        team: { icon: <Settings size={12} />, label: 'Team Config' },
        participant: { icon: <User size={12} />, label: 'Participant' },
        relation: { icon: <ArrowRightLeft size={12} />, label: 'Relation' },
    }

    const { icon, label } = modeLabels[mode]

    return (
        <div className={`team-panel ${embedded ? 'team-panel--embedded' : ''}`}>
            {!embedded && (
                <div className="team-panel__header">
                    <div className="team-panel__header-copy">
                        {icon}
                        <span>{label}</span>
                        {team ? <strong className="team-panel__header-name">{team.name}</strong> : null}
                    </div>
                    <button
                        type="button"
                        className="icon-btn team-panel__close-btn"
                        title="Close Team Editor"
                        onClick={closeTeamEditor}
                    >
                        <X size={12} />
                    </button>
                </div>
            )}
            {mode === 'team' && <TeamMetaView />}
            {mode === 'participant' && <TeamParticipantBindingView />}
            {mode === 'relation' && <TeamRelationView />}
        </div>
    )
}
