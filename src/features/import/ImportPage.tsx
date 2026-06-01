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
import type { RegistryListing } from '../../../shared/registry-contracts'
import { ImportResultsPanel } from './ImportResultsPanel'
import { ImportSearchPanel } from './ImportSearchPanel'
import {
    candidateInstallKey,
    filterImportCandidates,
    registryListingSource,
    registryListingToGitHubImportRequest,
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
    const [registryListings, setRegistryListings] = useState<RegistryListing[]>([])
    const [registryLoading, setRegistryLoading] = useState(false)
    const [registryError, setRegistryError] = useState<string | null>(null)
    const [registryPreviewingId, setRegistryPreviewingId] = useState<string | null>(null)
    const [resultQuery, setResultQuery] = useState('')
    const [resultKind, setResultKind] = useState<ResultKindFilter>('all')
    const [candidateInstallingId, setCandidateInstallingId] = useState<string | null>(null)
    const [installedCandidateKeys, setInstalledCandidateKeys] = useState<Set<string>>(new Set())
    const queryClient = useQueryClient()
    const workingDir = useStudioStore((state) => state.workingDir)
    const setWorkspaceMode = useStudioStore((state) => state.setWorkspaceMode)
    const installScope = useStudioStore((state) => state.apmPackageScope)

    const selectedParsedCount = manualSelectedCandidateIds.size
    const workspacePath = workingDir
    const installTargetPath = installScope === 'user'
        ? '~/.apm'
        : workspacePath || 'No workspace selected'
    const headerConfig = useMemo(() => ({
        hideContext: true,
    }), [])
    useAppHeader(headerConfig)

    const workspaceInstallDisabled = installScope === 'workspace' && !workspacePath
    const shouldShowResults = Boolean(
        manualPreviewLoading
        || manualPreviewError
        || manualPreviewResponse
        || registryLoading
        || registryError
        || registryListings.length > 0,
    )
    const resultCandidates = useMemo(
        () => manualPreviewResponse?.candidates || [],
        [manualPreviewResponse?.candidates],
    )
    const filteredCandidates = useMemo(
        () => filterImportCandidates(resultCandidates, resultQuery, resultKind),
        [resultCandidates, resultKind, resultQuery],
    )

    const looksLikeGitHubSource = (source: string) => (
        source.includes('/')
        || source.includes('github.com')
        || source.includes('raw.githubusercontent.com')
        || source.startsWith('git@github.com:')
    )

    const searchRegistryCatalog = async (queryOverride?: string) => {
        const query = (queryOverride ?? manualSource).trim()
        if (!query) {
            setRegistryListings([])
            setRegistryError(null)
            return
        }
        setRegistryLoading(true)
        setRegistryError(null)
        try {
            const response = await apmApi.registryCatalog({ q: query, limit: 12 })
            setRegistryListings(response.listings)
        } catch (caught) {
            setRegistryError(caught instanceof Error ? caught.message : 'Unable to search APM Registry.')
            setRegistryListings([])
        } finally {
            setRegistryLoading(false)
        }
    }

    const parseManualImportSource = async (
        sourceOverride?: string,
        formatOverride?: ApmGitHubImportFormat,
        requestOverride?: Partial<ApmGitHubImportRequest>,
    ) => {
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
            ...requestOverride,
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

    const handleSearch = async () => {
        const source = manualSource.trim()
        if (!source) {
            setManualPreviewError('Enter a registry search term or GitHub repository first.')
            return
        }
        setManualPreviewResponse(null)
        setManualPreviewRequest(null)
        setManualPreviewError(null)
        await Promise.all([
            searchRegistryCatalog(source),
            looksLikeGitHubSource(source)
                ? parseManualImportSource(source)
                : Promise.resolve(),
        ])
    }

    const previewRegistryListing = async (listing: RegistryListing) => {
        const request = registryListingToGitHubImportRequest(listing)
        if (!request) {
            showToast(`The ${listing.importRecipe.format} import recipe is not supported by Studio preview yet.`, 'error', {
                title: 'Unsupported registry listing',
                dedupeKey: `registry-preview:${listing.id}`,
            })
            return
        }
        setRegistryPreviewingId(listing.id)
        try {
            await parseManualImportSource(registryListingSource(listing), request.format, request)
        } finally {
            setRegistryPreviewingId(null)
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
                    queryClient.invalidateQueries({ queryKey: ['apm-packages'] }),
                    queryClient.invalidateQueries({ queryKey: [...queryKeys.agents, workingDir] }),
                ])
            } else {
                await queryClient.invalidateQueries({ queryKey: ['apm-packages'] })
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
                    actionLabel: 'Open Studio Agent',
                    onAction: () => setWorkspaceMode('studio-agent'),
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
                onSearch={() => void handleSearch()}
                onCuratedSearch={(source, format) => void parseManualImportSource(source, format)}
                installScope={installScope}
                installTargetPath={installTargetPath}
            />

            {shouldShowResults ? (
                <ImportResultsPanel
                    previewLoading={manualPreviewLoading}
                    previewError={manualPreviewError}
                    previewResponse={manualPreviewResponse}
                    registryListings={registryListings}
                    registryLoading={registryLoading}
                    registryError={registryError}
                    registryPreviewingId={registryPreviewingId}
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
                    onPreviewRegistryListing={(listing) => void previewRegistryListing(listing)}
                    onQueryChange={setResultQuery}
                    onKindChange={setResultKind}
                />
            ) : null}
        </main>
    )
}
