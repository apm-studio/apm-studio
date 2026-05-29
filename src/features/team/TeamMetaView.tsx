import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStudioStore } from '../../store'
import type { TeamEditorTab } from '../../store/team/types'
import { TeamMetaOverviewSection } from './TeamMetaOverviewSection'
import { TeamMetaParticipantsSection } from './TeamMetaParticipantsSection'
import { TeamMetaRelationsSection } from './TeamMetaRelationsSection'
import { TeamMetaRulesSection } from './TeamMetaRulesSection'
import { TeamMetaTabs } from './TeamMetaTabs'
import { evaluateTeamReadiness } from './team-readiness'

type TeamMetaViewProps = {
    teamId?: string
    manageMode?: boolean
}

export default function TeamMetaView({
    teamId: teamIdOverride,
    manageMode = false,
}: TeamMetaViewProps = {}) {
    const {
        agents,
        openTeamEditor,
        openTeamParticipantEditor,
        openTeamRelationEditor,
        removeRelation,
        renameTeam,
        teamEditorState,
        teams,
        unbindAgentFromTeam,
        updateTeamAuthoringMeta,
        updateTeamDescription,
        updateTeamRules,
    } = useStudioStore(useShallow((state) => ({
        agents: state.agents,
        openTeamEditor: state.openTeamEditor,
        openTeamParticipantEditor: state.openTeamParticipantEditor,
        openTeamRelationEditor: state.openTeamRelationEditor,
        removeRelation: state.removeRelation,
        renameTeam: state.renameTeam,
        teamEditorState: state.teamEditorState,
        teams: state.teams,
        unbindAgentFromTeam: state.unbindAgentFromTeam,
        updateTeamAuthoringMeta: state.updateTeamAuthoringMeta,
        updateTeamDescription: state.updateTeamDescription,
        updateTeamRules: state.updateTeamRules,
    })))
    const activeTeamId = teamIdOverride || teamEditorState?.teamId || null
    const team = teams.find((entry) => entry.id === activeTeamId)
    const meta = team?.meta?.authoring || {}
    const activeTab: TeamEditorTab = manageMode
        ? 'overview'
        : (teamEditorState?.mode === 'team' && teamEditorState.tab)
            ? teamEditorState.tab
            : 'overview'
    const readiness = useMemo(
        () => (team ? evaluateTeamReadiness(team, agents) : { runnable: false, issues: [] }),
        [team, agents],
    )

    if (!team || !activeTeamId) return null

    const participantCount = Object.keys(team.participants).length
    const rules = team.teamRules || []

    const commitName = (value: string) => {
        const nextName = value.trim()
        if (nextName && nextName !== team.name) {
            renameTeam(activeTeamId, nextName)
        }
    }

    const commitDescription = (value: string) => {
        updateTeamDescription(activeTeamId, value)
        updateTeamAuthoringMeta(activeTeamId, {
            ...team.meta,
            authoring: { ...meta, description: value },
        })
    }

    return (
        <div className="team-panel__content edit-workbench team-edit-workbench">
            {!manageMode ? (
                <TeamMetaTabs
                    activeTab={activeTab}
                    participantCount={participantCount}
                    relationCount={team.relations.length}
                    ruleCount={rules.length}
                    onChange={(tab) => openTeamEditor(activeTeamId, 'team', { tab })}
                />
            ) : null}

            <div className="edit-advanced team-edit-workbench__body">
                {activeTab === 'overview' && (
                    <TeamMetaOverviewSection
                        activeTeamId={activeTeamId}
                        description={team.description || ''}
                        meta={meta}
                        name={team.name}
                        participantCount={participantCount}
                        readiness={readiness}
                        relationCount={team.relations.length}
                        onCommitDescription={commitDescription}
                        onCommitName={commitName}
                        onOpenParticipant={(participantKey) => openTeamParticipantEditor(activeTeamId, participantKey)}
                        onOpenRelation={(relationId) => openTeamRelationEditor(activeTeamId, relationId)}
                    />
                )}

                {activeTab === 'participants' && (
                    <TeamMetaParticipantsSection
                        agents={agents}
                        team={team}
                        onEditParticipant={(participantKey) => openTeamParticipantEditor(activeTeamId, participantKey)}
                        onRemoveParticipant={(participantKey) => unbindAgentFromTeam(activeTeamId, participantKey)}
                    />
                )}

                {activeTab === 'relations' && (
                    <TeamMetaRelationsSection
                        agents={agents}
                        team={team}
                        onEditRelation={(relationId) => openTeamRelationEditor(activeTeamId, relationId)}
                        onRemoveRelation={(relationId) => removeRelation(activeTeamId, relationId)}
                    />
                )}

                {activeTab === 'rules' && (
                    <TeamMetaRulesSection
                        teamId={activeTeamId}
                        rules={rules}
                        onUpdateRules={(nextRules) => updateTeamRules(activeTeamId, nextRules)}
                    />
                )}
            </div>
        </div>
    )
}
