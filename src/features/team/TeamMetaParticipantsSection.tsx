import { useDroppable } from '@dnd-kit/core'
import { Cpu, Trash2, User } from 'lucide-react'
import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import { resolveAgentFromTeamBinding } from '../../lib/team-participants'
import { resolveTeamParticipantLabel } from './participant-labels'

interface TeamMetaParticipantsSectionProps {
    agents: WorkspaceAgentNode[]
    team: WorkspaceTeamSnapshot
    onEditParticipant: (participantKey: string) => void
    onRemoveParticipant: (participantKey: string) => void
}

export function TeamMetaParticipantsSection({
    agents,
    team,
    onEditParticipant,
    onRemoveParticipant,
}: TeamMetaParticipantsSectionProps) {
    const participantKeys = Object.keys(team.participants)

    return (
        <div className="adv-section">
            <div className="adv-section__head">
                <span className="section-title">Participants</span>
                <span className="adv-section__hint">Click a participant to edit bindings and subscriptions.</span>
            </div>
            <div className="adv-section__body">
                {participantKeys.length > 0 ? (
                    <div className="adv-list">
                        {participantKeys.map((key) => (
                            <ParticipantModelDropRow
                                key={key}
                                team={team}
                                participantKey={key}
                                agents={agents}
                                relationCount={team.relations.filter((relation) => relation.between.includes(key)).length}
                                onEdit={() => onEditParticipant(key)}
                                onRemove={() => onRemoveParticipant(key)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="team-edit-workbench__empty-card">No participants bound yet.</div>
                )}
            </div>
        </div>
    )
}

type ParticipantModelDropRowProps = {
    team: WorkspaceTeamSnapshot
    participantKey: string
    agents: WorkspaceAgentNode[]
    relationCount: number
    onEdit: () => void
    onRemove: () => void
}

function ParticipantModelDropRow({
    team,
    participantKey,
    agents,
    relationCount,
    onEdit,
    onRemove,
}: ParticipantModelDropRowProps) {
    const agent = resolveAgentFromTeamBinding(agents, team.participants[participantKey])
    const label = resolveTeamParticipantLabel(team, participantKey, agents)
    const modelLabel = agent?.model
        ? agent.model.modelId
        : agent
            ? 'Drop model here'
            : 'No matching agent'
    const modelTitle = agent?.model
        ? `${agent.model.provider} / ${agent.model.modelId}`
        : agent
            ? 'Drop a model from Packages onto this participant'
            : 'Resolve this participant binding before assigning a model'
    const { isOver, setNodeRef } = useDroppable({
        id: `team-participant-model-${team.id}-${participantKey}`,
        data: { agentId: agent?.id || null, teamId: team.id, type: 'model' },
        disabled: !agent,
    })

    return (
        <div
            ref={setNodeRef}
            className={`team-edit-workbench__list-row team-edit-workbench__list-row--model-drop ${isOver ? 'team-edit-workbench__list-row--drop-over' : ''}`}
        >
            <button
                type="button"
                className="adv-list__item team-edit-workbench__list-button"
                onClick={onEdit}
            >
                <User size={12} className="adv-list__icon" />
                <span className="team-edit-workbench__list-body">
                    <strong>{label}</strong>
                    <span className="team-edit-workbench__participant-meta">
                        <span>{relationCount} relation{relationCount === 1 ? '' : 's'}</span>
                        <span className={`team-edit-workbench__model-chip ${agent?.model ? '' : 'team-edit-workbench__model-chip--empty'}`} title={modelTitle}>
                            <Cpu size={10} />
                            {modelLabel}
                        </span>
                    </span>
                </span>
            </button>
            <button
                type="button"
                className="team-edit-workbench__inline-action team-edit-workbench__inline-action--danger"
                title="Remove participant"
                aria-label={`Remove ${label}`}
                onClick={onRemove}
            >
                <Trash2 size={12} />
            </button>
        </div>
    )
}
