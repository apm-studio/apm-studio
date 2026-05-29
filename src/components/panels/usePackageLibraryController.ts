import { useCallback, useMemo, useState } from 'react'
import { useStudioStore } from '../../store'
import {
    ALL_MODEL_PROVIDER_FILTER,
    buildRuntimeModelProviderTabs,
} from '../../lib/runtime-models'
import { useApmPackages } from '../../hooks/queries/apm'
import { useModels } from '../../hooks/queries/opencode'
import { useMcpCatalog } from './useMcpCatalog'
import type { PackagePanelItem } from './package-panel-types'
import {
    filterApmPackages,
    scopeApmPackages,
} from './package-library-packages'
import type {
    LocalSection,
    ModelProviderFilter,
    SourceFilter,
} from './package-library-utils'
import {
    buildMcpHaystack,
    getPackagePanelItemKey,
    groupModels,
    placeholderForLocalSection,
    resolveSelectedPackagePanelItem,
} from './package-library-utils'

export function usePackageLibraryController() {
    const workingDir = useStudioStore((state) => state.workingDir)

    const [filter, setFilter] = useState('')
    const [localSection, setLocalSection] = useState<LocalSection>('packages')
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
    const [modelProviderFilter, setModelProviderFilter] = useState<ModelProviderFilter>(ALL_MODEL_PROVIDER_FILTER)
    const [selectedItem, setSelectedItem] = useState<PackagePanelItem | null>(null)
    const [expandedModelProviders, setExpandedModelProviders] = useState<Record<string, boolean>>({})
    const [authoringHint, setAuthoringHint] = useState<string | null>(null)

    const showApmPackages = localSection === 'packages'
    const showModels = localSection === 'models'
    const showMcps = localSection === 'mcp'

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

    const selectLocalSection = useCallback((value: LocalSection) => {
        setLocalSection(value)
        setSelectedItem(null)
        setAuthoringHint(null)
        if (value !== 'packages') {
            setSourceFilter('all')
        }
    }, [])

    const updateFilter = useCallback((value: string) => {
        setFilter(value)
        setExpandedModelProviders({})
    }, [])

    const selectModelProviderFilter = useCallback((value: ModelProviderFilter) => {
        setModelProviderFilter(value)
        setExpandedModelProviders({})
    }, [])

    const scopedApmPackages = useMemo(
        () => scopeApmPackages(workspaceApmPackages, userApmPackages),
        [userApmPackages, workspaceApmPackages],
    )

    const queryText = filter.trim().toLowerCase()
    const filteredApmPackages = useMemo(
        () => filterApmPackages(scopedApmPackages, effectiveSourceFilter, queryText),
        [effectiveSourceFilter, queryText, scopedApmPackages],
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
    const localPlaceholder = placeholderForLocalSection(localSection)

    return {
        localSection,
        setLocalSection: selectLocalSection,
        sourceFilter: effectiveSourceFilter,
        setSourceFilter,
        modelProviderFilter: effectiveModelProviderFilter,
        setModelProviderFilter: selectModelProviderFilter,
        filter,
        setFilter: updateFilter,
        localPlaceholder,
        authoringHint,
        apmPackagesLoading: workspaceApmPackagesLoading || userApmPackagesLoading,
        filteredApmPackages,
        groupedModels,
        filteredMcps,
        liveMcpServers: mcpServers,
        selectedItem: resolvedSelectedItem,
        setSelectedItem,
        selectedItemKey,
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
