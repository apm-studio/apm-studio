import type { Dispatch, SetStateAction } from 'react'
import type { McpServer } from '../../types'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import { Cpu, FolderOpen, HardDrive, Hexagon, Layers3, PackageOpen, Plus, Search, Server, Users, Zap } from 'lucide-react'
import type {
    InstalledKind,
    LocalSection,
    ModelProviderFilter,
    PrimitiveKind,
    SourceFilter,
} from './asset-library-utils'
import { authoringNoteForInstalledKind, labelForInstalledKind } from './asset-library-utils'
import AssetLibraryMcpManager from './AssetLibraryMcpManager'
import AssetLibraryModelList from './AssetLibraryModelList'
import AssetLibraryPackageList from './AssetLibraryPackageList'
import type { McpCatalogState } from './useMcpCatalog'
import type { AssetPanelAction, AssetPanelAsset, AssetPanelAuthUser, AssetPanelHandler, LibraryAsset, ScopedApmPackageSummary } from './asset-panel-types'

type Props = {
    localSection: LocalSection
    setLocalSection: (value: LocalSection) => void
    primitiveKind: PrimitiveKind
    setPrimitiveKind: (value: PrimitiveKind) => void
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
    assetsLoading: boolean
    filteredInstalledAssets: LibraryAsset[]
    groupedModels: Array<{ key: string; label: string; items: RuntimeModelCatalogEntry[]; connected?: boolean }>
    filteredMcps: McpServer[]
    liveMcpServers: McpServer[]
    selectedAsset: AssetPanelAsset | null
    selectedAssetKey: string | null
    selectedInstalled: boolean
    authUser?: AssetPanelAuthUser
    detailActionStatus: string | null
    detailActionLoading: AssetPanelAction | null
    onSelectAsset: AssetPanelHandler
    onCloseAsset: () => void
    onSaveLocal: AssetPanelHandler
    onDeleteDraft: AssetPanelHandler
    onEditDraft?: AssetPanelHandler
    onUninstall?: AssetPanelHandler
    onCheckDanceUpdates?: AssetPanelHandler
    onUpdateDance?: AssetPanelHandler
    onCheckDanceRepoChanges?: AssetPanelHandler
    onReimportDanceSource?: AssetPanelHandler
    createNewPerformer: () => void
    createNewAct: () => void
    createNewPerformerDraftEntry: (kind: 'tal' | 'dance') => void
    showInstalledAssets: boolean
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

export default function AssetLibraryLocalView({
    localSection,
    setLocalSection,
    primitiveKind,
    setPrimitiveKind,
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
    assetsLoading,
    filteredInstalledAssets,
    groupedModels,
    filteredMcps,
    liveMcpServers,
    selectedAsset,
    selectedAssetKey,
    selectedInstalled,
    authUser,
    detailActionStatus,
    detailActionLoading,
    onSelectAsset,
    onCloseAsset,
    onSaveLocal,
    onDeleteDraft,
    onEditDraft,
    onUninstall,
    onCheckDanceUpdates,
    onUpdateDance,
    onCheckDanceRepoChanges,
    onReimportDanceSource,
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
    const primitiveTabs: Array<{ key: PrimitiveKind; label: string; icon: React.ReactNode }> = [
        { key: 'performer', label: 'Agents', icon: <Users size={10} /> },
        { key: 'tal', label: 'Instructions', icon: <Hexagon size={10} /> },
        { key: 'dance', label: 'Skills', icon: <Zap size={10} /> },
        { key: 'mcp', label: 'MCP', icon: <Server size={10} /> },
    ]

    const installedKind: InstalledKind = primitiveKind === 'mcp' ? 'performer' : primitiveKind
    const installedEmptyMessage = `No ${labelForInstalledKind(installedKind).toLowerCase()} primitives found.`

    return (
        <div className="asset-library-local-view">
            <div className="scope-selector asset-scope-selector">
                <button className={`scope-btn ${localSection === 'packages' ? 'active' : ''}`} onClick={() => setLocalSection('packages')}>
                    <PackageOpen size={11} />
                    <span>Packages</span>
                </button>
                <button className={`scope-btn ${localSection === 'primitives' ? 'active' : ''}`} onClick={() => setLocalSection('primitives')}>
                    <Layers3 size={11} />
                    <span>Primitives</span>
                </button>
                <button className={`scope-btn ${localSection === 'models' ? 'active' : ''}`} onClick={() => setLocalSection('models')}>
                    <Cpu size={11} />
                    <span>Models</span>
                </button>
            </div>

            {localSection === 'primitives' && (
            <div className="assets-tabs">
                {primitiveTabs.map((tab) => {
                    return (
                        <button
                            key={tab.key}
                            className={`asset-tab ${primitiveKind === tab.key ? 'active' : ''}`}
                            onClick={() => setPrimitiveKind(tab.key)}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    )
                })}
            </div>
            )}

            {(localSection === 'packages' || (localSection === 'primitives' && primitiveKind !== 'mcp')) && (
                <div className="sub-scope-row">
                    {(localSection === 'packages'
                        ? (['all', 'stage', 'global'] as SourceFilter[])
                        : (['all', 'stage', 'global', 'draft'] as SourceFilter[])
                    ).map((value) => (
                        <button
                            key={value}
                            className={`sub-scope-tag ${sourceFilter === value ? 'active' : ''}`}
                            onClick={() => setSourceFilter(value)}
                        >
                            {value === 'all' ? 'All' : value === 'global' ? (
                                <><HardDrive size={8} style={{ verticalAlign: -1, marginRight: 2 }} />Global</>
                            ) : value === 'draft' ? (
                                <><Plus size={8} style={{ verticalAlign: -1, marginRight: 2 }} />Draft</>
                            ) : (
                                <><FolderOpen size={8} style={{ verticalAlign: -1, marginRight: 2 }} />Workspace</>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {localSection === 'primitives' && primitiveKind !== 'mcp' && (
                <div className="asset-authoring-row">
                    {installedKind === 'performer' && (
                        <button className="btn" onClick={createNewPerformer}>
                            <Plus size={10} /> New Agent
                        </button>
                    )}
                    {installedKind === 'tal' && (
                        <button className="btn" onClick={() => createNewPerformerDraftEntry('tal')}>
                            <Plus size={10} /> New Instruction Draft
                        </button>
                    )}
                    {installedKind === 'dance' && (
                        <button className="btn" onClick={() => createNewPerformerDraftEntry('dance')}>
                            <Plus size={10} /> New Skill Draft
                        </button>
                    )}
                    {installedKind === 'act' && (
                        <button className="btn" onClick={createNewAct}>
                            <Plus size={10} /> New Team
                        </button>
                    )}

                    <div className="asset-authoring-row__note">
                        {authoringNoteForInstalledKind(installedKind)}
                    </div>
                </div>
            )}

            <div className="explorer__header">
                <div className="search-wrapper">
                    <Search size={12} className="icon-muted" />
                    <input className="text-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={localPlaceholder} />
                </div>
            </div>

            {authoringHint ? <div className="asset-authoring-hint">{authoringHint}</div> : null}

            {localSection === 'packages' ? (
                <AssetLibraryPackageList
                    packages={filteredApmPackages}
                    loading={apmPackagesLoading}
                />
            ) : null}

            {showMcps ? (
                <div className="asset-library-body asset-library-body--mcp">
                    <AssetLibraryMcpManager
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
                <div className="sub-scope-row">
                    <select className="select" value={modelProviderFilter} onChange={(e) => setModelProviderFilter(e.target.value as ModelProviderFilter)}>
                        {modelProviderTabs.map((tab) => (
                            <option key={tab.key} value={tab.key}>{tab.label}</option>
                        ))}
                    </select>
                </div>
            ) : null}

            {!showMcps && localSection !== 'packages' ? (
                <AssetLibraryModelList
                    showInstalledAssets={showInstalledAssets}
                    showModels={showModels}
                    showMcps={showMcps}
                    assetsLoading={assetsLoading}
                    filteredInstalledAssets={filteredInstalledAssets}
                    filteredMcps={filteredMcps}
                    mcpEmptyMessage=""
                    groupedModels={groupedModels}
                    selectedAsset={selectedAsset}
                    selectedAssetKey={selectedAssetKey}
                    selectedInstalled={selectedInstalled}
                    authUser={authUser}
                    detailActionStatus={detailActionStatus}
                    detailActionLoading={detailActionLoading}
                    expandedModelProviders={expandedModelProviders}
                    setExpandedModelProviders={setExpandedModelProviders}
                    installedEmptyMessage={installedEmptyMessage}
                    onSelectAsset={onSelectAsset}
                    onCloseAsset={onCloseAsset}
                    onSaveLocal={onSaveLocal}
                    onDeleteDraft={onDeleteDraft}
                    onEditDraft={onEditDraft}
                    onUninstall={onUninstall}
                    onCheckDanceUpdates={onCheckDanceUpdates}
                    onUpdateDance={onUpdateDance}
                    onCheckDanceRepoChanges={onCheckDanceRepoChanges}
                    onReimportDanceSource={onReimportDanceSource}
                />
            ) : null}
        </div>
    )
}
