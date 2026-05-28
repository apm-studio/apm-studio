import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    Bot,
    CheckCircle2,
    FolderOpen,
    Globe2,
    Loader2,
    Package,
    PackagePlus,
    Search,
    Server,
    Zap,
} from 'lucide-react'
import { api } from '../../api'
import { useAppHeader } from '../../components/AppHeaderContext'
import { queryKeys, useApmAssetStatus } from '../../hooks/queries'
import { showToast } from '../../lib/toast'
import { useStudioStore } from '../../store'
import type {
    ApmGitHubImportFormat,
    ApmGitHubImportPackage,
    ApmGitHubImportRequest,
    ApmGitHubImportPreviewResponse,
} from '../../../shared/apm-contracts'
import '../../components/panels/AssetLibrary.css'
import './ExplorePresetCatalog.css'

type ImportScope = 'stage' | 'global'
type ResultKindFilter = ApmGitHubImportPackage['kind'] | 'all'

const IMPORT_FORMATS: Array<{ value: ApmGitHubImportFormat; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'apm', label: 'APM' },
    { value: 'skill-md', label: 'SKILL.md' },
    { value: 'claude-md', label: 'Claude md' },
    { value: 'codex-toml', label: 'Codex TOML' },
    { value: 'instruction-md', label: 'Instructions' },
    { value: 'mcp-config', label: 'MCP config' },
]

const RESULT_KIND_FILTERS: Array<{ value: ResultKindFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'package', label: 'Packages' },
    { value: 'agent', label: 'Agents' },
    { value: 'skill', label: 'Skills' },
    { value: 'instruction', label: 'Instructions' },
    { value: 'mcp', label: 'MCP' },
]

const CURATED_GITHUB_REPOS: Array<{ name: string; repo: string }> = [
    { name: 'Awesome Copilot', repo: 'github/awesome-copilot' },
    { name: 'Addy Agent Skills', repo: 'addyosmani/agent-skills' },
    { name: 'Vercel Skills', repo: 'vercel-labs/skills' },
    { name: 'Vercel Agent Skills', repo: 'vercel-labs/agent-skills' },
    { name: 'Microsoft Skills', repo: 'microsoft/skills' },
    { name: 'Claude Subagents', repo: 'VoltAgent/awesome-claude-code-subagents' },
    { name: 'Microsoft APM', repo: 'microsoft/apm' },
    { name: 'Agent Skills Index', repo: 'VoltAgent/awesome-agent-skills' },
]

function candidateIcon(kind: ApmGitHubImportPackage['kind']) {
    if (kind === 'agent') return <Bot size={13} className="asset-icon performer" />
    if (kind === 'skill') return <Zap size={13} className="asset-icon dance" />
    if (kind === 'mcp') return <Server size={13} className="asset-icon mcp" />
    if (kind === 'instruction') return <Search size={13} className="asset-icon tal" />
    return <Package size={13} className="asset-icon performer" />
}

function scopeLabel(scope: ImportScope) {
    return scope === 'global' ? 'Global' : 'Workspace'
}

function candidateInstallKey(scope: ImportScope, candidateId: string) {
    return `${scope}:${candidateId}`
}

