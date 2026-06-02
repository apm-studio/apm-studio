import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apmApi } from '../../api-clients/apm'
import { useAppHeader } from '../../components/AppHeaderContext'
import { queryKeys } from '../../hooks/queries/keys'
import { useApmPackages } from '../../hooks/queries/apm'
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
import { ImportAssetDetailsModal } from './ImportAssetDetailsModal'
import type { ImportAssetDetailRequest } from './import-detail-model'
import {
    addImportSearchHistoryEntry,
    candidateInstallKey,
    countSelectedImportCandidates,
    filterImportCandidates,
    filterRegistryListings,
    importInstallTargetKey,
    readImportSearchHistory,
    registryListingSource,
    registryListingToGitHubImportRequest,
    type ImportSearchHistoryEntry,
    type ResultElementFilter,
    type ResultKindFilter,
    selectableImportCandidateIds,
    scopeLabel,
    updateImportCandidateSelection,
    writeImportSearchHistory,
} from './import-catalog-model'
import '../../components/panels/PackageLibrary.css'
import './ImportPage.css'

interface ImportPageProps {
    active?: boolean
}

function ImportPageHeader() {
    const headerConfig = useMemo(() => ({
        hideContext: true,
    }), [])
    useAppHeader(headerConfig)
    return null
}

