import { Zap, Pencil, X, Server } from 'lucide-react'
import type {
    SharedPrimitiveRef } from '../../../shared/chat-contracts'
import type { WorkspaceModelConfig,
    WorkspaceAgentNode,
} from '../../../shared/workspace-contracts'
import { primitiveUrnDisplayName } from '../../lib/primitive-urn'
import ModelVariantSelect from './ModelVariantSelect'

function primitiveRefLabel(ref: SharedPrimitiveRef) {
    return ref.kind === 'draft'
        ? `Draft ${ref.draftId.slice(0, 8)}`
        : primitiveUrnDisplayName(ref.urn)
}

export function AgentBodyDetail({
    agent,
    onNameChange,
    onDescriptionChange,
    onAgentBodyChange,
}: {
    agent: WorkspaceAgentNode | null
    onNameChange: (value: string) => void
    onDescriptionChange: (value: string) => void
    onAgentBodyChange: (value: string) => void
}) {
    return (
        <div className="edit-advanced edit-advanced--body nodrag nowheel">
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Identity</span>
                </div>
                <div className="adv-section__body">
                    <label className="adv-field">
                        <span className="adv-field__label">Name</span>
                        <input
                            className="text-input nodrag nowheel"
                            value={agent?.name || ''}
                            onChange={(event) => onNameChange(event.target.value)}
                        />
                    </label>
                    <label className="adv-field">
                        <span className="adv-field__label">Description</span>
                        <input
                            className="text-input nodrag nowheel"
                            value={agent?.meta?.authoring?.description || ''}
                            onChange={(event) => onDescriptionChange(event.target.value)}
                            placeholder="Describe this Agent package"
                        />
                    </label>
                </div>
            </div>
            <div className="adv-section adv-section--body-editor">
                <div className="adv-section__head">
                    <span className="section-title">Agent Body</span>
                </div>
                <div className="adv-section__body adv-section__body--fill">
                    <label className="adv-field adv-field--fill">
                        <textarea
                            className="input adv-field__textarea adv-field__textarea--body nodrag nowheel"
                            aria-label="Agent Body"
                            value={agent?.agentBody || ''}
                            onChange={(event) => onAgentBodyChange(event.target.value)}
                            placeholder="Write the target-agnostic body for this Agent package."
                            rows={10}
                        />
                    </label>
                </div>
            </div>
        </div>
    )
}

