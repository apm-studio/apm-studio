import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apmApi } from '../../api-clients/apm'
import { useAppHeader } from '../../components/AppHeaderContext'
import { queryKeys } from '../../hooks/queries/keys'
import { showToast } from '../../lib/toast'
import { useStudioStore } from '../../store'
import type {
    ApmGitHubImportFormat,
    ApmGitHubImportRequest,
    ApmGitHubImportPreviewResponse,
} from '../../../shared/apm-contracts'
import { ImportResultsPanel } from './ImportResultsPanel'
import { ImportSearchPanel } from './ImportSearchPanel'
import {
    candidateInstallKey,
    filterImportCandidates,
    type ImportScope,
    type ResultKindFilter,
    scopeLabel,
} from './import-catalog-model'
import '../../components/panels/PackageLibrary.css'
import './ImportPage.css'

export default function ImportPage() {
    const [manualSource, setManualSource] = useState('')
    const [manualFormat, setManualFormat] = useState<ApmGitHubImportFormat>('auto')
    const [manualPreviewResponse, setManualPreviewResponse] = useState<ApmGitHubImportPreviewResponse | null>(null)
    const [manualPreviewRequest, setManualPreviewRequest] = useState<ApmGitHubImportRequest | null>(null)
    const [manualSelectedCandidateIds, setManualSelectedCandidateIds] = useState<Set<string>>(new Set())
    const [manualPreviewLoading, setManualPreviewLoading] = useState(false)
    const [manualPreviewError, setManualPreviewError] = useState<string | null>(null)
    const [manualImporting, setManualImporting] = useState(false)
    const [installScope, setInstallScope] = useState<ImportScope>('workspace')
    const [resultQuery, setResultQuery] = useState('')
    const [resultKind, setResultKind] = useState<ResultKindFilter>('all')
    const [candidateInstallingId, setCandidateInstallingId] = useState<string | null>(null)
    const [installedCandidateKeys, setInstalledCandidateKeys] = useState<Set<string>>(new Set())
    const queryClient = useQueryClient()
    const workingDir = useStudioStore((state) => state.workingDir)
    const setWorkspaceMode = useStudioStore((state) => state.setWorkspaceMode)

    const selectedParsedCount = manualSelectedCandidateIds.size
    const workspacePath = workingDir
    const installTargetPath = installScope === 'user'
        ? '~/.apm'
        : workspacePath || 'No workspace selected'
    const headerConfig = useMemo(() => ({
        title: 'Search',
    }), [])
    useAppHeader(headerConfig)

    const workspaceInstallDisabled = installScope === 'workspace' && !workspacePath
    const shouldShowResults = Boolean(manualPreviewLoading || manualPreviewError || manualPreviewResponse)
    const resultCandidates = useMemo(
        () => manualPreviewResponse?.candidates || [],
        [manualPreviewResponse?.candidates],
    )
    const filteredCandidates = useMemo(
        () => filterImportCandidates(resultCandidates, resultQuery, resultKind),
        [resultCandidates, resultKind, resultQuery],
    )

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
            const response = await apmApi.previewGitHub(request)
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
            showToast('Select a workspace before importing a package.', 'error', {
                title: 'No workspace selected',
                dedupeKey: 'import:github:no-workspace',
            })
            return
        }
        const candidateIds = candidateIdsOverride || [...manualSelectedCandidateIds]
        if (candidateIds.length === 0) {
            setManualPreviewError('Select at least one detected package item.')
            return
        }
        if (candidateIdsOverride?.length === 1) {
            setCandidateInstallingId(candidateIdsOverride[0])
        } else {
            setManualImporting(true)
        }
        setManualPreviewError(null)
        try {
            const result = await apmApi.importGitHub({
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
                ...(installScope === 'workspace' ? {
                    actionLabel: 'Go to Inject',
                    onAction: () => setWorkspaceMode('inject'),
                } : {}),
            })
        } catch (caught) {
            showToast(caught instanceof Error ? caught.message : 'Unable to import selected package items.', 'error', {
                title: 'Import failed',
                dedupeKey: `import:github:${manualPreviewRequest.source}`,
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
        <main className={`import-page import-page--simple ${shouldShowResults ? 'has-results' : ''}`}>
            <ImportSearchPanel
                source={manualSource}
                format={manualFormat}
                loading={manualPreviewLoading}
                onSourceChange={setManualSource}
                onFormatChange={setManualFormat}
                onSearch={() => void parseManualImportSource()}
                onCuratedSearch={(source, format) => void parseManualImportSource(source, format)}
            />

            {shouldShowResults ? (
                <ImportResultsPanel
                    previewLoading={manualPreviewLoading}
                    previewError={manualPreviewError}
                    previewResponse={manualPreviewResponse}
                    resultCandidates={resultCandidates}
                    filteredCandidates={filteredCandidates}
                    resultQuery={resultQuery}
                    resultKind={resultKind}
                    installScope={installScope}
                    installTargetPath={installTargetPath}
                    selectedCandidateIds={manualSelectedCandidateIds}
                    selectedCount={selectedParsedCount}
                    importing={manualImporting}
                    candidateInstallingId={candidateInstallingId}
                    installedCandidateKeys={installedCandidateKeys}
                    workspaceInstallDisabled={workspaceInstallDisabled}
                    onImportSelected={() => void handleManualImport()}
                    onImportCandidate={(candidateId) => void handleManualImport([candidateId])}
                    onToggleCandidate={toggleManualCandidate}
                    onQueryChange={setResultQuery}
                    onKindChange={setResultKind}
                    onScopeChange={setInstallScope}
                />
            ) : null}
        </main>
    )
}
