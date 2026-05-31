import { X } from 'lucide-react'
import './PackageLibrary.css'
import PackageLibraryLocalView from './PackageLibraryLocalView'
import McpCatalogImpactDialog from './McpCatalogImpactDialog'
import { usePackageLibraryController } from './usePackageLibraryController'

export default function PackageLibrary({ onClose }: { onClose?: () => void }) {
    const controller = usePackageLibraryController()

    return (
        <div className="packages-panel">
            <div className="drawer-header">
                <span className="drawer-header__title">APM Packages</span>
                {onClose ? (
                    <button className="icon-btn" onClick={onClose} title="Close">
                        <X size={14} />
                    </button>
                ) : null}
            </div>

            <PackageLibraryLocalView
                localSection={controller.localSection}
                setLocalSection={controller.setLocalSection}
                primitiveSection={controller.primitiveSection}
                setPrimitiveSection={controller.setPrimitiveSection}
                sourceFilter={controller.sourceFilter}
                setSourceFilter={controller.setSourceFilter}
                modelProviderFilter={controller.modelProviderFilter}
                setModelProviderFilter={controller.setModelProviderFilter}
                filter={controller.filter}
                setFilter={controller.setFilter}
                localPlaceholder={controller.localPlaceholder}
                authoringHint={controller.authoringHint}
                apmPackagesLoading={controller.apmPackagesLoading}
                filteredApmPackages={controller.filteredApmPackages}
                groupedModels={controller.groupedModels}
                liveMcpServers={controller.liveMcpServers}
                selectedItem={controller.selectedItem}
                selectedItemKey={controller.selectedItemKey}
                onSelectItem={controller.setSelectedItem}
                onCloseItem={() => controller.setSelectedItem(null)}
                showModels={controller.showModels}
                showMcps={controller.showMcps}
                mcpEntries={controller.mcpEntries}
                mcpCatalogStatus={controller.mcpCatalogStatus}
                mcpCatalogSaving={controller.mcpCatalogSaving}
                runtimeReloadPending={controller.runtimeReloadPending}
                pendingMcpAuthName={controller.pendingMcpAuthName}
                createMcpEntryDraft={controller.createMcpEntryDraft}
                saveMcpEntry={controller.saveMcpEntry}
                deleteMcpEntry={controller.deleteMcpEntry}
                connectMcpServer={controller.connectMcpServer}
                startMcpAuthFlow={controller.startMcpAuthFlow}
                clearMcpAuth={controller.clearMcpAuth}
                expandedModelProviders={controller.expandedModelProviders}
                setExpandedModelProviders={controller.setExpandedModelProviders}
                modelProviderTabs={controller.modelProviderTabs}
            />

            {controller.mcpImpactDialog && (
                <McpCatalogImpactDialog
                    impact={controller.mcpImpactDialog}
                    loading={controller.mcpImpactSaving}
                    onConfirm={controller.confirmMcpImpactSave}
                    onCancel={controller.cancelMcpImpactSave}
                />
            )}
        </div>
    )
}
