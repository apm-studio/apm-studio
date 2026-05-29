import type { ReactNode } from 'react'
import { ArrowRightLeft, CheckCircle2, Shield, User } from 'lucide-react'
import type { TeamEditorTab } from '../../store/team/types'

type TeamMetaTabItem = {
    key: TeamEditorTab
    label: string
    count?: number
    icon: ReactNode
}

interface TeamMetaTabsProps {
    activeTab: TeamEditorTab
    participantCount: number
    relationCount: number
    ruleCount: number
    onChange: (tab: TeamEditorTab) => void
}

export function TeamMetaTabs({
    activeTab,
    participantCount,
    relationCount,
    ruleCount,
    onChange,
}: TeamMetaTabsProps) {
    const tabs: TeamMetaTabItem[] = [
        { key: 'overview', label: 'Overview', icon: <CheckCircle2 size={12} /> },
        { key: 'participants', label: 'Participants', count: participantCount, icon: <User size={12} /> },
        { key: 'relations', label: 'Relations', count: relationCount, icon: <ArrowRightLeft size={12} /> },
        { key: 'rules', label: 'Rules', count: ruleCount, icon: <Shield size={12} /> },
    ]

    return (
        <div className="team-edit-workbench__tabs" role="tablist" aria-label="Team edit sections">
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    className={`team-edit-workbench__tab ${activeTab === tab.key ? 'team-edit-workbench__tab--active' : ''}`}
                    onClick={() => onChange(tab.key)}
                >
                    {tab.icon}
                    <span>{tab.label}</span>
                    {typeof tab.count === 'number' ? (
                        <span className="team-edit-workbench__tab-count">{tab.count}</span>
                    ) : null}
                </button>
            ))}
        </div>
    )
}
