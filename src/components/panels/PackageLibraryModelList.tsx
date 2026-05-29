import type { Dispatch, SetStateAction } from 'react'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import type { McpServerSummary } from '../../../shared/opencode-contracts'
import { DraggablePrimitive, DraggableMcp, DraggableModel, PinnedDetailPanel } from './PackageCards'
import { MAX_MODELS_PER_PROVIDER, getPackagePanelItemKey } from './package-library-utils'
import type { PackagePanelItem, PackagePanelHandler, PackagePrimitive } from './package-panel-types'

type Props = {
    showPackagePrimitives: boolean
    showModels: boolean
    showMcps: boolean
    primitivesLoading: boolean
    filteredPackagePrimitives: PackagePrimitive[]
    filteredMcps: McpServerSummary[]
    mcpEmptyMessage: string
    groupedModels: Array<{ key: string; label: string; items: RuntimeModelCatalogEntry[]; connected?: boolean }>
    selectedItem: PackagePanelItem | null
    selectedItemKey: string | null
    expandedModelProviders: Record<string, boolean>
    setExpandedModelProviders: Dispatch<SetStateAction<Record<string, boolean>>>
    packagePrimitiveEmptyMessage: string
    onSelectItem: PackagePanelHandler
    onCloseItem: () => void
    onDeleteDraft: PackagePanelHandler
    onEditDraft?: PackagePanelHandler
    onUninstall?: PackagePanelHandler
    onEditMcp?: PackagePanelHandler
    onDeleteMcp?: PackagePanelHandler
}

export default function PackageLibraryModelList({
    showPackagePrimitives,
    showModels,
    showMcps,
    primitivesLoading,
    filteredPackagePrimitives,
    filteredMcps,
    mcpEmptyMessage,
    groupedModels,
    selectedItem,
    selectedItemKey,
    expandedModelProviders,
    setExpandedModelProviders,
    packagePrimitiveEmptyMessage,
    onSelectItem,
    onCloseItem,
    onDeleteDraft,
    onEditDraft,
    onUninstall,
    onEditMcp,
    onDeleteMcp,
}: Props) {
    return (
        <div className="package-library-body">
            <div className="package-items-list">
                {showPackagePrimitives && (
                    primitivesLoading ? <div className="empty-state">Loading...</div> :
                        filteredPackagePrimitives.length === 0 ? <div className="empty-state">{packagePrimitiveEmptyMessage}</div> :
                            filteredPackagePrimitives.map((item) => (
                                <DraggablePrimitive
                                    key={item.urn}
                                    item={item}
                                    selected={selectedItemKey === getPackagePanelItemKey(item)}
                                    onSelect={onSelectItem}
                                    onUninstall={onUninstall}
                                    onDeleteDraft={onDeleteDraft}
                                    onEditDraft={onEditDraft}
                                />
                            ))
                )}
                {showModels && (
                    groupedModels.length === 0 ? <div className="empty-state">No models available for this filter.</div> :
                        groupedModels.map((group) => {
                            const expanded = !!expandedModelProviders[group.key]
                            const visibleItems = expanded ? group.items : group.items.slice(0, MAX_MODELS_PER_PROVIDER)
                            const hiddenCount = group.items.length - visibleItems.length

                            return (
                                <div key={group.key} className="package-group">
                                    <div className="package-group__header">
                                        <div className="package-group__meta">
                                            <span>{group.label}</span>
                                            <span className="package-group__count">{group.items.length}</span>
                                            {!group.connected && <span className="package-group__status">Not connected</span>}
                                        </div>
                                        {hiddenCount > 0 ? (
                                            <button
                                                className="package-group__toggle"
                                                onClick={() => setExpandedModelProviders((current) => ({
                                                    ...current,
                                                    [group.key]: true,
                                                }))}
                                            >
                                                +{hiddenCount} more
                                            </button>
                                        ) : null}
                                    </div>
                                    {visibleItems.map((model) => (
                                        <DraggableModel
                                            key={`${model.provider}-${model.id}`}
                                            model={model}
                                            selected={selectedItemKey === getPackagePanelItemKey({ kind: 'model', ...model })}
                                            onSelect={onSelectItem}
                                        />
                                    ))}
                                </div>
                            )
                        })
                )}
                {showMcps && (
                    filteredMcps.length === 0 ? <div className="empty-state">{mcpEmptyMessage}</div> :
                        filteredMcps.map((mcp, index) => (
                            <DraggableMcp
                                key={`${mcp.name}-${index}`}
                                mcp={mcp}
                                selected={selectedItemKey === getPackagePanelItemKey({ kind: 'mcp', ...mcp })}
                                onSelect={onSelectItem}
                                onEdit={onEditMcp}
                                onDelete={onDeleteMcp}
                            />
                        ))
                )}
            </div>

            <PinnedDetailPanel
                item={selectedItem}
                onClose={onCloseItem}
                onDeleteDraft={onDeleteDraft}
                onUninstall={onUninstall}
                onEditMcp={onEditMcp}
                onDeleteMcp={onDeleteMcp}
            />
        </div>
    )
}
