import type { PackagePanelItem, PackagePrimitive } from './package-panel-types'
import { useResolvedPackageDetail } from './useResolvedPackageDetail'
import {
    extractInlinePrimitiveContent,
    getTeamCascadeParticipants,
    getTeamCascadeRelations,
    getTeamRules,
    getAgentCascadeReferences,
    getAgentSummary,
    summarizeMarkdown,
    type CascadeReference,
} from './package-detail-cascade'

function CascadeReferenceNode({
    reference,
    subtitle,
    level = 0,
}: {
    reference: CascadeReference
    subtitle?: string | null
    level?: number
}) {
    const { resolvedItem, loading } = useResolvedPackageDetail(reference.stub)
    const item = (resolvedItem || reference.stub) as PackagePrimitive | null
    const title = item?.name || reference.label
    const kind = item?.kind || reference.kind
    const preview = summarizeMarkdown(extractInlinePrimitiveContent(item))
    const agentSummary = item?.kind === 'agent' ? getAgentSummary(item) : null
    const children = item?.kind === 'agent' ? getAgentCascadeReferences(item) : []

    return (
        <div className="package-cascade__node" data-kind={kind} data-level={level}>
            <div className="package-cascade__header">
                <span className={`package-cascade__kind package-cascade__kind--${kind}`}>{kind}</span>
                <span className="package-cascade__title">{title}</span>
            </div>
            {subtitle ? <div className="package-cascade__meta">{subtitle}</div> : null}
            {agentSummary ? <div className="package-cascade__meta">{agentSummary}</div> : null}
            {preview ? <div className="package-cascade__excerpt">{preview}</div> : null}
            {loading && !preview && !agentSummary ? (
                <div className="package-cascade__meta">Loading details...</div>
            ) : null}
            {children.length > 0 ? (
                <div className="package-cascade__children">
                    {children.map((child, index) => (
                        <CascadeReferenceNode
                            key={`${child.kind}:${child.stub?.urn || child.label}:${index}`}
                            reference={child}
                            level={level + 1}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    )
}

export function AgentCascadePreview({ item }: { item: PackagePanelItem }) {
    const references = getAgentCascadeReferences(item)

    if (references.length === 0) {
        return <div className="package-cascade__empty">No linked Instruction or Skill primitives.</div>
    }

    return (
        <div className="package-cascade">
            {references.map((reference, index) => (
                <CascadeReferenceNode
                    key={`${reference.kind}:${reference.stub?.urn || reference.label}:${index}`}
                    reference={reference}
                />
            ))}
        </div>
    )
}

export function TeamCascadePreview({ item }: { item: PackagePanelItem }) {
    const participants = getTeamCascadeParticipants(item)
    const relations = getTeamCascadeRelations(item)
    const teamRules = getTeamRules(item)

    return (
        <div className="package-cascade package-cascade--team">
            <div className="package-cascade__group">
                <div className="package-cascade__group-title">Participants</div>
                {participants.length > 0 ? (
                    participants.map((participant, index) => (
                        <CascadeReferenceNode
                            key={`${participant.key}:${participant.agent.stub?.urn || participant.agent.label}:${index}`}
                            reference={participant.agent}
                            subtitle={[
                                `key: ${participant.key}`,
                                ...participant.subscriptions,
                            ].join(' · ')}
                        />
                    ))
                ) : (
                    <div className="package-cascade__empty">No participants defined.</div>
                )}
            </div>

            <div className="package-cascade__group">
                <div className="package-cascade__group-title">Relations</div>
                {relations.length > 0 ? (
                    <div className="package-cascade__relations">
                        {relations.map((relation, index) => (
                            <div key={`${relation.name}:${relation.between.join(':')}:${index}`} className="package-cascade__relation">
                                <div className="package-cascade__relation-title">
                                    {relation.name}
                                    <span className="package-cascade__relation-path">
                                        {relation.between[0]} {relation.direction === 'one-way' ? '->' : '<->'} {relation.between[1]}
                                    </span>
                                </div>
                                {relation.description ? (
                                    <div className="package-cascade__relation-desc">{relation.description}</div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="package-cascade__empty">No relations defined.</div>
                )}
            </div>

            {teamRules.length > 0 ? (
                <div className="package-cascade__group">
                    <div className="package-cascade__group-title">Team Rules</div>
                    <div className="package-cascade__rules">
                        {teamRules.map((rule) => (
                            <div key={rule} className="package-cascade__rule">{rule}</div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
