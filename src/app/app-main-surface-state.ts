import type { AppSurfaceMode } from '../components/app-shell-policy'

export interface CachedMainSurfaces {
    import: boolean
    targetExport: boolean
}

export const INITIAL_CACHED_MAIN_SURFACES: CachedMainSurfaces = {
    import: false,
    targetExport: false,
}

export type CacheableMainSurface = 'import' | 'target-export'

export function rememberMainSurface(
    current: CachedMainSurfaces,
    activeSurfaceMode: AppSurfaceMode,
): CachedMainSurfaces {
    if (activeSurfaceMode === 'import') {
        return current.import ? current : { ...current, import: true }
    }

    if (activeSurfaceMode === 'target-export') {
        return current.targetExport ? current : { ...current, targetExport: true }
    }

    return current
}

export function shouldRenderMainSurface(
    cached: CachedMainSurfaces,
    activeSurfaceMode: AppSurfaceMode,
    surface: CacheableMainSurface,
) {
    if (activeSurfaceMode === surface) return true
    return surface === 'import' ? cached.import : cached.targetExport
}
