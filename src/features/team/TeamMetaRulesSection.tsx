import { useState } from 'react'
import TeamSafetyEditor from './TeamSafetyEditor'

interface TeamMetaRulesSectionProps {
    teamId: string
    rules: string[]
    onUpdateRules: (rules: string[]) => void
}

export function TeamMetaRulesSection({
    teamId,
    rules,
    onUpdateRules,
}: TeamMetaRulesSectionProps) {
    const [ruleInput, setRuleInput] = useState('')

    return (
        <>
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Team Rules</span>
                </div>
                <div className="adv-section__body">
                    <div className="team-panel__tags">
                        {rules.map((rule, index) => (
                            <span key={index} className="team-panel__tag" onClick={() => {
                                onUpdateRules(rules.filter((_, idx) => idx !== index))
                            }}>
                                {rule} x
                            </span>
                        ))}
                    </div>
                    <input
                        className="text-input"
                        value={ruleInput}
                        onChange={(e) => setRuleInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && ruleInput.trim()) {
                                onUpdateRules([...rules, ruleInput.trim()])
                                setRuleInput('')
                            }
                        }}
                        placeholder="Add rule (e.g. 'All code must have tests')"
                    />
                </div>
            </div>

            <TeamSafetyEditor teamId={teamId} />
        </>
    )
}
