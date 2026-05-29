import type { PackagePanelItem } from './package-panel-types'

export function useResolvedPackageDetail(item: PackagePanelItem | null) {
    return {
        resolvedItem: item,
        loading: false,
    }
}