export function AgentSkillsDetail({
    agent,
    agentId,
    onOpenPrimitiveEditor,
    onRemoveSkill,
}: {
    agent: WorkspaceAgentNode | null
    agentId: string
    onOpenPrimitiveEditor: (kind: 'skill', targetRef: SharedPrimitiveRef | null, attachMode: 'skill-new' | 'skill-replace') => void
    onRemoveSkill: (id: string, key: string) => void
}) {
    return (
        <div className="edit-advanced nodrag nowheel">
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Skills</span>
                </div>
                <div className="adv-section__body">
                    {agent?.skillRefs?.length ? (
                        <div className="adv-list">
                            {agent.skillRefs.map((ref) => (
                                <div key={`${ref.kind}-${ref.kind === 'draft' ? ref.draftId : ref.urn}`} className="adv-list__item">
                                    <Zap size={10} className="adv-list__icon" />
                                    <span className="adv-list__label">{primitiveRefLabel(ref)}</span>
                                    <div className="adv-list__actions">
                                        <button type="button" className="icon-btn" onClick={() => void onOpenPrimitiveEditor('skill', ref, 'skill-replace')} title="Edit Skill">
                                            <Pencil size={10} />
                                        </button>
                                        <button type="button" className="icon-btn" onClick={() => onRemoveSkill(agentId, ref.kind === 'draft' ? ref.draftId : ref.urn)} title="Remove Skill">
                                            <X size={10} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="adv-section__summary">No Skills connected.</span>
                    )}
                </div>
            </div>
        </div>
    )
}

export function AgentModelDetail({
    agent,
    runtimeTools,
    onModelChange,
    onModelVariantChange,
}: {
    agent: WorkspaceAgentNode | null
    runtimeTools: {
        resolvedTools: string[]
        selectedMcpServers: string[]
        unavailableDetails: Array<{ serverName: string; reason: string }>
    } | null
    onModelChange: (model: WorkspaceModelConfig | null) => void
    onModelVariantChange: (variant: string | null) => void
}) {
    return (
        <div className="edit-advanced nodrag nowheel">
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">Studio-only Model</span>
                    {agent?.model ? (
                        <button type="button" className="btn btn--sm" onClick={() => onModelChange(null)}>
                            Clear
                        </button>
                    ) : null}
                </div>
                <div className="adv-section__body">
                    <span className="adv-section__summary">
                        {agent?.model
                            ? `${agent.model.provider} / ${agent.model.modelId}`
                            : agent?.modelPlaceholder
                                ? 'No model selected'
                                : 'No model selected'}
                    </span>
                    {agent?.modelPlaceholder && (
                        <span className="adv-section__hint">
                            Recommended: {agent.modelPlaceholder.provider}/{agent.modelPlaceholder.modelId}
                        </span>
                    )}
                </div>
            </div>
            {agent?.model ? (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Variant</span>
                    </div>
                    <div className="adv-section__body">
                        <ModelVariantSelect
                            model={agent.model}
                            value={agent.modelVariant || null}
                            onChange={onModelVariantChange}
                            titlePrefix="Studio-only variant"
                        />
                    </div>
                </div>
            ) : null}
            {runtimeTools && runtimeTools.selectedMcpServers.length > 0 ? (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Runtime</span>
                    </div>
                    <div className="adv-section__body">
                        <span className="adv-section__summary">
                            {runtimeTools.resolvedTools.length} MCP server{runtimeTools.resolvedTools.length === 1 ? '' : 's'} ready
                            {runtimeTools.unavailableDetails.length > 0 ? ` · ${runtimeTools.unavailableDetails.length} unavailable` : ''}
                        </span>
                    </div>
                </div>
            ) : null}
        </div>
    )
}

export function AgentMcpDetail({
    agent,
    agentId,
    unresolvedMcpPlaceholders,
    mcpBindingRows,
    mcpBindingOptions,
    requestRelations,
    onRemoveMcp,
    onSetMcpBinding,
}: {
    agent: WorkspaceAgentNode | null
    agentId: string
    unresolvedMcpPlaceholders: string[]
    mcpBindingRows: Array<{ placeholderName: string; serverName: string | null }>
    mcpBindingOptions: Array<{ name: string; disabled: boolean }>
    requestRelations: Array<{ targetName: string; description?: string | undefined }>
    onRemoveMcp: (id: string, serverName: string) => void
    onSetMcpBinding: (id: string, placeholderName: string, serverName: string | null) => void
}) {
    return (
        <div className="edit-advanced nodrag nowheel">
            <div className="adv-section">
                <div className="adv-section__head">
                    <span className="section-title">MCP Servers</span>
                </div>
                <div className="adv-section__body">
                    {(agent?.mcpServerNames?.length || unresolvedMcpPlaceholders.length) ? (
                        <div className="adv-list">
                            {(agent?.mcpServerNames || []).map((serverName) => (
                                <div key={serverName} className="adv-list__item">
                                    <Server size={10} className="adv-list__icon" />
                                    <span className="adv-list__label">{serverName}</span>
                                    <div className="adv-list__actions">
                                        <button type="button" className="icon-btn" onClick={() => onRemoveMcp(agentId, serverName)} title="Remove MCP">
                                            <X size={10} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {!mcpBindingRows?.length && unresolvedMcpPlaceholders.map((name) => (
                                <div key={`placeholder:${name}`} className="adv-list__item">
                                    <span className="adv-list__label">{name}</span>
                                    <span className="adv-section__summary">Not mapped</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="adv-section__summary">No MCP servers connected.</span>
                    )}
                </div>
            </div>
            {mcpBindingRows && mcpBindingRows.length > 0 ? (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Bindings</span>
                    </div>
                    <div className="adv-section__body">
                        <div className="adv-list">
                            {mcpBindingRows.map((binding) => (
                                <label key={`binding:${binding.placeholderName}`} className="adv-field">
                                    <span className="adv-field__label">{binding.placeholderName}</span>
                                    <select
                                        className="select nodrag nowheel"
                                        value={binding.serverName || ''}
                                        onChange={(event) => onSetMcpBinding(agentId, binding.placeholderName, event.target.value || null)}
                                    >
                                        <option value="">Select Studio MCP server</option>
                                        {(mcpBindingOptions || []).map((option) => (
                                            <option key={option.name} value={option.name} disabled={option.disabled}>
                                                {option.name}{option.disabled ? ' (disabled)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
            {requestRelations && requestRelations.length > 0 ? (
                <div className="adv-section">
                    <div className="adv-section__head">
                        <span className="section-title">Requests</span>
                    </div>
                    <div className="adv-section__body">
                        <div className="adv-list">
                            {requestRelations.map((relation, index) => (
                                <div key={`${relation.targetName}:${index}`} className="adv-list__item">
                                    <Zap size={10} className="adv-list__icon" />
                                    <span className="adv-list__label">{relation.targetName}</span>
                                    <span className="adv-section__summary">{relation.description || 'Request relation'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
