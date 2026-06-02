import { useCallback, useMemo, useState, type SetStateAction } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStudioStore } from '../../store'
import {
    ALL_MODEL_PROVIDER_FILTER,
    buildRuntimeModelProviderTabs,
} from '../../lib/runtime-models'
import { useApmPackages } from '../../hooks/queries/apm'
import { useModels } from '../../hooks/queries/opencode'
import { useMcpCatalog } from './useMcpCatalog'
import type { PackagePanelItem, ScopedApmPackageSummary } from './package-panel-types'
import {
    filterApmPackages,
    packageMatchesPrimitiveSection,
    scopeApmPackages,
} from './package-library-packages'
import type {
    LocalSection,
    ModelProviderFilter,
    PackagePrimitiveSection,
    SourceFilter,
} from './package-library-utils'
import {
    buildMcpHaystack,
    getPackagePanelItemKey,
    groupModels,
    placeholderForLocalSection,
    placeholderForPrimitiveSection,
    resolveSelectedPackagePanelItem,
} from './package-library-utils'

type KeyedWorkingDirState<T> = {
    workingDir: string
    value: T
}

type SelectedApmPackageIdentity = Pick<ScopedApmPackageSummary, 'scope' | 'packageId'>

export function usePackageLibraryController() {
    const queryClient = useQueryClient()
    const workingDir = useStudioStore((state) => state.workingDir)

    const [filter, setFilter] = useState('')
    const [localSection, setLocalSection] = useState<LocalSection>('packages')
    const [primitiveSection, setPrimitiveSectionState] = useState<PackagePrimitiveSection>('agents')
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
    const [modelProviderFilter, setModelProviderFilter] = useState<ModelProviderFilter>(ALL_MODEL_PROVIDER_FILTER)
    const [selectedItemState, setSelectedItemState] = useState<KeyedWorkingDirState<PackagePanelItem | null>>(() => ({
        workingDir,
        value: null,
    }))
    const [selectedApmPackageState, setSelectedApmPackageState] = useState<KeyedWorkingDirState<SelectedApmPackageIdentity | null>>(() => ({
        workingDir,
        value: null,
    }))
    const [expandedModelProvidersState, setExpandedModelProvidersState] = useState<KeyedWorkingDirState<Record<string, boolean>>>(() => ({
        workingDir,
        value: {},
    }))

    const showApmPackages = localSection === 'packages'
    const showModels = localSection === 'models'
    const showMcps = localSection === 'mcp'

    const selectedItem = selectedItemState.workingDir === workingDir ? selectedItemState.value : null
    const selectedApmPackageIdentity = selectedApmPackageState.workingDir === workingDir
        ? selectedApmPackageState.value
        : null
    const expandedModelProviders = expandedModelProvidersState.workingDir === workingDir
        ? expandedModelProvidersState.value
        : {}
    const authoringHint = null

    const { data: workspaceApmPackages = [], isLoading: workspaceApmPackagesLoading } = useApmPackages(
        showApmPackages,
        'workspace',
    )
    const { data: userApmPackages = [], isLoading: userApmPackagesLoading } = useApmPackages(
        showApmPackages,
        'user',
    )
    const { data: models = [] } = useModels(showModels)

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

    const modelProviderTabs = useMemo(
        () => buildRuntimeModelProviderTabs(models, { connectedOnly: true }),
        [models],
    )

    const effectiveSourceFilter = localSection === 'packages' ? sourceFilter : 'all'
    const effectiveModelProviderFilter = modelProviderTabs.some((tab) => tab.key === modelProviderFilter)
        ? modelProviderFilter
        : ALL_MODEL_PROVIDER_FILTER

    const setSelectedItem = useCallback((item: PackagePanelItem | null) => {
        setSelectedItemState({ workingDir, value: item })
    }, [workingDir])

    const setSelectedApmPackage = useCallback((pkg: ScopedApmPackageSummary | null) => {
        setSelectedApmPackageState({
            workingDir,
            value: pkg ? { scope: pkg.scope, packageId: pkg.packageId } : null,
        })
    }, [workingDir])

    const setExpandedModelProviders = useCallback((value: SetStateAction<Record<string, boolean>>) => {
        setExpandedModelProvidersState((current) => {
            const currentValue = current.workingDir === workingDir ? current.value : {}
            return {
                workingDir,
                value: typeof value === 'function' ? value(currentValue) : value,
            }
        })
    }, [workingDir])

    const selectLocalSection = useCallback((value: LocalSection) => {
        setLocalSection(value)
        setSelectedItem(null)
        setSelectedApmPackage(null)
        if (value !== 'packages') {
            setSourceFilter('all')
        }
    }, [setSelectedApmPackage, setSelectedItem])

    const selectPrimitiveSection = useCallback((value: PackagePrimitiveSection) => {
        setPrimitiveSectionState(value)
        setLocalSection('packages')
        setSelectedItem(null)
        setSelectedApmPackage(null)
    }, [setSelectedApmPackage, setSelectedItem])

    const updateFilter = useCallback((value: string) => {
        setFilter(value)
        setExpandedModelProviders({})
    }, [setExpandedModelProviders])

    const selectModelProviderFilter = useCallback((value: ModelProviderFilter) => {
        setModelProviderFilter(value)
        setExpandedModelProviders({})
    }, [setExpandedModelProviders])

    const scopedApmPackages = useMemo(
        () => scopeApmPackages(workspaceApmPackages, userApmPackages),
        [userApmPackages, workspaceApmPackages],
    )

    const selectedApmPackage = useMemo(() => {
        if (!selectedApmPackageIdentity) return null
        return scopedApmPackages.find((pkg) => (
            pkg.scope === selectedApmPackageIdentity.scope
            && pkg.packageId === selectedApmPackageIdentity.packageId
        )) || null
    }, [scopedApmPackages, selectedApmPackageIdentity])

    const queryText = filter.trim().toLowerCase()
    const filteredApmPackages = useMemo(
        () => filterApmPackages(scopedApmPackages, effectiveSourceFilter, queryText)
            .filter((pkg) => packageMatchesPrimitiveSection(pkg, primitiveSection)),
        [effectiveSourceFilter, primitiveSection, queryText, scopedApmPackages],
    )
    const groupedModels = useMemo(
        () => groupModels(models, queryText, effectiveModelProviderFilter),
        [effectiveModelProviderFilter, models, queryText],
    )
    const filteredMcps = useMemo(
        () => mcpServers.filter((mcpServer) => !queryText || buildMcpHaystack(mcpServer).includes(queryText)),
        [mcpServers, queryText],
    )

    const resolvedSelectedItem = useMemo(
        () => resolveSelectedPackagePanelItem(selectedItem, {
            models,
            mcps: mcpServers,
        }),
        [mcpServers, models, selectedItem],
    )

    const selectedItemKey = resolvedSelectedItem ? getPackagePanelItemKey(resolvedSelectedItem) : null
    const localPlaceholder = showApmPackages
        ? placeholderForPrimitiveSection(primitiveSection)
        : placeholderForLocalSection(localSection)

    const refreshApmPackages = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: ['apm-packages'] })
    }, [queryClient])

    return {
        localSection,
        setLocalSection: selectLocalSection,
        primitiveSection,
        setPrimitiveSection: selectPrimitiveSection,
        sourceFilter: effectiveSourceFilter,
        setSourceFilter,
        modelProviderFilter: effectiveModelProviderFilter,
        setModelProviderFilter: selectModelProviderFilter,
        filter,
        setFilter: updateFilter,
        localPlaceholder,
        authoringHint,
        apmPackagesLoading: workspaceApmPackagesLoading || userApmPackagesLoading,
        refreshApmPackages,
        filteredApmPackages,
        groupedModels,
        filteredMcps,
        liveMcpServers: mcpServers,
        selectedItem: resolvedSelectedItem,
        setSelectedItem,
        selectedItemKey,
        selectedApmPackage,
        setSelectedApmPackage,
        showModels,
        showMcps,
        mcpEntries,
        mcpCatalogStatus,
        mcpCatalogSaving,
        runtimeReloadPending,
        pendingMcpAuthName,
        createMcpEntryDraft,
        saveMcpEntry,
        deleteMcpEntry,
        connectMcpServer,
        startMcpAuthFlow,
        clearMcpAuth,
        expandedModelProviders,
        setExpandedModelProviders,
        modelProviderTabs,
        mcpImpactDialog,
        mcpImpactSaving,
        confirmMcpImpactSave,
        cancelMcpImpactSave,
    }
}
