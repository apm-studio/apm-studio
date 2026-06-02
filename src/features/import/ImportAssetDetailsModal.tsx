import { AssetDetailsModal } from '../../components/shared/AssetDetailsModal'
import {
    buildImportAssetDetailModel,
    type ImportAssetDetailRequest,
} from './import-detail-model'

export function ImportAssetDetailsModal({
    request,
    onClose,
}: {
    request: ImportAssetDetailRequest | null
    onClose: () => void
}) {
    if (!request) return null

    return (
        <AssetDetailsModal
            model={buildImportAssetDetailModel(request)}
            onClose={onClose}
        />
    )
}

