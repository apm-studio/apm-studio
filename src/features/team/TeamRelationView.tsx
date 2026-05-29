import { ArrowRightLeft, ChevronLeft, Trash2, Hash } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { TeamRelation } from '../../../shared/team-types'
import { useStudioStore } from '../../store'
import { resolveTeamParticipantLabel } from './participant-labels'
import Tip from './Tip'

type EditableRelationField = 'name' | 'description' | 'direction'

export default function TeamRelationView() {
    const {
        teams, agents, teamEditorState,
        updateRelation, removeRelation, openTeamEditor,
    } = useStudioStore(useShallow((state) => ({
        teams: state.teams,
        agents: state.agents,
        teamEditorState: state.teamEditorState,
        updateRelation: state.updateRelation,
        removeRelation: state.removeRelation,
        openTeamEditor: state.openTeamEditor,
    })))

    const activeTeamId = teamEditorState?.teamId || null
    const relationId = teamEditorState?.mode === 'relation' ? teamEditorState.relationId : null
    const team = teams.find((a) => a.id === activeTeamId)
    const relation = team?.relations.find((r) => r.id === relationId)

    if (!relation || !team || !activeTeamId || !relationId) return null

    const update = <K extends EditableRelationField>(field: K, value: TeamRelation[K]) => {
        updateRelation(activeTeamId, relationId, { [field]: value } as Partial<TeamRelation>)
    }

    return (
        <div className="team-panel__content team-panel__content--detail">
            <div className="team-panel__item-header">
                <button
                    type="button"
                    className="icon-btn"
                    title="Back to Team Config"
                    onClick={() => openTeamEditor(activeTeamId, 'team', { tab: 'relations' })}
                >
                    <ChevronLeft size={12} />
                </button>
                <ArrowRightLeft size={14} className="team-panel__item-icon" />
                <span className="team-panel__item-name team-panel__item-name--edge">
                    {resolveTeamParticipantLabel(team, relation.between[0], agents)} ↔ {resolveTeamParticipantLabel(team, relation.between[1], agents)}
                </span>
                <button
                    type="button"
                    className="icon-btn team-panel__danger-btn"
                    title="Delete relation"
                    onClick={() => {
                        removeRelation(activeTeamId, relationId)
                        openTeamEditor(activeTeamId, 'team', { tab: 'relations' })
                    }}
                >
                    <Trash2 size={12} />
                </button>
            </div>

            <div className="team-panel__detail-stack">
                <div className="team-panel__section team-panel__section--card">
                    <label className="team-panel__label"><ArrowRightLeft size={11} /> Endpoints</label>
                    <div className="team-panel__relation-summary">
                        <span className="team-panel__endpoint-chip">{resolveTeamParticipantLabel(team, relation.between[0], agents)}</span>
                        <span className="team-panel__edge-dir team-panel__edge-dir--large">
                            {relation.direction === 'one-way' ? '→' : '↔'}
                        </span>
                        <span className="team-panel__endpoint-chip">{resolveTeamParticipantLabel(team, relation.between[1], agents)}</span>
                    </div>
                </div>

                <div className="team-panel__section team-panel__section--card">
                    <label className="team-panel__label">
                        <Hash size={11} /> Name
                        <Tip text="The relation name is used by agents to identify this communication channel. Use a clear, machine-readable name like 'code_review' or 'design_feedback'." />
                    </label>
                    <input
                        className="team-panel__input"
                        value={relation.name}
                        onChange={(e) => update('name', e.target.value)}
                        placeholder="communication_channel_name"
                    />
                </div>

                <div className="team-panel__section team-panel__section--card">
                    <label className="team-panel__label">
                        Description
                        <Tip text="This description is injected into each participant's agent context. Write a clear purpose statement so agents understand when and how to use this communication channel." />
                    </label>
                    <textarea
                        className="team-panel__textarea"
                        value={relation.description}
                        onChange={(e) => update('description', e.target.value)}
                        placeholder="Describe the purpose of this relation so agents know when to use it."
                        rows={3}
                    />
                </div>

                <div className="team-panel__section team-panel__section--card">
                    <label className="team-panel__label">
                        <ArrowRightLeft size={11} /> Direction
                        <Tip text="'Both' allows messaging in either direction. 'One-way' restricts communication to the arrow direction only." />
                    </label>
                    <div className="team-panel__toggle-group">
                        <button
                            type="button"
                            className={`team-panel__toggle ${relation.direction === 'both' ? 'active' : ''}`}
                            onClick={() => update('direction', 'both')}
                        >
                            Both
                        </button>
                        <button
                            type="button"
                            className={`team-panel__toggle ${relation.direction === 'one-way' ? 'active' : ''}`}
                            onClick={() => update('direction', 'one-way')}
                        >
                            One-way
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
