import type { Dispatch, SetStateAction } from 'react'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import type { McpServerSummary } from '../../../shared/opencode-contracts'
import { Bot, Cpu, FileText, FolderOpen, HardDrive, Layers3, Search, Server, Zap } from 'lucide-react'
import { PACKAGE_PRIMITIVE_SECTIONS } from './package-library-utils'
import type {
    LocalSection,
    ModelProviderFilter,
    PackagePrimitiveSection,
    SourceFilter,
} from './package-library-utils'
import PackageLibraryMcpManager from './PackageLibraryMcpManager'
import PackageLibraryModelList from './PackageLibraryModelList'
import PackageLibraryPackageList from './PackageLibraryPackageList'
import type { McpCatalogState } from './useMcpCatalog'
import type { PackagePanelItem, PackagePanelHandler, ScopedApmPackageSummary } from './package-panel-types'

type Props = {
    localSection: LocalSection
    setLocalSection: (value: LocalSection) => void
    primitiveSection: PackagePrimitiveSection
    setPrimitiveSection: (value: PackagePrimitiveSection) => void
    sourceFilter: SourceFilter
    setSourceFilter: (value: SourceFilter) => void
    modelProviderFilter: ModelProviderFilter
    setModelProviderFilter: (value: ModelProviderFilter) => void
    filter: string
    setFilter: (value: string) => void
    localPlaceholder: string
    authoringHint: string | null
    apmPackagesLoading: boolean
    filteredApmPackages: ScopedApmPackageSummary[]
    groupedModels: Array<{ key: string; label: string; items: RuntimeModelCatalogEntry[]; connected?: boolean }>
    liveMcpServers: McpServerSummary[]
    selectedItem: PackagePanelItem | null
    selectedItemKey: string | null
    onSelectItem: PackagePanelHandler
    onCloseItem: () => void
    showModels: boolean
    showMcps: boolean
    mcpEntries: McpCatalogState['mcpEntries']
    mcpCatalogStatus: string | null
    mcpCatalogSaving: boolean
    runtimeReloadPending: boolean
    pendingMcpAuthName: string | null
    createMcpEntryDraft: McpCatalogState['createMcpEntryDraft']
    saveMcpEntry: McpCatalogState['saveMcpEntry']
    deleteMcpEntry: McpCatalogState['deleteMcpEntry']
    connectMcpServer: (name: string) => Promise<void>
    startMcpAuthFlow: (name: string) => Promise<void>
    clearMcpAuth: (name: string) => Promise<void>
    expandedModelProviders: Record<string, boolean>
    setExpandedModelProviders: Dispatch<SetStateAction<Record<string, boolean>>>
    modelProviderTabs: Array<{ key: ModelProviderFilter; label: string }>
}

const noopPackagePanelHandler: PackagePanelHandler = () => {}

function primitiveSectionLabel(section: PackagePrimitiveSection) {
    if (section === 'agents') return 'Studio Agents'
    if (section === 'instructions') return 'Instructions'
    if (section === 'skills') return 'Skills'
    return 'MCP'
}

function primitiveSectionIcon(section: PackagePrimitiveSection) {
    if (section === 'agents') return <Bot size={8} style={{ verticalAlign: -1, marginRight: 2 }} />
    if (section === 'instructions') return <FileText size={8} style={{ verticalAlign: -1, marginRight: 2 }} />
    if (section === 'skills') return <Zap size={8} style={{ verticalAlign: -1, marginRight: 2 }} />
    return <Server size={8} style={{ verticalAlign: -1, marginRight: 2 }} />
}

