import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import type { SourceFilter } from './asset-library-utils'
import type { ScopedApmPackageSummary } from './asset-panel-types'

export function scopeApmPackages(
    stagePackages: ApmPackageSummary[],
    globalPackages: ApmPackageSummary[],
): ScopedApmPackageSummary[] {
    return [
        ...stagePackages.map((pkg) => ({ ...pkg, scope: 'stage' as const })),
        ...globalPackages.map((pkg) => ({ ...pkg, scope: 'global' as const })),
    ]
}

export function apmPackageTitle(pkg: ScopedApmPackageSummary) {
    return pkg.agentName || pkg.name || pkg.packageId
}

export function apmPackageKindLabel(kind: string) {
    if (kind === 'agent') return 'agent package'
    if (kind === 'skill') return 'skill package'
    if (kind === 'instruction') return 'instruction package'
    if (kind === 'prompt') return 'prompt package'
    if (kind === 'mcp') return 'mcp package'
    if (kind === 'team') return 'team package'
    if (kind === 'workspace') return 'workspace package'
    if (kind === 'package') return 'package'
    return `${kind} package`
}

export function apmPackagePrimitiveEntries(pkg: ScopedApmPackageSummary) {
    const counts = pkg.microsoftApm?.primitiveCounts
    if (!counts) return []

    return [
        { key: 'agents', label: 'Agents', count: counts.agents },
        { key: 'instructions', label: 'Instructions', count: counts.instructions },
        { key: 'skills', label: 'Skills', count: counts.skills },
        { key: 'prompts', label: 'Prompts', count: counts.prompts || 0 },
    ].filter((entry) => entry.count > 0)
}

export function apmPackagePrimitiveSummary(pkg: ScopedApmPackageSummary) {
    const parts = apmPackagePrimitiveEntries(pkg).map((entry) => (
        `${entry.count} ${entry.label.toLowerCase().replace(/s$/, '')}${entry.count === 1 ? '' : 's'}`
    ))

    return parts.length > 0 ? parts.join(' · ') : 'No primitives'
}

function apmPackageSearchHaystack(pkg: ScopedApmPackageSummary) {
    const counts = pkg.microsoftApm?.primitiveCounts
    return [
        pkg.name,
        pkg.packageId,
        pkg.description,
        pkg.kind,
        pkg.agentName,
        pkg.derivedFrom,
        pkg.manifestPath,
        pkg.microsoftApm?.packageRoot,
        counts ? `${counts.agents} agents ${counts.instructions} instructions ${counts.skills} skills ${counts.prompts || 0} prompts` : '',
        pkg.scope,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

export function filterApmPackages(
    packages: ScopedApmPackageSummary[],
    sourceFilter: SourceFilter,
    queryText: string,
) {
    return packages
        .filter((pkg) => {
            if (sourceFilter === 'global' || sourceFilter === 'stage') {
                return pkg.scope === sourceFilter
            }
            return sourceFilter === 'all'
        })
        .filter((pkg) => !queryText || apmPackageSearchHaystack(pkg).includes(queryText))
}
