import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { useStudioStore } from '../../store'
import type { GitHubDanceSyncStatus } from '../../../shared/asset-contracts'
import type { InstalledDanceLocator } from '../../../shared/roster-contracts'
import {
    ALL_MODEL_PROVIDER_FILTER,
    buildRuntimeModelProviderTabs,
} from '../../lib/runtime-models'
import { showToast } from '../../lib/toast'
import { slugifyAssetName } from '../../lib/performers'
import { buildDraftDeleteCascade, buildInstalledDeleteCascade } from '../../store/cascade-cleanup'
import { removeMarkdownEditorsByDraftIds } from '../../store/workspace-helpers'
import {
    useApplyDanceUpdates,
    useAssetKind,
    useAssets,
    useDanceUpdateChecks,
    useApmPackages,
    useRosterAuthUser,
    useModels,
    queryKeys,
    useReimportDanceSource,
    useRegistrySearch,
} from '../../hooks/queries'
import { createPerformerNode } from '../../lib/performers'
import { useMcpCatalog } from './useMcpCatalog'
import type { AssetPanelAction, AssetPanelAsset, LibraryAsset } from './asset-panel-types'
import type {
    AssetScope,
    InstalledKind,
    LocalSection,
    ModelProviderFilter,
    RegistryKind,
    RuntimeKind,
    SourceFilter,
} from './asset-library-utils'
import {
    buildAuthoringPayloadFromAsset,
    buildDraftAssetCards,
    buildMcpHaystack,
    buildRegistryGroups,
    filterInstalledAssets,
    getAssetSelectionKey,
    getAssetUrn,
    groupModels,
    isInstalledAssetKind,
    placeholderForLocalSection,
    resolveSelectedAssetSnapshot,
} from './asset-library-utils'

function getInstalledDanceLocator(asset: AssetPanelAsset | LibraryAsset | null | undefined): InstalledDanceLocator | null {
    if (!asset || asset.kind !== 'dance' || !asset.urn || (asset.source !== 'global' && asset.source !== 'stage')) {
        return null
    }
    return {
        urn: asset.urn,
        scope: asset.source,
    }
}

function danceSyncKey(locator: InstalledDanceLocator) {
    return `${locator.scope}:${locator.urn}`
}

function syncLabelForState(state: GitHubDanceSyncStatus['state']) {
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
    }
}

function mergeDanceSyncIntoAsset(asset: LibraryAsset, syncByKey: Record<string, GitHubDanceSyncStatus>) {
    const locator = getInstalledDanceLocator(asset)
    if (!locator || asset.kind !== 'dance' || !asset.github) {
        return asset
    }

    const sync = syncByKey[danceSyncKey(locator)]
    if (!sync) {
        return asset
    }

    return {
        ...asset,
        github: {
            ...asset.github,
            sync,
        },
    }
}