export default function PackageLibraryLocalView({
    localSection,
    setLocalSection,
    primitiveSection,
    setPrimitiveSection,
    sourceFilter,
    setSourceFilter,
    modelProviderFilter,
    setModelProviderFilter,
    filter,
    setFilter,
    localPlaceholder,
    authoringHint,
    apmPackagesLoading,
    filteredApmPackages,
    groupedModels,
    liveMcpServers,
    selectedItem,
    selectedItemKey,
    onSelectItem,
    onCloseItem,
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
}: Props) {
    const showPrimitives = localSection !== 'models'

    return (
        <div className="package-library-local-view">
            <div className="scope-selector package-scope-selector">
                <button className={`scope-btn ${showPrimitives ? 'active' : ''}`} onClick={() => {
                    if (!showPrimitives) setPrimitiveSection(primitiveSection)
                }}>
                    <Layers3 size={11} />
                    <span>Primitives</span>
                </button>
                <button className={`scope-btn ${localSection === 'models' ? 'active' : ''}`} onClick={() => setLocalSection('models')}>
                    <Cpu size={11} />
                    <span>Models</span>
                </button>
            </div>

            {showPrimitives ? (
                <div className="sub-scope-row">
                    {PACKAGE_PRIMITIVE_SECTIONS.map((section) => (
                        <button
                            key={section}
                            className={`sub-scope-tag ${primitiveSection === section ? 'active' : ''}`}
                            onClick={() => setPrimitiveSection(section)}
                        >
                            {primitiveSectionIcon(section)}
                            {primitiveSectionLabel(section)}
                        </button>
                    ))}
                </div>
            ) : null}

            {localSection === 'packages' ? (
                <div className="sub-scope-row">
                    {(['all', 'workspace', 'user'] as SourceFilter[]).map((value) => (
                        <button
                            key={value}
                            className={`sub-scope-tag ${sourceFilter === value ? 'active' : ''}`}
                            onClick={() => setSourceFilter(value)}
                        >
                            {value === 'all' ? 'All' : value === 'user' ? (
                                <><HardDrive size={8} style={{ verticalAlign: -1, marginRight: 2 }} />User</>
                            ) : (
                                <><FolderOpen size={8} style={{ verticalAlign: -1, marginRight: 2 }} />Workspace</>
                            )}
                        </button>
                    ))}
                </div>
            ) : null}

            <div className="explorer__header">
                <div className="search-wrapper">
                    <Search size={12} className="icon-muted" />
                    <input className="text-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={localPlaceholder} />
                </div>
            </div>

            {authoringHint ? <div className="package-authoring-hint">{authoringHint}</div> : null}

            {localSection === 'packages' && primitiveSection !== 'mcp' ? (
                <PackageLibraryPackageList
                    primitiveSection={primitiveSection}
                    packages={filteredApmPackages}
                    loading={apmPackagesLoading}
                />
            ) : null}

            {showMcps ? (
                <div className="package-library-body package-library-body--mcp">
                    <PackageLibraryMcpManager
                        liveMcps={liveMcpServers}
                        mcpEntries={mcpEntries}
                        mcpCatalogStatus={mcpCatalogStatus}
                        mcpCatalogSaving={mcpCatalogSaving}
                        runtimeReloadPending={runtimeReloadPending}
                        pendingMcpAuthName={pendingMcpAuthName}
                        createMcpEntryDraft={createMcpEntryDraft}
                        saveMcpEntry={saveMcpEntry}
                        deleteMcpEntry={deleteMcpEntry}
                        connectMcpServer={connectMcpServer}
                        startMcpAuthFlow={startMcpAuthFlow}
                        clearMcpAuth={clearMcpAuth}
                    />
                </div>
            ) : null}

            {showModels ? (
                <>
                    <div className="sub-scope-row">
                        <select className="select" value={modelProviderFilter} onChange={(e) => setModelProviderFilter(e.target.value as ModelProviderFilter)}>
                            {modelProviderTabs.map((tab) => (
                                <option key={tab.key} value={tab.key}>{tab.label}</option>
                            ))}
                        </select>
                    </div>
                    <PackageLibraryModelList
                        showPackagePrimitives={false}
                        showModels={showModels}
                        showMcps={false}
                        primitivesLoading={false}
                        filteredPackagePrimitives={[]}
                        filteredMcps={[]}
                        mcpEmptyMessage=""
                        groupedModels={groupedModels}
                        selectedItem={selectedItem}
                        selectedItemKey={selectedItemKey}
                        expandedModelProviders={expandedModelProviders}
                        setExpandedModelProviders={setExpandedModelProviders}
                        packagePrimitiveEmptyMessage=""
                        onSelectItem={onSelectItem}
                        onCloseItem={onCloseItem}
                        onDeleteDraft={noopPackagePanelHandler}
                        onUninstall={undefined}
                    />
                </>
            ) : null}
        </div>
    )
}
