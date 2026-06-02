import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { displayUrn, getPrimitiveUrn, normalizeAuthor } from './package-library-utils'
import type { PackagePanelItem, McpPanelItem } from './package-panel-types'
import { TeamCascadePreview, AgentCascadePreview } from './PackageCascadePreview'

function syncLabel(state: string) {
    switch (state) {
        case 'up_to_date':
            return 'Up to date'
        case 'update_available':
            return 'Update available'
        case 'upstream_missing':
            return 'Upstream removed'
        case 'repo_drift':
            return 'Repo drift'
        case 'provenance_unverifiable':
            return 'Needs relink'
        case 'check_failed':
            return 'Check failed'
        default:
            return state
    }
}

function sourceLabel(source: string) {
    return source === 'user' ? 'User' : source
}

export default function PackageDetailBody({
    item,
    loading,
}: {
    item: PackagePanelItem | null
    loading: boolean
}) {
    if (!item) {
        return null
    }

    const author = normalizeAuthor(item.author)
    const urn = getPrimitiveUrn(item)
    const tags = Array.isArray(item.tags) ? item.tags : []
    const inlineContent = typeof item.body === 'string'
        ? item.body
        : typeof item.instructions === 'string'
            ? item.instructions
            : typeof item.content === 'string'
                ? item.content
                : null
    const participantCount = item.participantCount || (Array.isArray(item.participants) ? item.participants.length : 0)
    const relationCount = Array.isArray(item.relations) ? item.relations.length : 0
    const skillSync = item.kind === 'skill' ? item.github?.sync : null
    const skillUrns = item.skillUrns
    const hasStructuredDetail = !!inlineContent
        || (Array.isArray(skillUrns) && skillUrns.length > 0)
        || !!item.model
        || participantCount > 0
        || relationCount > 0
        || !!skillSync
    const summaryOnly = item.source === 'registry' && !loading && !hasStructuredDetail

    return (
        <>
            <div className="package-popover__meta">
                {author || item.providerName || item.status || 'Local'}
                {item.kind && ` · ${item.kind}`}
                {item.source && (
                    <span className={`source-badge ${item.source}`} style={{ marginLeft: 6 }}>
                        {sourceLabel(item.source)}
                    </span>
                )}
            </div>

            {urn && <div className="package-popover__urn">{urn}</div>}

            <div className="package-popover__desc">
                {item.description || item.desc || 'No description available.'}
            </div>

            {loading && <div className="package-popover__section-item">Loading details...</div>}

            {summaryOnly && !loading && (
                <div className="alert alert--muted" style={{ marginTop: '8px' }}>
                    Import preview shows summary metadata only. Import the package to inspect full content.
                </div>
            )}

            {inlineContent && (
                <div className="package-popover__section">
                    <div className="section-title">
                        {item.kind === 'instruction' ? 'Instructions' : item.kind === 'skill' ? 'Skills' : 'Content'}
                    </div>
                    <div className="package-popover__content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {inlineContent}
                        </ReactMarkdown>
                    </div>
                </div>
            )}

            {tags.length > 0 && (
                <div className="package-popover__tags">
                    {tags.map((tag: string) => (
                        <span key={tag} className="package-popover__tag">{tag}</span>
                    ))}
                </div>
            )}

            {item.kind === 'skill' && item.github?.source === 'github' && (
                <div className="package-popover__section">
                    <div className="section-title">GitHub Source</div>
                    <div className="package-popover__section-item">{item.github.sourceUrl}</div>
                    {item.github.ref && (
                        <div className="package-popover__section-item">Ref: {item.github.ref}</div>
                    )}
                    {item.github.repoRootSkillPath && (
                        <div className="package-popover__section-item">Path: {item.github.repoRootSkillPath}</div>
                    )}
                    {skillSync && (
                        <>
                            <div className="package-popover__section-item">Status: {syncLabel(skillSync.state)}</div>
                            {skillSync.message && (
                                <div className="package-popover__section-item">{skillSync.message}</div>
                            )}
                            {skillSync.repoDrift?.newSkills?.length ? (
                                <div className="package-popover__section-item">
                                    New upstream skills: {skillSync.repoDrift.newSkills.map((skill) => skill.name).join(', ')}
                                </div>
                            ) : null}
                            {skillSync.repoDrift?.missingPackagePrimitiveUrns?.length ? (
                                <div className="package-popover__section-item">
                                    Missing local primitives: {skillSync.repoDrift.missingPackagePrimitiveUrns.map((item) => displayUrn(item)).join(', ')}
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            )}

            {item.kind === 'agent' && (
                <>
                    <div className="package-popover__section">
                        <div className="section-title">Cascade</div>
                        <AgentCascadePreview item={item} />
                    </div>
                    {Array.isArray(skillUrns) && skillUrns.length > 0 && (
                        <div className="package-popover__section">
                            <div className="section-title">References</div>
                            {Array.isArray(skillUrns) && skillUrns.map((skillUrn: string) => (
                                <div key={skillUrn} className="package-popover__section-item">Skill: {displayUrn(skillUrn)}</div>
                            ))}
                        </div>
                    )}
                    {item.model && (
                        <div className="package-popover__section">
                            <div className="section-title">Studio-only Model</div>
                            <div className="package-popover__section-item">
                                {item.model.provider}/{item.model.modelId}
                            </div>
                            {item.modelVariant && (
                                <div className="package-popover__section-item">
                                    Variant: {item.modelVariant}
                                </div>
                            )}
                        </div>
                    )}
                    {Array.isArray(item.declaredMcpServerNames) && item.declaredMcpServerNames.length > 0 && (
                        <div className="package-popover__section">
                            <div className="section-title">MCP Portability</div>
                            <div className="package-popover__section-item">
                                Declared: {item.declaredMcpServerNames.join(', ')}
                            </div>
                            <div className="package-popover__section-item">
                                Library matches: {Array.isArray(item.matchedMcpServerNames) && item.matchedMcpServerNames.length > 0
                                    ? item.matchedMcpServerNames.join(', ')
                                    : 'None'}
                            </div>
                            <div className="package-popover__section-item">
                                Needs mapping: {Array.isArray(item.missingMcpServerNames) && item.missingMcpServerNames.length > 0
                                    ? item.missingMcpServerNames.join(', ')
                                    : 'None'}
                            </div>
                            <div className="alert alert--muted" style={{ marginTop: '8px' }}>
                                Imported and local agents keep portable MCP requirements. Exact Studio-library name matches can auto-connect on import, but final MCP binding still belongs to each agent on the canvas.
                            </div>
                        </div>
                    )}
                </>
            )}

            {item.kind === 'team' && (
                <>
                    <div className="package-popover__section">
                        <div className="section-title">Team Summary</div>
                        <div className="package-popover__section-item">Participants: {participantCount}</div>
                        <div className="package-popover__section-item">Relations: {relationCount}</div>
                    </div>
                    <div className="package-popover__section">
                        <div className="section-title">Cascade</div>
                        <TeamCascadePreview item={item} />
                    </div>
                </>
            )}

            {item.kind === 'model' && (
                <div className="package-popover__section">
                    <div className="section-title">Details</div>
                    {item.context && <div className="package-popover__section-item">Context: {Math.round(item.context / 1000)}k tokens</div>}
                    <div className="package-popover__section-item">Status: {item.connected ? 'Ready' : 'Connect provider'}</div>
                    <div className="package-popover__section-item">Tools: {item.toolCall ? 'Yes' : 'No'}</div>
                    <div className="package-popover__section-item">Attachments: {item.attachment ? 'Yes' : 'No'}</div>
                    {item.modalities && (
                        <div className="package-popover__section-item">
                            I/O: {(item.modalities.input || []).join(', ') || 'text'} / {(item.modalities.output || []).join(', ') || 'text'}
                        </div>
                    )}
                </div>
            )}

            {item.kind === 'mcp' && (
                <>
                    <div className="package-popover__section">
                        <div className="section-title">Capabilities</div>
                        <div className="package-popover__section-item">Status: {item.status || 'unknown'}</div>
                        {item.configType && <div className="package-popover__section-item">Transport: {item.configType}</div>}
                        {item.authStatus === 'needs_auth' && <div className="package-popover__section-item">Authentication required</div>}
                        {item.clientRegistrationRequired && <div className="package-popover__section-item">OAuth client registration required</div>}
                        {item.error && <div className="package-popover__section-item">{item.error}</div>}
                    </div>
                    {Array.isArray(item.tools) && item.tools.length > 0 && (
                        <div className="package-popover__section">
                            <div className="section-title">Tools</div>
                            {item.tools.slice(0, 8).map((tool: NonNullable<McpPanelItem['tools']>[number]) => (
                                <div key={tool.name} className="package-popover__section-item">
                                    {tool.name}{tool.description ? ` · ${tool.description}` : ''}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </>
    )
}
