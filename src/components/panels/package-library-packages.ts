import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import { shouldRenderStudioAgentTeamsUi } from '../../app/studio-agent-ui-state'
import type { PackagePrimitiveSection, SourceFilter } from './package-library-utils'
import type { ScopedApmPackageSummary } from './package-panel-types'

export function scopeApmPackages(
    workspacePackages: ApmPackageSummary[],
    userPackages: ApmPackageSummary[],
): ScopedApmPackageSummary[] {
    return [
        ...workspacePackages.map((pkg) => ({ ...pkg, scope: 'workspace' as const })),
        ...userPackages.map((pkg) => ({ ...pkg, scope: 'user' as const })),
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
    if (kind === 'command') return 'command package'
    if (kind === 'hook') return 'hook package'
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
        { key: 'agents', label: 'Agents', singular: 'agent', plural: 'agents', count: counts.agents },
        { key: 'instructions', label: 'Instructions', singular: 'instruction', plural: 'instructions', count: counts.instructions },
        { key: 'skills', label: 'Skills', singular: 'skill', plural: 'skills', count: counts.skills },
        { key: 'prompts', label: 'Prompts', singular: 'prompt', plural: 'prompts', count: counts.prompts || 0 },
        { key: 'commands', label: 'Commands', singular: 'command', plural: 'commands', count: counts.commands || 0 },
        { key: 'hooks', label: 'Hooks', singular: 'hook', plural: 'hooks', count: counts.hooks || 0 },
        { key: 'mcp', label: 'MCP', singular: 'MCP server', plural: 'MCP servers', count: counts.mcp || 0 },
    ].filter((entry) => entry.count > 0)
}

export function apmPackagePrimitiveSummary(pkg: ScopedApmPackageSummary) {
    const parts = apmPackagePrimitiveEntries(pkg).map((entry) => (
        `${entry.count} ${entry.count === 1 ? entry.singular : entry.plural}`
    ))

    return parts.length > 0 ? parts.join(' · ') : 'No primitives'
}

export function packageMatchesPrimitiveSection(
    pkg: ScopedApmPackageSummary,
    section: PackagePrimitiveSection,
) {
    // Team packages are parked from the Studio Agent Packages drawer with the rest of Team UI.
    // Keep Team package support intact; re-enable through studio-agent-ui-state.
    if (pkg.kind === 'team' && !shouldRenderStudioAgentTeamsUi()) {
        return false
    }

    const counts = pkg.microsoftApm?.primitiveCounts

    if (section === 'agents') {
        return pkg.kind === 'agent' || Number(counts?.agents || 0) > 0
    }

    if (section === 'instructions') {
        return pkg.kind === 'instruction' || (pkg.kind !== 'agent' && Number(counts?.instructions || 0) > 0)
    }

    if (section === 'skills') {
        return pkg.kind === 'skill' || (pkg.kind !== 'agent' && Number(counts?.skills || 0) > 0)
    }

    if (section === 'prompts') {
        return pkg.kind === 'prompt' || Number(counts?.prompts || 0) > 0
    }

    if (section === 'commands') {
        return pkg.kind === 'command' || Number(counts?.commands || 0) > 0
    }

    if (section === 'hooks') {
        return pkg.kind === 'hook' || Number(counts?.hooks || 0) > 0
    }

    return pkg.kind === 'mcp' || Number(counts?.mcp || 0) > 0
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
        counts ? `${counts.agents} agents ${counts.instructions} instructions ${counts.skills} skills ${counts.prompts || 0} prompts ${counts.commands || 0} commands ${counts.hooks || 0} hooks ${counts.mcp || 0} mcp` : '',
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
            if (sourceFilter === 'user' || sourceFilter === 'workspace') {
                return pkg.scope === sourceFilter
            }
            return sourceFilter === 'all'
        })
        .filter((pkg) => !queryText || apmPackageSearchHaystack(pkg).includes(queryText))
}
