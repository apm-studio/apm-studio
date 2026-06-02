import { useEffect, useState } from 'react'
import type { ApmPackageReadResponse } from '../../../shared/apm-contracts'
import { apmApi } from '../../api-clients/apm'
import { AssetDetailsModal } from '../../components/shared/AssetDetailsModal'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import {
    buildTargetExportAssetDetailModel,
    targetExportDetailNeedsPackageRead,
type TargetExportAssetDetailRequest,
} from './target-export-detail-model'

type PackageReadState = {
    identityKey: string
    packageRead: ApmPackageReadResponse | null
    packageError: string | null
}

function requestPackageIdentity(request: TargetExportAssetDetailRequest | null) {
    if (!targetExportDetailNeedsPackageRead(request)) return null
    return {
        packageId: request.pkg.packageId,
        scope: request.pkg.scope,
    }
}

export function TargetExportAssetDetailsModal({
    request,
    onClose,
}: {
    request: TargetExportAssetDetailRequest | null
    onClose: () => void
}) {
    const [packageReadState, setPackageReadState] = useState<PackageReadState | null>(null)
    const packageIdentity = requestPackageIdentity(request)
    const packageId = packageIdentity?.packageId || null
    const packageScope = packageIdentity?.scope || null
    const packageIdentityKey = packageId && packageScope ? `${packageScope}:${packageId}` : null
    const packageReadMatches = packageReadState?.identityKey === packageIdentityKey
    const packageRead = packageReadMatches ? packageReadState.packageRead : null
    const packageError = packageReadMatches ? packageReadState.packageError : null
    const packageLoading = Boolean(packageIdentityKey && !packageReadMatches)

    useEffect(() => {
        let cancelled = false

        if (!packageId || !packageScope || !packageIdentityKey) {
            return () => {
                cancelled = true
            }
        }

        apmApi.readPackage(packageId, packageScope)
            .then((response) => {
                if (!cancelled) {
                    setPackageReadState({
                        identityKey: packageIdentityKey,
                        packageRead: response,
                        packageError: null,
                    })
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setPackageReadState({
                        identityKey: packageIdentityKey,
                        packageRead: null,
                        packageError: formatStudioApiErrorMessage(error, false),
                    })
                }
            })

        return () => {
            cancelled = true
        }
    }, [packageId, packageIdentityKey, packageScope])

    if (!request) return null

    return (
        <AssetDetailsModal
            model={buildTargetExportAssetDetailModel(request, {
                packageRead,
                packageLoading,
                packageError,
            })}
            onClose={onClose}
        />
    )
}
