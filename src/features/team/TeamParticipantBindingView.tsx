import { useMemo, useState } from 'react'
import { User, ArrowRightLeft, ChevronLeft, Hexagon, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { ParticipantSubscriptions } from '../../../shared/team-types'
import { useStudioStore } from '../../store'
import { primitiveUrnDisplayName } from '../../lib/primitive-urn'
import { resolveTeamParticipantLabel } from './participant-labels'
import { getCallboardKeys, nextSubscriptions } from './team-inspector-helpers'

type SubscriptionField = keyof Pick<ParticipantSubscriptions, 'messagesFrom' | 'messageTags' | 'callboardKeys'>
type DirectSubscriptionField = Exclude<SubscriptionField, 'callboardKeys'>

export default function TeamParticipantBindingView() {
    const {
        teams, agents, teamEditorState,
        openTeamEditor, openTeamRelationEditor, updateAgentBinding, unbindAgentFromTeam,
    } = useStudioStore(useShallow((state) => ({
        teams: state.teams,
        agents: state.agents,
        teamEditorState: state.teamEditorState,
        openTeamEditor: state.openTeamEditor,
        openTeamRelationEditor: state.openTeamRelationEditor,
        updateAgentBinding: state.updateAgentBinding,
        unbindAgentFromTeam: state.unbindAgentFromTeam,
    })))

    const activeTeamId = teamEditorState?.teamId || null
    const participantKey = teamEditorState?.mode === 'participant' ? teamEditorState.participantKey : null
    const team = useMemo(() => teams.find((a) => a.id === activeTeamId), [teams, activeTeamId])
    const binding = team && participantKey ? team.participants[participantKey] : null

    const relatedRelations = useMemo(() => {
        if (!team || !participantKey) return []
        return team.relations.filter(
            (relation) => relation.between.includes(participantKey),
        )
    }, [team, participantKey])

    const [subInput, setSubInput] = useState({ messagesFrom: '', messageTags: '', callboardKeys: '' })

    if (!team || !binding || !participantKey || !activeTeamId) return null

    const refLabel = binding.agentRef.kind === 'registry'
        ? primitiveUrnDisplayName(binding.agentRef.urn)
        : `Draft: ${binding.agentRef.draftId}`

    const subscriptions = binding.subscriptions || {}
    const messageTags = subscriptions.messageTags || []
    const callboardKeys = getCallboardKeys(subscriptions)
    const availableMessageSources = Object.keys(team.participants)
        .filter((key) => key !== participantKey)
        .map((key) => ({ key, label: resolveTeamParticipantLabel(team, key, agents) }))

    const getSubscriptionValues = (field: DirectSubscriptionField) => subscriptions[field] || []

    const addSubItem = (field: SubscriptionField) => {
        const value = subInput[field].trim()
        if (!value) return
        const current = field === 'callboardKeys'
            ? getCallboardKeys(subscriptions)
            : getSubscriptionValues(field)
        if (current.includes(value)) return
        updateAgentBinding(activeTeamId, participantKey, {
            subscriptions: nextSubscriptions(subscriptions, { [field]: [...current, value] }),
        })
        setSubInput((prev) => ({ ...prev, [field]: '' }))
    }

    const removeSubItem = (field: SubscriptionField, value: string) => {
        const current = field === 'callboardKeys'
            ? getCallboardKeys(subscriptions)
            : getSubscriptionValues(field)
        updateAgentBinding(activeTeamId, participantKey, {
            subscriptions: nextSubscriptions(subscriptions, { [field]: current.filter((entry: string) => entry !== value) }),
        })
    }

    return (
        <div className="team-panel__content team-panel__content--detail">
            <div className="team-panel__item-header">
                <button
                    type="button"
                    className="icon-btn"
                    title="Back to Team Config"
                    onClick={() => openTeamEditor(activeTeamId, 'team', { tab: 'participants' })}
                >
                    <ChevronLeft size={12} />
                </button>
                <User size={14} className="team-panel__item-icon" />
                <span className="team-panel__item-name team-panel__item-name--edge">
                    {resolveTeamParticipantLabel(team, participantKey, agents)}
                </span>
                <button
                    type="button"
                    className="icon-btn team-panel__danger-btn"
                    title="Remove participant"
                    onClick={() => {
                        unbindAgentFromTeam(activeTeamId, participantKey)
                        openTeamEditor(activeTeamId, 'team', { tab: 'participants' })
                    }}
                >
                    <Trash2 size={12} />
                </button>
            </div>

            <div className="team-panel__detail-stack">
                <div className="team-panel__section team-panel__section--card">
                    <label className="team-panel__label"><Hexagon size={11} /> Binding</label>
                    <div className="team-panel__stat-grid">
                        <div className="team-panel__stat team-panel__stat--wide">
                            <Hexagon size={11} />
                            <span>{refLabel}</span>
                        </div>
                    </div>
                </div>

                <div className="team-panel__section team-panel__section--card">
                    <label className="team-panel__label"><ArrowRightLeft size={11} /> Relations ({relatedRelations.length})</label>
                    {relatedRelations.length > 0 ? (
                        <div className="team-panel__list">
                            {relatedRelations.map((relation) => {
                                const otherKey = relation.between[0] === participantKey ? relation.between[1] : relation.between[0]
                                return (
                                    <button
                                        key={relation.id}
                                        type="button"
                                        className="team-panel__edge-link"
                                        onClick={() => openTeamRelationEditor(activeTeamId, relation.id)}
                                        title="Click to edit relation"
                                    >
                                        <span className="team-panel__edge-dir">
                                            {relation.direction === 'both' ? '↔' : '→'}
                                        </span>
                                        <span className="team-panel__edge-target">{resolveTeamParticipantLabel(team, otherKey, agents)}</span>
                                        <span className="team-panel__edge-badge">
                                            {relation.direction}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    ) : (
                        <span className="team-panel__empty">No relations defined</span>
                    )}
                </div>

                <div className="team-panel__section team-panel__section--card">
                    <label className="team-panel__label">Subscriptions</label>
                    <span className="team-panel__hint">Click any chip to remove it.</span>

                    <div className="team-panel__sub-field">
                        <div className="team-panel__sub-heading">
                            <span className="team-panel__sub-label">Messages From</span>
                            <span className="team-panel__sub-meta">Only wake for specific teammates.</span>
                        </div>
                        {(subscriptions.messagesFrom || []).length > 0 ? (
                            <div className="team-panel__tags">
                                {(subscriptions.messagesFrom || []).map((value) => (
                                    <span key={value} className="team-panel__tag" onClick={() => removeSubItem('messagesFrom', value)}>
                                        {resolveTeamParticipantLabel(team, value, agents)} ×
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="team-panel__empty team-panel__empty--inline">No teammate filters yet.</span>
                        )}
                        <div className="team-panel__sub-input-row">
                            <select
                                className="team-panel__input team-panel__input--small"
                                value={subInput.messagesFrom}
                                onChange={(e) => setSubInput((prev) => ({ ...prev, messagesFrom: e.target.value }))}
                            >
                                <option value="">Select teammate…</option>
                                {availableMessageSources.map((option) => (
                                    <option key={option.key} value={option.key}>{option.label}</option>
                                ))}
                            </select>
                            <button
                                className="team-panel__action-btn"
                                type="button"
                                disabled={!subInput.messagesFrom}
                                onClick={() => addSubItem('messagesFrom')}
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="team-panel__sub-field">
                        <div className="team-panel__sub-heading">
                            <span className="team-panel__sub-label">Message Tags</span>
                            <span className="team-panel__sub-meta">Match tagged messages only.</span>
                        </div>
                        {messageTags.length > 0 ? (
                            <div className="team-panel__tags">
                                {messageTags.map((value) => (
                                    <span key={value} className="team-panel__tag" onClick={() => removeSubItem('messageTags', value)}>
                                        {value} ×
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="team-panel__empty team-panel__empty--inline">No message tags yet.</span>
                        )}
                        <div className="team-panel__sub-input-row">
                            <input
                                className="team-panel__input team-panel__input--small"
                                value={subInput.messageTags}
                                onChange={(e) => setSubInput((prev) => ({ ...prev, messageTags: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && addSubItem('messageTags')}
                                placeholder="tag name"
                            />
                            <button
                                className="team-panel__action-btn"
                                type="button"
                                disabled={!subInput.messageTags.trim()}
                                onClick={() => addSubItem('messageTags')}
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="team-panel__sub-field">
                        <div className="team-panel__sub-heading">
                            <span className="team-panel__sub-label">Shared Note Keys</span>
                            <span className="team-panel__sub-meta">Listen to shared board updates.</span>
                        </div>
                        {callboardKeys.length > 0 ? (
                            <div className="team-panel__tags">
                                {callboardKeys.map((value: string) => (
                                    <span key={value} className="team-panel__tag" onClick={() => removeSubItem('callboardKeys', value)}>
                                        {value} ×
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="team-panel__empty team-panel__empty--inline">No shared note keys yet.</span>
                        )}
                        <div className="team-panel__sub-input-row">
                            <input
                                className="team-panel__input team-panel__input--small"
                                value={subInput.callboardKeys}
                                onChange={(e) => setSubInput((prev) => ({ ...prev, callboardKeys: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && addSubItem('callboardKeys')}
                                placeholder="key pattern (e.g. launch-brief, signal-*)"
                            />
                            <button
                                className="team-panel__action-btn"
                                type="button"
                                disabled={!subInput.callboardKeys.trim()}
                                onClick={() => addSubItem('callboardKeys')}
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="team-panel__sub-field">
                        <span className="team-panel__sub-label">Event Types</span>
                        <label className="team-panel__checkbox-card">
                            <input
                                type="checkbox"
                                checked={(subscriptions.eventTypes || []).includes('runtime.idle')}
                                onChange={(e) => {
                                    const nextEt: ('runtime.idle')[] = e.target.checked ? ['runtime.idle'] : []
                                    updateAgentBinding(activeTeamId, participantKey, {
                                        subscriptions: nextSubscriptions(subscriptions, { eventTypes: nextEt }),
                                    })
                                }}
                            />
                            <span className="team-panel__checkbox-copy">
                                <span className="team-panel__checkbox-title">runtime.idle</span>
                                <span className="team-panel__checkbox-description">Wake when other participants go idle.</span>
                            </span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    )
}