export default function ExplorePresetCatalog() {
    const [manualSource, setManualSource] = useState('')
    const [manualFormat, setManualFormat] = useState<ApmGitHubImportFormat>('auto')
    const [manualPreviewResponse, setManualPreviewResponse] = useState<ApmGitHubImportPreviewResponse | null>(null)
    const [manualPreviewRequest, setManualPreviewRequest] = useState<ApmGitHubImportRequest | null>(null)
    const [manualSelectedCandidateIds, setManualSelectedCandidateIds] = useState<Set<string>>(new Set())
    const [manualPreviewLoading, setManualPreviewLoading] = useState(false)
    const [manualPreviewError, setManualPreviewError] = useState<string | null>(null)
    const [manualImporting, setManualImporting] = useState(false)
    const [installScope, setInstallScope] = useState<ImportScope>('stage')
    const [resultQuery, setResultQuery] = useState('')
    const [resultKind, setResultKind] = useState<ResultKindFilter>('all')
    const [candidateInstallingId, setCandidateInstallingId] = useState<string | null>(null)
    const [installedCandidateKeys, setInstalledCandidateKeys] = useState<Set<string>>(new Set())
    const queryClient = useQueryClient()
    const workingDir = useStudioStore((state) => state.workingDir)
    const setWorkspaceMode = useStudioStore((state) => state.setWorkspaceMode)
    const { data: apmAssetStatus } = useApmAssetStatus()

    const selectedParsedCount = manualSelectedCandidateIds.size
    const workspacePath = workingDir
    const installTargetPath = installScope === 'global'
        ? apmAssetStatus?.globalApmAssetDir || 'Global APM Studio home'
        : workspacePath || 'No workspace selected'
    const headerConfig = useMemo(() => ({
        title: 'Search',
    }), [])
    useAppHeader(headerConfig)

    const workspaceInstallDisabled = installScope === 'stage' && !workspacePath
    const shouldShowResults = Boolean(manualPreviewLoading || manualPreviewError || manualPreviewResponse)
    const resultCandidates = manualPreviewResponse?.candidates || []
    const normalizedResultQuery = resultQuery.trim().toLowerCase()
    const filteredCandidates = resultCandidates.filter((candidate) => {
        if (resultKind !== 'all' && candidate.kind !== resultKind) return false
        if (!normalizedResultQuery) return true
        return [
            candidate.name,
            candidate.description,
            candidate.kind,
            candidate.format,
            candidate.sourcePath,
            candidate.packageId,
            ...candidate.targets,
        ].some((value) => value.toLowerCase().includes(normalizedResultQuery))
    })

    const parseManualImportSource = async (sourceOverride?: string, formatOverride?: ApmGitHubImportFormat) => {
        const source = (sourceOverride ?? manualSource).trim()
        if (!source) {
            setManualPreviewError('Enter a GitHub repository or URL first.')
            return
        }
        if (sourceOverride !== undefined) {
            setManualSource(source)
        }
        const format = formatOverride || manualFormat
        if (formatOverride) {
            setManualFormat(formatOverride)
        }
        const request: ApmGitHubImportRequest = {
            source,
            format,
            limit: 24,
        }
        setManualPreviewLoading(true)
        setManualPreviewError(null)
        setManualPreviewResponse(null)
        setManualPreviewRequest(request)
        setResultQuery('')
        setResultKind('all')
        setInstalledCandidateKeys(new Set())
        try {
            const response = await api.apm.previewGitHub(request)
            setManualPreviewResponse(response)
            setManualSelectedCandidateIds(new Set(response.candidates.map((candidate) => candidate.id)))
        } catch (caught) {
            setManualPreviewError(caught instanceof Error ? caught.message : 'Unable to parse GitHub source.')
            setManualSelectedCandidateIds(new Set())
        } finally {
            setManualPreviewLoading(false)
        }
    }

    const handleManualImport = async (candidateIdsOverride?: string[]) => {
        if (!manualPreviewRequest || manualImporting || candidateInstallingId) return
        if (workspaceInstallDisabled) {
            showToast('Select a workspace before importing an asset.', 'error', {
                title: 'No workspace selected',
                dedupeKey: 'explore:github:no-workspace',
            })
            return
        }
        const candidateIds = candidateIdsOverride || [...manualSelectedCandidateIds]
        if (candidateIds.length === 0) {
            setManualPreviewError('Select at least one detected asset.')
            return
        }
        if (candidateIdsOverride?.length === 1) {
            setCandidateInstallingId(candidateIdsOverride[0])
        } else {
            setManualImporting(true)
        }
        setManualPreviewError(null)
        try {
            const result = await api.apm.importGitHub({
                ...manualPreviewRequest,
                candidateIds,
                scope: installScope,
            })
            if (workingDir) {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['apm-packages', workingDir] }),
                    queryClient.invalidateQueries({ queryKey: [...queryKeys.agents, workingDir] }),
                ])
            }
            setInstalledCandidateKeys((current) => {
                const next = new Set(current)
                for (const candidateId of candidateIds) {
                    next.add(candidateInstallKey(installScope, candidateId))
                }
                return next
            })
            showToast(`Imported ${result.packages.length} APM package${result.packages.length === 1 ? '' : 's'} to ${scopeLabel(installScope)}.`, 'success', {
                title: 'APM import complete',
                ...(installScope === 'stage' ? {
                    actionLabel: 'Go to Export',
                    onAction: () => setWorkspaceMode('export'),
                } : {}),
            })
        } catch (caught) {
            showToast(caught instanceof Error ? caught.message : 'Unable to import selected assets.', 'error', {
                title: 'Import failed',
                dedupeKey: `explore:github:${manualPreviewRequest.source}`,
            })
        } finally {
            setManualImporting(false)
            setCandidateInstallingId(null)
        }
    }

    const toggleManualCandidate = (candidateId: string) => {
        setManualSelectedCandidateIds((current) => {
            const next = new Set(current)
            if (next.has(candidateId)) {
                next.delete(candidateId)
            } else {
                next.add(candidateId)
            }
            return next
        })
    }

    return (
        <main className={`explore-page explore-page--simple ${shouldShowResults ? 'has-results' : ''}`}>
            <section className="explore-search-hero" aria-label="GitHub source search">
                <div className="explore-search-hero__title">
                    <h1>Search</h1>
                </div>

                <form
                    className="explore-search-form"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void parseManualImportSource()
                    }}
                >
                    <Search size={17} />
                    <input
                        className="input"
                        value={manualSource}
                        onChange={(event) => setManualSource(event.target.value)}
                        placeholder="Search GitHub source or paste owner/repo"
                    />
                    <select
                        className="select"
                        value={manualFormat}
                        onChange={(event) => setManualFormat(event.target.value as ApmGitHubImportFormat)}
                        aria-label="GitHub import format"
                    >
                        {IMPORT_FORMATS.map((format) => (
                            <option key={format.value} value={format.value}>{format.label}</option>
                        ))}
                    </select>
                    <button className="btn btn--primary" type="submit" disabled={manualPreviewLoading || !manualSource.trim()}>
                        {manualPreviewLoading ? <Loader2 size={13} className="spin" /> : <Search size={13} />}
                        Search
                    </button>
                </form>

                <div className="explore-curated-repos" aria-label="Curated GitHub repositories">
                    <span>Curated</span>
                    {CURATED_GITHUB_REPOS.map((source) => (
                        <button
                            key={source.repo}
                            type="button"
                            onClick={() => void parseManualImportSource(source.repo, 'auto')}
                            title={source.repo}
                        >
                            {source.name}
                        </button>
                    ))}
                </div>
            </section>

            {shouldShowResults ? (
                <section className="explore-page__parsed-panel" aria-label="Parsed GitHub assets">
                    <header className="explore-results-top">
                        <div className="explore-results-top__summary">
                            <div>
                                <h2>Results</h2>
                                <p>
                                    {manualPreviewLoading
                                        ? 'Parsing repository...'
                                        : manualPreviewResponse
                                            ? `${manualPreviewResponse.source.repo} · ${filteredCandidates.length}/${resultCandidates.length} shown`
                                            : 'No parsed results yet.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="btn btn--primary"
                                onClick={() => void handleManualImport()}
                                disabled={!manualPreviewResponse || selectedParsedCount === 0 || manualImporting || !!candidateInstallingId || workspaceInstallDisabled}
                            >
                                {manualImporting ? <Loader2 size={13} className="spin" /> : <PackagePlus size={13} />}
                                Install Selected
                            </button>
                        </div>

                        <div className="explore-results-controls">
                            <label className="explore-result-search" aria-label="Search results">
                                <Search size={13} />
                                <input
                                    className="input"
                                    value={resultQuery}
                                    onChange={(event) => setResultQuery(event.target.value)}
                                    placeholder="Search results"
                                    disabled={!manualPreviewResponse}
                                />
                            </label>
                            <select
                                className="select explore-result-kind"
                                value={resultKind}
                                onChange={(event) => setResultKind(event.target.value as ResultKindFilter)}
                                disabled={!manualPreviewResponse}
                                aria-label="Filter result kind"
                            >
                                {RESULT_KIND_FILTERS.map((filter) => (
                                    <option key={filter.value} value={filter.value}>{filter.label}</option>
                                ))}
                            </select>
                            <div className="explore-install-scope" aria-label="Install target">
                                <button
                                    type="button"
                                    className={`tab ${installScope === 'stage' ? 'active' : ''}`}
                                    onClick={() => setInstallScope('stage')}
                                >
                                    <FolderOpen size={12} />
                                    Workspace
                                </button>
                                <button
                                    type="button"
                                    className={`tab ${installScope === 'global' ? 'active' : ''}`}
                                    onClick={() => setInstallScope('global')}
                                >
                                    <Globe2 size={12} />
                                    Global
                                </button>
                            </div>
                        </div>
                        <p className="explore-install-target" title={installTargetPath}>{scopeLabel(installScope)}: {installTargetPath}</p>
                    </header>

                    <div className="explore-results-scroll">
                        {manualPreviewError ? (
                            <div className="alert alert--danger explore-parsed-alert">{manualPreviewError}</div>
                        ) : null}
                        {manualPreviewResponse?.warnings.length ? (
                            <div className="alert alert--muted explore-parsed-alert">{manualPreviewResponse.warnings[0]}</div>
                        ) : null}

                        {manualPreviewLoading ? (
                            <div className="explore-parsed-empty">
                                <Loader2 size={16} className="spin" />
                                <span>Parsing repository...</span>
                            </div>
                        ) : manualPreviewResponse ? (
                            <>
                            <div className="explore-parsed-grid">
                                {filteredCandidates.map((candidate) => {
                                    const selected = manualSelectedCandidateIds.has(candidate.id)
                                    const installing = candidateInstallingId === candidate.id
                                    const installed = installedCandidateKeys.has(candidateInstallKey(installScope, candidate.id))
                                    return (
                                        <article key={candidate.id} className={`asset-card explore-parsed-asset ${selected ? 'is-selected' : ''}`}>
                                            <label className="explore-parsed-asset__select" aria-label={`Select ${candidate.name}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleManualCandidate(candidate.id)}
                                                />
                                            </label>
                                            <div className="explore-parsed-asset__body">
                                                <div className="asset-card__header">
                                                    {candidateIcon(candidate.kind)}
                                                    <span className="asset-card__name">{candidate.name}</span>
                                                </div>
                                                <div className="asset-card__author" title={candidate.sourcePath}>
                                                    {candidate.kind} / {candidate.sourcePath}
                                                </div>
                                                <div className="asset-card__desc">
                                                    {candidate.description || 'No description provided.'}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className={`btn btn--sm ${installed ? '' : 'btn--primary'}`}
                                                onClick={() => void handleManualImport([candidate.id])}
                                                disabled={installed || installing || manualImporting || workspaceInstallDisabled}
                                                title={`Install ${candidate.name} to ${scopeLabel(installScope)}`}
                                            >
                                                {installed ? <CheckCircle2 size={12} /> : installing ? <Loader2 size={12} className="spin" /> : <PackagePlus size={12} />}
                                                {installed ? 'Installed' : 'Install'}
                                            </button>
                                        </article>
                                    )
                                })}
                                {filteredCandidates.length === 0 ? (
                                    <div className="explore-parsed-empty">
                                        <Search size={16} />
                                        <span>No results match this search or filter.</span>
                                    </div>
                                ) : null}
                            </div>
                        </>
                    ) : null}
                    </div>
                </section>
            ) : null}
        </main>
    )
}
