import { X } from 'lucide-react'
import './AssetLibrary.css'
import AssetLibraryLocalView from './AssetLibraryLocalView'
import McpCatalogImpactDialog from './McpCatalogImpactDialog'
import UninstallConfirmDialog from './UninstallConfirmDialog'
import { useAssetLibraryController } from './useAssetLibraryController'

export default function AssetLibrary({ onClose }: { onClose?: () => void }) {
    const controller = useAssetLibraryController()

    return (
        <div className="assets-panel">
            <div className="drawer-header">
                <span className="drawer-header__title">APM Packages</span>
                {onClose ? (
                    <button className="icon-btn" onClick={onClose} title="Close">
                        <X size={14} />
                    </button>
                ) : null}
            </div>

            <AssetLibraryLocalView
                localSection={controller.localSection}
                setLocalSection={controller.setLocalSection}
                primitiveKind={controller.primitiveKind}
                setPrimitiveKind={controller.setPrimitiveKind}
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
                assetsLoading={controller.assetsLoading}
                filteredInstalledAssets={controller.filteredInstalledAssets}
                groupedModels={controller.groupedModels}
                filteredMcps={controller.filteredMcps}
                liveMcpServers={controller.liveMcpServers}
                selectedAsset={controller.selectedAsset}
                selectedAssetKey={controller.selectedAssetKey}
                selectedInstalled={controller.selectedInstalled}
                authUser={controller.authUser}
                detailActionStatus={controller.detailActionStatus}
                detailActionLoading={controller.detailActionLoading}
                onSelectAsset={controller.setSelectedAsset}
                onCloseAsset={() => controller.setSelectedAsset(null)}
                onSaveLocal={(asset) => controller.handlePinnedAssetAction(asset, 'save-local')}
                onDeleteDraft={controller.handleDeleteDraft}
                onEditDraft={controller.handleEditDraft}
                onUninstall={controller.handleUninstallAsset}
                onCheckDanceUpdates={controller.handleCheckDanceUpdates}
                onUpdateDance={controller.handleUpdateDance}
                onCheckDanceRepoChanges={(asset) => controller.handleCheckDanceUpdates(asset, true)}
                onReimportDanceSource={controller.handleReimportDanceSource}
                createNewPerformer={controller.createNewPerformer}
                createNewAct={controller.createNewAct}
                createNewPerformerDraftEntry={controller.createNewPerformerDraftEntry}
                showInstalledAssets={controller.showInstalledAssets}
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

            {controller.uninstallPlan && (
                <UninstallConfirmDialog
                    target={controller.uninstallPlan.target}
                    dependents={controller.uninstallPlan.dependents}
                    loading={controller.uninstallLoading}
                    actionName={controller.uninstallPlan.actionName}
                    onConfirm={controller.confirmUninstall}
                    onCancel={controller.cancelUninstall}
                />
            )}

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