export function useAssetLibraryController() {
    const workingDir = useStudioStore((state) => state.workingDir)
    const performers = useStudioStore((state) => state.performers)
    const drafts = useStudioStore((state) => state.drafts)
    const addPerformer = useStudioStore((state) => state.addPerformer)
    const createMarkdownEditor = useStudioStore((state) => state.createMarkdownEditor)
    const openDraftEditor = useStudioStore((state) => state.openDraftEditor)
    const selectPerformer = useStudioStore((state) => state.selectPerformer)
    const setActiveChatPerformer = useStudioStore((state) => state.setActiveChatPerformer)
    const addAct = useStudioStore((state) => state.addAct)

    const [filter, setFilter] = useState('')
    const [scope, setScope] = useState<AssetScope>('local')
    const [localSection, setLocalSection] = useState<LocalSection>('installed')
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
    const [installedKind, setInstalledKind] = useState<InstalledKind>('performer')
    const [runtimeKind, setRuntimeKind] = useState<RuntimeKind>('models')
    const [registryKind, setRegistryKind] = useState<RegistryKind>('all')
    const [modelProviderFilter, setModelProviderFilter] = useState<ModelProviderFilter>(ALL_MODEL_PROVIDER_FILTER)

    const [registryQuery, setRegistryQuery] = useState('')
    const [searchEnabled, setSearchEnabled] = useState(false)
    const [selectedAsset, setSelectedAsset] = useState<AssetPanelAsset | null>(null)
    const [expandedModelProviders, setExpandedModelProviders] = useState<Record<string, boolean>>({})
    const [authoringHint, setAuthoringHint] = useState<string | null>(null)
    const [detailActionStatus, setDetailActionStatus] = useState<string | null>(null)
    const [detailActionLoading, setDetailActionLoading] = useState<AssetPanelAction | null>(null)

    const { data: authUser } = useRosterAuthUser()
    const queryClient = useQueryClient()

    const showInstalledAssets = scope === 'local' && localSection === 'installed'
    const showModels = scope === 'local' && localSection === 'runtime' && runtimeKind === 'models'
    const showMcps = scope === 'local' && localSection === 'runtime' && runtimeKind === 'mcps'

    const { data: installedAssetResults = [], isLoading: assetsLoading } = useAssetKind(installedKind, showInstalledAssets)
    const installedAssets = installedAssetResults as LibraryAsset[]
    const { data: assetInventoryResults = [] } = useAssets(scope === 'registry')
    const assetInventory = assetInventoryResults as LibraryAsset[]
    const { data: models = [] } = useModels(showModels)
    const { data: registryResults = [], isLoading: registryLoading, error: registryError } = useRegistrySearch(
        registryQuery,
        registryKind,
        searchEnabled,
    )
    const { data: apmPackages = [] } = useApmPackages(scope === 'registry')

    const mcp = useMcpCatalog(workingDir, showMcps)
    const mcpServers = useMemo(() => mcp.mcpServers ?? [], [mcp.mcpServers])
    const {
        mcpEntries,
        mcpCatalogStatus,
        mcpCatalogSaving,
        runtimeReloadPending,
        pendingMcpAuthName,
        mcpImpactDialog,
        mcpImpactSaving,
        createMcpEntryDraft,
        saveMcpEntry,
        deleteMcpEntry,
        connectMcpServer,
        startMcpAuthFlow,
        clearMcpAuth,
        confirmMcpImpactSave,
        cancelMcpImpactSave,
    } = mcp

    const draftAssetCards = useMemo<LibraryAsset[]>(
        () => buildDraftAssetCards(drafts, installedKind),
        [drafts, installedKind],
    )

    const applyDanceUpdatesMutation = useApplyDanceUpdates()
    const reimportDanceSourceMutation = useReimportDanceSource()
    const [danceSyncByKey, setDanceSyncByKey] = useState<Record<string, GitHubDanceSyncStatus>>({})

    const installedDanceLocators = useMemo(
        () => installedAssets
            .filter((asset) => asset.kind === 'dance' && asset.github?.source === 'github')
            .map((asset) => getInstalledDanceLocator(asset))
            .filter((asset): asset is InstalledDanceLocator => !!asset),
        [installedAssets],
    )

    const { data: autoDanceSyncResults = [] } = useDanceUpdateChecks(
        installedDanceLocators,
        false,
        showInstalledAssets && installedKind === 'dance' && installedDanceLocators.length > 0,
    )

    useEffect(() => {
        if (autoDanceSyncResults.length === 0) return
        setDanceSyncByKey((current) => {
            const next = { ...current }
            for (const result of autoDanceSyncResults) {
                next[danceSyncKey(result)] = result.sync
            }
            return next
        })
    }, [autoDanceSyncResults])

    const visibleInstalledAssets = useMemo(
        () => [...draftAssetCards, ...installedAssets.map((asset) => mergeDanceSyncIntoAsset(asset, danceSyncByKey))],
        [danceSyncByKey, draftAssetCards, installedAssets],
    )

    const isLibraryAsset = (asset: AssetPanelAsset | null | undefined): asset is LibraryAsset =>
        !!asset && isInstalledAssetKind(asset.kind)

    useEffect(() => {
        setSelectedAsset(null)
    }, [scope, localSection, installedKind, runtimeKind, registryKind])

    useEffect(() => {
        setAuthoringHint(null)
    }, [scope, localSection, installedKind])

    useEffect(() => {
        setExpandedModelProviders({})
    }, [filter, modelProviderFilter])

    const modelProviderTabs = useMemo(
        () => buildRuntimeModelProviderTabs(models, { connectedOnly: true }),
        [models],
    )

    useEffect(() => {
        if (modelProviderTabs.some((tab) => tab.key === modelProviderFilter)) {
            return
        }
        setModelProviderFilter(ALL_MODEL_PROVIDER_FILTER)
    }, [modelProviderFilter, modelProviderTabs])

    const installedUrns = useMemo(
        () => new Set(assetInventory.map((asset) => getAssetUrn(asset)).filter(Boolean) as string[]),
        [assetInventory],
    )
    const importedRegistryListingIds = useMemo(
        () => new Set(apmPackages
            .map((summary) => summary.derivedFrom)
            .filter((source): source is string => typeof source === 'string' && source.startsWith('registry:'))
            .map((source) => source.slice('registry:'.length))),
        [apmPackages],
    )

    const triggerSearch = () => {
        if (registryQuery.trim()) {
            setSearchEnabled(true)
        }
    }

    const handleQueryChange = (value: string) => {
        setRegistryQuery(value)
        setSearchEnabled(false)
    }

    const handleRegistryInstall = async (urn: string) => {
        const item = registryResults.find((entry) => getAssetUrn(entry) === urn)
        const listingId = item?.registryListing?.id
        if (!listingId) {
            throw new Error('Registry listing is missing its source reference.')
        }

        const response = await api.explore.importListing(listingId)
        const packageResponse = await api.apm.readPackage(response.packageId)
        const agent = packageResponse.manifest['x-8pm']?.agent
        if (agent) {
            useStudioStore.setState((state) => {
                const existing = state.performers.find((performer) => performer.id === agent.performerId)
                if (existing) {
                    return {
                        selectedPerformerId: existing.id,
                        selectedPerformerSessionId: null,
                        selectedMarkdownEditorId: null,
                        activeChatPerformerId: existing.id,
                        canvasRevealTarget: {
                            id: existing.id,
                            type: 'performer',
                            nonce: (state.canvasRevealTarget?.nonce || 0) + 1,
                        },
                    }
                }

                const center = state.canvasCenter || { x: 0, y: 0 }
                const node = createPerformerNode({
                    id: agent.performerId,
                    name: agent.performerName,
                    x: center.x,
                    y: center.y,
                    model: agent.model,
                    modelVariant: agent.modelVariant || null,
                    inlineInstruction: agent.inlineInstruction || null,
                    talRef: agent.talRef || null,
                    danceRefs: agent.danceRefs || [],
                    mcpServerNames: agent.mcpServerNames || [],
                    agentId: agent.agentId || null,
                    planMode: agent.planMode === true,
                    meta: {
                        derivedFrom: agent.derivedFrom || `registry:${listingId}`,
                        authoring: {
                            slug: item.slug || item.registryListing?.slug,
                            description: item.description,
                            tags: item.tags,
                        },
                    },
                })
                return {
                    performers: [...state.performers, node],
                    editingTarget: null,
                    selectedPerformerId: node.id,
                    selectedPerformerSessionId: null,
                    selectedMarkdownEditorId: null,
                    activeChatPerformerId: node.id,
                    canvasRevealTarget: {
                        id: node.id,
                        type: 'performer',
                        nonce: (state.canvasRevealTarget?.nonce || 0) + 1,
                    },
                    inspectorFocus: null,
                    workspaceDirty: true,
                }
            })
            useStudioStore.getState().recordStudioChange({ kind: 'performer', performerIds: [agent.performerId] })
        }
        await queryClient.invalidateQueries({ queryKey: queryKeys.apmPackages(workingDir) })
        return response
    }

    const createNewPerformerDraftEntry = (kind: 'tal' | 'dance') => {
        createMarkdownEditor(kind)
        setAuthoringHint(`Opened a new ${kind} editor on the canvas.`)
    }

    const createNewPerformer = () => {
        const beforeIds = new Set(performers.map((performer) => performer.id))
        addPerformer(`Agent ${performers.filter((performer) => performer.scope === 'shared').length + 1}`)
        const created = useStudioStore.getState().performers.find((performer) => !beforeIds.has(performer.id))
        if (created) {
            selectPerformer(created.id)
            setActiveChatPerformer(created.id)
            setAuthoringHint(`Created ${created.name}. Configure it from the inspector, then save it locally when ready.`)
        }
    }

    const createNewAct = () => {
        const acts = useStudioStore.getState().acts
        const name = `Team ${acts.length + 1}`
        addAct(name)
        setAuthoringHint(`Created ${name}. Configure it from the inspector.`)
    }

    const invalidateInstalledAssetQueries = async (kind: InstalledKind) => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.assetKind(workingDir, kind) }),
        ])
    }

    const mergeDanceSyncResults = (results: Array<InstalledDanceLocator & { sync: GitHubDanceSyncStatus }>) => {
        setDanceSyncByKey((current) => {
            const next = { ...current }
            for (const result of results) {
                next[danceSyncKey(result)] = result.sync
            }
            return next
        })
    }

    const recordInstalledDanceChange = () => {
        useStudioStore.getState().recordStudioChange({
            kind: 'installed_asset',
            workspaceWide: true,
        })
    }

    const handleCheckDanceUpdates = async (asset: AssetPanelAsset, includeRepoDrift = false) => {
        const locator = getInstalledDanceLocator(asset)
        if (!locator) return

        try {
            setDetailActionLoading(includeRepoDrift ? 'dance-check-repo' : 'dance-check-updates')
            setDetailActionStatus(null)
            const response = await api.roster.checkDanceUpdates({
                assets: [locator],
                includeRepoDrift,
            })
            mergeDanceSyncResults(response.results)
            const sync = response.results[0]?.sync
            if (sync) {
                setDetailActionStatus(sync.message || syncLabelForState(sync.state))
            }
        } catch (error: unknown) {
            setDetailActionStatus(error instanceof Error ? error.message : 'Skill update check failed.')
        } finally {
            setDetailActionLoading(null)
        }
    }

    const handleUpdateDance = async (asset: AssetPanelAsset) => {
        const locator = getInstalledDanceLocator(asset)
        if (!locator) return

        try {
            setDetailActionLoading('dance-update')
            setDetailActionStatus(null)
            const response = await applyDanceUpdatesMutation.mutateAsync([locator])
            mergeDanceSyncResults(response.updated)
            const skippedWithSync = response.skipped.flatMap((entry) => (
                entry.sync ? [{ urn: entry.urn, scope: entry.scope, sync: entry.sync }] : []
            ))
            mergeDanceSyncResults(skippedWithSync)

            if (response.updated.length > 0) {
                recordInstalledDanceChange()
                await invalidateInstalledAssetQueries('dance')
                setDetailActionStatus(`Updated ${response.updated.length} Skill${response.updated.length > 1 ? 's' : ''} from GitHub.`)
                return
            }

            setDetailActionStatus(response.skipped[0]?.reason || 'No GitHub Skill assets were updated.')
        } catch (error: unknown) {
            setDetailActionStatus(error instanceof Error ? error.message : 'Skill update failed.')
        } finally {
            setDetailActionLoading(null)
        }
    }

    const handleReimportDanceSource = async (asset: AssetPanelAsset) => {
        const locator = getInstalledDanceLocator(asset)
        if (!locator) return

        try {
            setDetailActionLoading('dance-reimport')
            setDetailActionStatus(null)
            const response = await reimportDanceSourceMutation.mutateAsync(locator)
            recordInstalledDanceChange()
            await invalidateInstalledAssetQueries('dance')
            setDetailActionStatus(response.installed.length > 0
                ? `Imported ${response.installed.length} newly available Skill${response.installed.length > 1 ? 's' : ''}.`
                : 'No newly available GitHub Skills were found for this source.')
        } catch (error: unknown) {
            setDetailActionStatus(error instanceof Error ? error.message : 'Skill re-import failed.')
        } finally {
            setDetailActionLoading(null)
        }
    }

    const handlePinnedAssetAction = async (asset: AssetPanelAsset, action: 'save-local') => {
        if (!isLibraryAsset(asset)) return

        try {
            setDetailActionLoading(action)
            setDetailActionStatus(null)

            const payload = buildAuthoringPayloadFromAsset(asset)
            const targetSlug = asset.slug || slugifyAssetName(asset.name)

            if (!authUser?.username) {
                throw new Error('Sign in to 8PM Studio first to save a local fork under your namespace.')
            }
            const result = await api.roster.saveLocalAsset(asset.kind, targetSlug, payload, authUser.username)
            await invalidateInstalledAssetQueries(asset.kind)

            if (asset.source === 'draft' && asset.draftId) {
                const draftId = asset.draftId
                api.drafts.delete(asset.kind, draftId).catch(() => {})
                useStudioStore.setState((state) => {
                    const next = { ...state.drafts }
                    delete next[draftId]
                    const cascade = buildDraftDeleteCascade(asset.kind, draftId, state.performers, state.acts)
                    return {
                        drafts: next,
                        markdownEditors: removeMarkdownEditorsByDraftIds(state.markdownEditors, [draftId]),
                        ...cascade,
                    }
                })
            }

            setDetailActionStatus(result.existed
                ? `Updated local ${asset.kind} asset at ${result.urn}.`
                : `Saved local ${asset.kind} asset at ${result.urn}.`)
        } catch (error: unknown) {
            setDetailActionStatus(error instanceof Error ? error.message : 'Asset action failed.')
        } finally {
            setDetailActionLoading(null)
        }
    }

    const [uninstallPlan, setUninstallPlan] = useState<{
        asset: AssetPanelAsset
        actionName?: 'Uninstall' | 'Delete'
        target: { urn?: string; draftId?: string; kind: string; name: string; source: string; reason: string }
        dependents: Array<{ urn?: string; draftId?: string; kind: string; name: string; source: string; reason: string }>
    } | null>(null)
    const [uninstallLoading, setUninstallLoading] = useState(false)

    const handleUninstallAsset = async (asset: AssetPanelAsset) => {
        if (!isLibraryAsset(asset) || !asset.urn) return
        try {
            const plan = await api.roster.previewUninstall(asset.kind, asset.urn)
            // Always show confirmation dialog, even if no dependents
            setUninstallPlan({ asset, actionName: 'Uninstall', ...plan })
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to check dependencies', 'error', {
                title: 'Uninstall preview failed',
                dedupeKey: `uninstall-error:${asset.urn}`,
            })
        }
    }

    const executeUninstall = async (asset: AssetPanelAsset, cascade: boolean) => {
        if (!isLibraryAsset(asset) || !asset.urn) return
        try {
            setUninstallLoading(true)
            const result = await api.roster.uninstallAsset(asset.kind, asset.urn, cascade)
            // Apply canvas cascade for all deleted URNs
            useStudioStore.setState((state) => {
                const newState: Partial<ReturnType<typeof useStudioStore.getState>> = {}
                for (const deletedUrn of result.deletedUrns) {
                    const kind = deletedUrn.split('/')[0]
                    if (!isInstalledAssetKind(kind)) {
                        continue
                    }
                    const patch = buildInstalledDeleteCascade(kind, deletedUrn, state.performers, state.acts)
                    if (patch.performers) newState.performers = patch.performers
                    if (patch.acts) newState.acts = patch.acts
                    if (patch.workspaceDirty) newState.workspaceDirty = true
                }
                return newState
            })
            useStudioStore.getState().recordStudioChange({ kind: 'draft', workspaceWide: true })
            await invalidateInstalledAssetQueries(asset.kind)
            setSelectedAsset(null)
            setUninstallPlan(null)
            const count = cascade ? 'all related assets' : `"${asset.name || asset.urn}"`
            showToast(`Uninstalled ${count}`, 'success', {
                title: 'Asset uninstalled',
                dedupeKey: `uninstall:${asset.urn}`,
            })
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to uninstall asset', 'error', {
                title: 'Uninstall failed',
                dedupeKey: `uninstall-error:${asset.urn}`,
            })
        } finally {
            setUninstallLoading(false)
        }
    }

    const confirmUninstall = () => {
        if (!uninstallPlan) return
        const hasDependents = uninstallPlan.dependents.length > 0
        if (uninstallPlan.actionName === 'Delete') {
            executeDeleteDraft(uninstallPlan.asset, hasDependents)
        } else {
            executeUninstall(uninstallPlan.asset, hasDependents)
        }
    }

    const cancelUninstall = () => {
        setUninstallPlan(null)
    }

    const handleDeleteDraft = async (asset: AssetPanelAsset) => {
        if (!isLibraryAsset(asset) || !asset.draftId) return
        try {
            const plan = await api.drafts.previewDelete(asset.kind, asset.draftId)
            setUninstallPlan({ asset, actionName: 'Delete', ...plan })
        } catch (error: unknown) {
            showToast(error instanceof Error ? error.message : 'Failed to check dependencies', 'error', {
                title: 'Delete preview failed',
                dedupeKey: `draft:delete-error:${asset.draftId}`,
            })
        }
    }

    const handleEditDraft = (asset: AssetPanelAsset) => {
        if (!isLibraryAsset(asset) || !asset.draftId) return
        openDraftEditor(asset.draftId)
    }

    const executeDeleteDraft = async (asset: AssetPanelAsset, cascade: boolean) => {
        if (!isLibraryAsset(asset) || !asset.draftId) return
        try {
            setUninstallLoading(true)
            const result = await api.drafts.delete(asset.kind, asset.draftId, cascade)

            useStudioStore.setState((state) => {
                const next = { ...state.drafts }
                const newState: Partial<ReturnType<typeof useStudioStore.getState>> = { drafts: next }

                // Remove all deleted drafts from store
                for (const deletedId of result.deletedIds) {
                    delete next[deletedId]
                }

                // Apply canvas cascade for each deleted draft across all asset kinds
                for (const deletedId of result.deletedIds) {
                    for (const maybeKind of ['tal', 'dance', 'performer', 'act']) {
                        const patch = buildDraftDeleteCascade(maybeKind, deletedId, newState.performers || state.performers, newState.acts || state.acts)
                        if (patch.performers) newState.performers = patch.performers
                        if (patch.acts) newState.acts = patch.acts
                        if (patch.workspaceDirty) newState.workspaceDirty = true
                    }
                }

                newState.markdownEditors = removeMarkdownEditorsByDraftIds(
                    state.markdownEditors,
                    result.deletedIds,
                )

                return newState
            })
            useStudioStore.getState().recordStudioChange({
                kind: 'draft',
                draftIds: result.deletedIds,
                workspaceWide: true,
            })

            setSelectedAsset(null)
            setUninstallPlan(null)
            const count = cascade ? 'all related drafts' : `"${asset.name || asset.draftId}"`
            showToast(`Deleted ${count}`, 'success', {
                title: 'Draft deleted',
                dedupeKey: `draft:delete:${asset.draftId}`,
            })
        } catch (error: unknown) {
            showToast(error instanceof Error ? error.message : 'Failed to delete draft', 'error', {
                title: 'Delete failed',
                dedupeKey: `draft:delete-error:${asset.draftId}`,
            })
        } finally {
            setUninstallLoading(false)
        }
    }

    const queryText = filter.trim().toLowerCase()
    const filteredInstalledAssets = useMemo(
        () => filterInstalledAssets(visibleInstalledAssets, sourceFilter, queryText),
        [visibleInstalledAssets, queryText, sourceFilter],
    )
    const groupedModels = useMemo(
        () => groupModels(models, queryText, modelProviderFilter),
        [modelProviderFilter, models, queryText],
    )
    const filteredMcps = useMemo(
        () => mcpServers.filter((mcpServer) => !queryText || buildMcpHaystack(mcpServer).includes(queryText)),
        [mcpServers, queryText],
    )
    const registryGroups = useMemo(
        () => buildRegistryGroups(registryResults),
        [registryResults],
    )

    const resolvedSelectedAsset = useMemo(
        () => resolveSelectedAssetSnapshot(selectedAsset, {
            installedAssets: visibleInstalledAssets,
            registryAssets: registryResults as LibraryAsset[],
            models,
            mcps: mcpServers,
        }),
        [mcpServers, models, registryResults, selectedAsset, visibleInstalledAssets],
    )

    const selectedAssetKey = resolvedSelectedAsset ? getAssetSelectionKey(resolvedSelectedAsset) : null
    useEffect(() => {
        setDetailActionStatus(null)
        setDetailActionLoading(null)
    }, [selectedAssetKey])

    const selectedInstalled = useMemo(() => {
        if (!resolvedSelectedAsset) return false
        if (resolvedSelectedAsset.source === 'registry') {
            const listingId = resolvedSelectedAsset.registryListing?.id
            return !!listingId && importedRegistryListingIds.has(listingId)
        }
        if (resolvedSelectedAsset.source && resolvedSelectedAsset.urn) return true
        const urn = getAssetUrn(resolvedSelectedAsset)
        return urn ? installedUrns.has(urn) : false
    }, [importedRegistryListingIds, installedUrns, resolvedSelectedAsset])

    const localPlaceholder = placeholderForLocalSection(localSection, runtimeKind)

    return {
        scope,
        setScope,
        localSection,
        setLocalSection,
        installedKind,
        setInstalledKind,
        runtimeKind,
        setRuntimeKind,
        sourceFilter,
        setSourceFilter,
        modelProviderFilter,
        setModelProviderFilter,
        filter,
        setFilter,
        localPlaceholder,
        authoringHint,
        assetsLoading,
        filteredInstalledAssets,
        groupedModels,
        filteredMcps,
        liveMcpServers: mcpServers,
        selectedAsset: resolvedSelectedAsset,
        setSelectedAsset,
        selectedAssetKey,
        selectedInstalled,
        authUser,
        detailActionStatus,
        detailActionLoading,
        createNewPerformer,
        createNewAct,
        createNewPerformerDraftEntry,
        showInstalledAssets,
        showModels,
        showMcps,
        mcpEntries,
        mcpCatalogStatus,
        mcpCatalogSaving,
        runtimeReloadPending,
        pendingMcpAuthName,
        mcpImpactDialog,
        mcpImpactSaving,
        createMcpEntryDraft,
        saveMcpEntry,
        deleteMcpEntry,
        connectMcpServer,
        startMcpAuthFlow,
        clearMcpAuth,
        confirmMcpImpactSave,
        cancelMcpImpactSave,
        expandedModelProviders,
        setExpandedModelProviders,
        modelProviderTabs,
        registryQuery,
        registryLoading,
        registryResults,
        registryError,
        registryKind,
        setRegistryKind,
        registryGroups,
        installedUrns,
        importedRegistryListingIds,
        triggerSearch,
        handleQueryChange,
        handleRegistryInstall,
        handlePinnedAssetAction,
        handleCheckDanceUpdates,
        handleUpdateDance,
        handleReimportDanceSource,
        handleDeleteDraft,
        handleEditDraft,
        handleUninstallAsset,
        uninstallPlan,
        uninstallLoading,
        confirmUninstall,
        cancelUninstall,
        setSearchEnabled,
    }
}
