import { AlertCircle, AlertTriangle, ArrowRightLeft, CheckCircle2, User } from 'lucide-react'
import type { TeamReadinessResult } from './team-readiness'
import Tip from './Tip'

interface TeamMetaOverviewSectionProps {
    activeTeamId: string
    description: string
    meta: { description?: string; tags?: string[] }
    name: string
    participantCount: number
    readiness: TeamReadinessResult
    relationCount: number
    onCommitDescription: (value: string) => void
    onCommitName: (value: string) => void
    onOpenParticipant: (participantKey: string) => void
    onOpenRelation: (relationId: string) => void
}

export function TeamMetaOverviewSection({
    activeTeamId,
    description,
    meta,
    name,
    participantCount,
    readiness,
    relationCount,
    onCommitDescription,
    onCommitName,
    onOpenParticipant,
    onOpenRelation,
}: TeamMetaOverviewSectionProps) {
    const readinessLabel = readiness.runnable
        ? readiness.issues.length > 0
            ? 'Warnings'
            : 'Ready'
        : 'Blocked'
    const readinessHint = readiness.runnable
        ? readiness.issues.length > 0
            ? `${readiness.issues.length} open issue${readiness.issues.length === 1 ? '' : 's'}`
            : 'Runnable now'
        : `${readiness.issues.length} issue${readiness.issues.length === 1 ? '' : 's'} to fix`

    return (
        <>
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Overview</span>
                </div>
                <div className="adv-section__body">
                    <label className="adv-field">
                        <span className="adv-field__label">
                            Name
                            <Tip text="The Team name is visible to all participant agents. Use a clear, descriptive name so agents can understand the workflow context." />
                        </span>
                        <input
                            key={`team-name:${activeTeamId}:${name}`}
                            className="text-input"
                            defaultValue={name}
                            onBlur={(e) => onCommitName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    onCommitName(e.currentTarget.value)
                                }
                            }}
                        />
                    </label>
                    <label className="adv-field">
                        <span className="adv-field__label">
                            Description
                            <Tip text="This description is injected into each participant agent's context. Write a clear purpose statement so agents understand what this workflow does and how they should collaborate." />
                        </span>
                        <textarea
                            key={`team-desc:${activeTeamId}:${description || meta.description || ''}`}
                            className="text-input team-edit-workbench__textarea"
                            defaultValue={description || meta.description || ''}
                            onBlur={(e) => onCommitDescription(e.target.value)}
                            placeholder="Describe the workflow this Team performs"
                            rows={4}
                        />
                    </label>
                </div>
            </div>

            <div className="team-edit-workbench__stats">
                <TeamMetaStat icon={<User size={12} />} value={participantCount} label="Participants" />
                <TeamMetaStat icon={<ArrowRightLeft size={12} />} value={relationCount} label="Relations" />
                <div className={`team-edit-workbench__stat-card ${readiness.runnable ? 'is-positive' : 'is-warning'}`}>
                    <span className="team-edit-workbench__stat-icon">
                        {readiness.runnable ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    </span>
                    <span className="team-edit-workbench__stat-copy">
                        <strong>{readinessLabel}</strong>
                        <span>{readinessHint}</span>
                    </span>
                </div>
            </div>

            {readiness.issues.length > 0 && (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Readiness</span>
                    </div>
                    <div className="adv-section__body">
                        <div className="team-panel__validation">
                            {readiness.issues.map((issue, index) => (
                                <div
                                    key={index}
                                    className={`team-panel__validation-item team-panel__validation-item--${issue.severity}`}
                                    onClick={() => {
                                        if (issue.focus?.mode === 'relation' && issue.focus.relationId) {
                                            onOpenRelation(issue.focus.relationId)
                                        }
                                        if (issue.focus?.mode === 'participant' && issue.focus.participantKey) {
                                            onOpenParticipant(issue.focus.participantKey)
                                        }
                                    }}
                                    style={{ cursor: issue.focus ? 'pointer' : undefined }}
                                >
                                    {issue.severity === 'error'
                                        ? <AlertCircle size={10} style={{ flexShrink: 0 }} />
                                        : <span className="team-panel__validation-dot" />}
                                    {issue.message}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {meta.tags && meta.tags.length > 0 && (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Tags</span>
                    </div>
                    <div className="adv-section__body">
                        <div className="team-panel__tags">
                            {meta.tags.map((tag, index) => (
                                <span key={index} className="team-panel__tag">{tag}</span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

function TeamMetaStat({
    icon,
    label,
    value,
}: {
    icon: React.ReactNode
    label: string
    value: number
}) {
    return (
        <div className="team-edit-workbench__stat-card">
            <span className="team-edit-workbench__stat-icon">
                {icon}
            </span>
            <span className="team-edit-workbench__stat-copy">
                <strong>{value}</strong>
                <span>{label}</span>
            </span>
        </div>
    )
}
