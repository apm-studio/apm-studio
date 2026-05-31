import type { WorkspaceAgentNode } from '../../../shared/workspace-contracts'
import { Hammer, Lightbulb } from 'lucide-react'
import ModelVariantSelect from './ModelVariantSelect'

interface ComposerRuntimeRowProps {
    agentId: string
    agent: WorkspaceAgentNode | null
    selectedAgentId: string
    buildAgent: { name: string; description?: string } | null
    planAgent: { name: string; description?: string } | null
    onSetAgentId: (id: string, agentId: string | null) => void
    onSetModelVariant: (id: string, variant: string | null) => void
    showModeToggle?: boolean
}

export default function ComposerRuntimeRow({
    agentId,
    agent,
    selectedAgentId,
    buildAgent,
    planAgent,
    onSetAgentId,
    onSetModelVariant,
    showModeToggle = true,
}: ComposerRuntimeRowProps) {
    const isPlanAgent = selectedAgentId === 'plan'

    return (
        <div className="chat-input__runtime-row">
            {showModeToggle ? (
                <div className="chat-input__mode-group">
                    <button
                        className={`mode-toggle ${selectedAgentId !== 'plan' ? 'is-active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); if (selectedAgentId !== 'build') onSetAgentId(agentId, 'build') }}
                        title={buildAgent?.description || 'Build mode'}
                        type="button"
                    >
                        <Hammer size={12} />
                        <span>Build</span>
                    </button>
                    <button
                        className={`mode-toggle mode-plan ${isPlanAgent ? 'is-active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); if (selectedAgentId !== 'plan') onSetAgentId(agentId, 'plan') }}
                        title={planAgent?.description || 'Plan mode'}
                        type="button"
                    >
                        <Lightbulb size={12} />
                        <span>Plan</span>
                    </button>
                </div>
            ) : null}
            <ModelVariantSelect
                model={agent?.model || null}
                value={agent?.modelVariant || null}
                onChange={(value) => onSetModelVariant(agentId, value)}
                className="chat-input__variant"
                compact
                titlePrefix="Studio Agent variant"
                popoverPlacement="top"
            />
        </div>
    )
}
