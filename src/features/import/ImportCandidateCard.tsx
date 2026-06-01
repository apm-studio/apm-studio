import {
    Bot,
    CheckCircle2,
    Loader2,
    Package,
    PackagePlus,
    Search,
    Server,
    Zap,
} from 'lucide-react'
import type { ApmGitHubImportCandidate } from '../../../shared/apm-contracts'
import {
    type ImportScope,
    scopeLabel,
} from './import-catalog-model'

function candidateIcon(kind: ApmGitHubImportCandidate['kind']) {
    if (kind === 'agent') return <Bot size={13} className="primitive-icon agent" />
    if (kind === 'skill') return <Zap size={13} className="primitive-icon skill" />
    if (kind === 'mcp') return <Server size={13} className="primitive-icon mcp" />
    if (kind === 'instruction') return <Search size={13} className="primitive-icon instruction" />
    return <Package size={13} className="primitive-icon agent" />
}

interface ImportCandidateCardProps {
    candidate: ApmGitHubImportCandidate
    selected: boolean
    installing: boolean
    installed: boolean
    importing: boolean
    installScope: ImportScope
    workspaceInstallDisabled: boolean
    onToggle: (candidateId: string) => void
    onInstall: (candidateId: string) => void
}

export function ImportCandidateCard({
    candidate,
    selected,
    installing,
    installed,
    importing,
    installScope,
    workspaceInstallDisabled,
    onToggle,
    onInstall,
}: ImportCandidateCardProps) {
    return (
        <article className={`package-card import-source-item ${selected ? 'is-selected' : ''}`}>
            <label className="import-source-item__select" aria-label={`Select ${candidate.name}`}>
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggle(candidate.id)}
                />
            </label>
            <div className="import-source-item__body">
                <div className="package-card__header">
                    {candidateIcon(candidate.kind)}
                    <span className="package-card__name">{candidate.name}</span>
                </div>
                <div className="package-card__author" title={candidate.sourcePath}>
                    {candidate.kind} / {candidate.sourcePath}
                </div>
                <div className="package-card__desc">
                    {candidate.description || 'No description provided.'}
                </div>
            </div>
            <button
                type="button"
                className={`btn btn--sm ${installed ? '' : 'btn--primary'}`}
                onClick={() => onInstall(candidate.id)}
                disabled={installed || installing || importing || workspaceInstallDisabled}
                title={`Install ${candidate.name} to ${scopeLabel(installScope)}`}
            >
                {installed ? <CheckCircle2 size={12} /> : installing ? <Loader2 size={12} className="spin" /> : <PackagePlus size={12} />}
                {installed ? 'Installed' : 'Install'}
            </button>
        </article>
    )
}
