import { ArrowRightLeft, Trash2 } from 'lucide-react'
import type { WorkspaceAgentNode, WorkspaceTeamSnapshot } from '../../../shared/workspace-contracts'
import { resolveTeamParticipantLabel } from './participant-labels'

interface TeamMetaRelationsSectionProps {
    agents: WorkspaceAgentNode[]
    team: WorkspaceTeamSnapshot
    onEditRelation: (relationId: string) => void
    onRemoveRelation: (relationId: string) => void
}

export function TeamMetaRelationsSection({
    agents,
    team,
    onEditRelation,
    onRemoveRelation,
}: TeamMetaRelationsSectionProps) {
    return (
        <div className="adv-section">
            <div className="adv-section__head">
                <span className="section-title">Relations</span>
                <span className="adv-section__hint">Open a relation to tune naming, direction, and description.</span>
            </div>
            <div className="adv-section__body">
                {team.relations.length > 0 ? (
                    <div className="adv-list">
                        {team.relations.map((relation) => (
                            <div key={relation.id} className="team-edit-workbench__list-row">
                                <button
                                    type="button"
                                    className="adv-list__item team-edit-workbench__list-button"
                                    onClick={() => onEditRelation(relation.id)}
                                    title="Edit relation"
                                >
                                    <ArrowRightLeft size={12} className="adv-list__icon" />
                                    <span className="team-edit-workbench__list-body">
                                        <strong>
                                            {resolveTeamParticipantLabel(team, relation.between[0], agents)}
                                            <span className="team-panel__edge-inline-arrow">
                                                {relation.direction === 'both' ? '<->' : '->'}
                                            </span>
                                            {resolveTeamParticipantLabel(team, relation.between[1], agents)}
                                        </strong>
                                        <span>{relation.name || 'Unnamed relation'}</span>
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className="team-edit-workbench__inline-action team-edit-workbench__inline-action--danger"
                                    title="Delete relation"
                                    aria-label={`Delete relation ${relation.name || relation.id}`}
                                    onClick={() => onRemoveRelation(relation.id)}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="team-edit-workbench__empty-card">No relations yet.</div>
                )}
            </div>
        </div>
    )
}