export default function ImportPage({ active = true }: ImportPageProps) {
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
    const [resultElement, setResultElement] = useState<ResultElementFilter>('all')
    const [candidateInstallingId, setCandidateInstallingId] = useState<string | null>(null)
    const [optimisticInstalledPackageKeys, setOptimisticInstalledPackageKeys] = useState<Set<string>>(new Set())
    const [assetDetailRequest, setAssetDetailRequest] = useState<ImportAssetDetailRequest | null>(null)
    const [searchHistory, setSearchHistory] = useState<ImportSearchHistoryEntry[]>(() => readImportSearchHistory())
    const queryClient = useQueryClient()
    const workingDir = useStudioStore((state) => state.workingDir)
    const setWorkspaceMode = useStudioStore((state) => state.setWorkspaceMode)
    const installScope = useStudioStore((state) => state.apmPackageScope)

    const workspacePath = workingDir
    const installTargetPath = installScope === 'user'
        ? '~/.apm'
        : workspacePath || 'No workspace selected'
    const workspaceInstallDisabled = installScope === 'workspace' && !workspacePath
    const installTargetKey = useMemo(
        () => importInstallTargetKey(installScope, workspacePath),
        [installScope, workspacePath],
    )
    const { data: installTargetPackages = [] } = useApmPackages(
        active && !workspaceInstallDisabled,
        installScope,
    )
    const installedPackageIds = useMemo(
        () => new Set(installTargetPackages.map((pkg) => pkg.packageId)),
        [installTargetPackages],
    )
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
        () => filterImportCandidates(resultCandidates, resultQuery, resultKind, resultElement),
        [resultCandidates, resultElement, resultKind, resultQuery],
    )
    const filteredRegistryListings = useMemo(
        () => filterRegistryListings(registryListings, resultQuery, resultKind, resultElement),
        [registryListings, resultElement, resultKind, resultQuery],
    )
    const allSelectableCandidateIds = useMemo(
        () => selectableImportCandidateIds(
            resultCandidates,
            installedPackageIds,
            optimisticInstalledPackageKeys,
            installTargetKey,
        ),
        [installTargetKey, installedPackageIds, optimisticInstalledPackageKeys, resultCandidates],
    )
    const selectableCandidateIds = useMemo(
        () => selectableImportCandidateIds(
            filteredCandidates,
            installedPackageIds,
            optimisticInstalledPackageKeys,
            installTargetKey,
        ),
        [filteredCandidates, installTargetKey, installedPackageIds, optimisticInstalledPackageKeys],
    )
    const selectedParsedCount = useMemo(
        () => countSelectedImportCandidates(manualSelectedCandidateIds, allSelectableCandidateIds),
        [allSelectableCandidateIds, manualSelectedCandidateIds],
    )
    const selectedVisibleCandidateCount = useMemo(
        () => countSelectedImportCandidates(manualSelectedCandidateIds, selectableCandidateIds),
        [manualSelectedCandidateIds, selectableCandidateIds],
    )

    const looksLikeGitHubSource = (source: string) => (
        source.includes('/')
        || source.includes('github.com')
        || source.includes('raw.githubusercontent.com')
        || source.startsWith('git@github.com:')
    )

    const rememberSearch = (source: string, format: ApmGitHubImportFormat) => {
        setSearchHistory((current) => {
            const next = addImportSearchHistoryEntry(current, source, format)
            writeImportSearchHistory(next)
            return next
        })
    }

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
        setResultElement('all')
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

    const handleSearch = async (
        sourceOverride?: string,
        formatOverride?: ApmGitHubImportFormat,
    ) => {
        const source = (sourceOverride ?? manualSource).trim()
        const format = formatOverride || manualFormat
        if (!source) {
            setManualPreviewError('Enter a registry search term or GitHub repository first.')
            return
        }
        if (sourceOverride !== undefined) {
            setManualSource(source)
        }
        if (formatOverride) {
            setManualFormat(formatOverride)
        }
        rememberSearch(source, format)
        setManualPreviewResponse(null)
        setManualPreviewRequest(null)
        setManualPreviewError(null)
        await Promise.all([
            searchRegistryCatalog(source),
            looksLikeGitHubSource(source)
                ? parseManualImportSource(source, format)
                : Promise.resolve(),
        ])
    }

    const handleCuratedSearch = async (source: string, format: ApmGitHubImportFormat) => {
        rememberSearch(source, format)
        await parseManualImportSource(source, format)
    }

    const handleHistorySearch = async (entry: ImportSearchHistoryEntry) => {
        await handleSearch(entry.source, entry.format)
    }

    const clearSearchHistory = () => {
        setSearchHistory([])
        writeImportSearchHistory([])
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
        const requestedCandidateIds = candidateIdsOverride || [...manualSelectedCandidateIds]
        const installableCandidateIds = new Set(allSelectableCandidateIds)
        const candidateIds = requestedCandidateIds.filter((candidateId) => installableCandidateIds.has(candidateId))
        if (candidateIds.length === 0) {
            setManualPreviewError('Select at least one detected package item.')
            return
        }
        const scopeAtSubmit = installScope
        const installTargetKeyAtSubmit = installTargetKey
        const candidatePackageIds = candidateIds
            .map((candidateId) => resultCandidates.find((candidate) => candidate.id === candidateId)?.packageId)
            .filter((packageId): packageId is string => Boolean(packageId))
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
                scope: scopeAtSubmit,
            })
            if (workingDir) {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['apm-packages'] }),
                    queryClient.invalidateQueries({ queryKey: [...queryKeys.agents, workingDir] }),
                ])
            } else {
                await queryClient.invalidateQueries({ queryKey: ['apm-packages'] })
            }
            setOptimisticInstalledPackageKeys((current) => {
                const next = new Set(current)
                for (const packageId of candidatePackageIds) {
                    next.add(candidateInstallKey(installTargetKeyAtSubmit, packageId))
                }
                return next
            })
            setManualSelectedCandidateIds((current) => (
                updateImportCandidateSelection(current, candidateIds, 'clear')
            ))
            showToast(`Imported ${result.packages.length} APM package${result.packages.length === 1 ? '' : 's'} to ${scopeLabel(scopeAtSubmit)}.`, 'success', {
                title: 'APM import complete',
                ...(scopeAtSubmit === 'workspace' ? {
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

    const selectVisibleCandidates = () => {
        setManualSelectedCandidateIds((current) => (
            updateImportCandidateSelection(current, selectableCandidateIds, 'select')
        ))
    }

    const clearVisibleCandidateSelection = () => {
        setManualSelectedCandidateIds((current) => (
            updateImportCandidateSelection(current, selectableCandidateIds, 'clear')
        ))
    }

    return (
        <>
            {active ? <ImportPageHeader /> : null}
            <main className={`import-page import-page--simple ${shouldShowResults ? 'has-results' : ''}`}>
                <ImportSearchPanel
                    source={manualSource}
                    format={manualFormat}
                    loading={manualPreviewLoading}
                    onSourceChange={setManualSource}
                    onFormatChange={setManualFormat}
                    onSearch={() => void handleSearch()}
                    onCuratedSearch={(source, format) => void handleCuratedSearch(source, format)}
                    searchHistory={searchHistory}
                    onHistorySearch={(entry) => void handleHistorySearch(entry)}
                    onClearHistory={clearSearchHistory}
                    installScope={installScope}
                    installTargetPath={installTargetPath}
                />

                {shouldShowResults ? (
                    <ImportResultsPanel
                        previewLoading={manualPreviewLoading}
                        previewError={manualPreviewError}
                        previewResponse={manualPreviewResponse}
                        registryListings={registryListings}
                        filteredRegistryListings={filteredRegistryListings}
                        registryLoading={registryLoading}
                        registryError={registryError}
                        registryPreviewingId={registryPreviewingId}
                        resultCandidates={resultCandidates}
                        filteredCandidates={filteredCandidates}
                        resultQuery={resultQuery}
                        resultKind={resultKind}
                        resultElement={resultElement}
                        installScope={installScope}
                        selectedCandidateIds={manualSelectedCandidateIds}
                        selectedCount={selectedParsedCount}
                        selectableCandidateCount={selectableCandidateIds.length}
                        selectedVisibleCandidateCount={selectedVisibleCandidateCount}
                        importing={manualImporting}
                        candidateInstallingId={candidateInstallingId}
                        installedPackageIds={installedPackageIds}
                        optimisticInstalledPackageKeys={optimisticInstalledPackageKeys}
                        installTargetKey={installTargetKey}
                        workspaceInstallDisabled={workspaceInstallDisabled}
                        onImportSelected={() => void handleManualImport()}
                        onImportCandidate={(candidateId) => void handleManualImport([candidateId])}
                        onToggleCandidate={toggleManualCandidate}
                        onSelectAllCandidates={selectVisibleCandidates}
                        onClearCandidateSelection={clearVisibleCandidateSelection}
                        onOpenDetails={setAssetDetailRequest}
                        onPreviewRegistryListing={(listing) => void previewRegistryListing(listing)}
                        onQueryChange={setResultQuery}
                        onKindChange={setResultKind}
                        onElementChange={setResultElement}
                    />
                ) : null}
            </main>
            <ImportAssetDetailsModal
                request={assetDetailRequest}
                onClose={() => setAssetDetailRequest(null)}
            />
        </>
    )
}
