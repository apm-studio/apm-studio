import type {
    ApmGitHubImportCandidate,
    ApmGitHubImportPreviewResponse,
    MicrosoftApmPrimitiveCounts,
} from '../../../shared/apm-contracts'
import type { RegistryListing } from '../../../shared/registry-contracts'
import type { AssetDetailModel, AssetDetailRow } from '../../components/shared/asset-detail-types'
import { scopeLabel, type ImportScope } from './import-catalog-model'

type ImportPreviewSource = ApmGitHubImportPreviewResponse['source']

export type ImportAssetDetailRequest =
    | {
        kind: 'candidate'
        candidate: ApmGitHubImportCandidate
        previewSource: ImportPreviewSource | null
        installScope: ImportScope
        installed: boolean
        selected: boolean
    }
    | {
        kind: 'registry-listing'
        listing: RegistryListing
    }

const PRIMITIVE_LABELS: Array<{ key: keyof MicrosoftApmPrimitiveCounts; label: string }> = [
    { key: 'agents', label: 'Agents' },
    { key: 'instructions', label: 'Instructions' },
    { key: 'skills', label: 'Skills' },
    { key: 'prompts', label: 'Prompts' },
    { key: 'commands', label: 'Commands' },
    { key: 'hooks', label: 'Hooks' },
    { key: 'mcp', label: 'MCP' },
]

function compactRows(rows: Array<AssetDetailRow | null | undefined>) {
    return rows.filter((row): row is AssetDetailRow => Boolean(row && row.value.trim()))
}

function primitiveCountBadges(counts: Partial<MicrosoftApmPrimitiveCounts>) {
    return PRIMITIVE_LABELS
        .map(({ key, label }) => {
            const value = counts[key]
            return value && value > 0 ? `${label}: ${value}` : null
        })
        .filter((value): value is string => Boolean(value))
}

function uniqueBadges(badges: string[]) {
    return Array.from(new Set(badges))
}

function targetBadges(targets: Record<string, string | undefined>) {
    return Object.entries(targets)
        .map(([target, support]) => support ? `${target}: ${support}` : target)
}

export function buildImportCandidateDetailModel(input: {
    candidate: ApmGitHubImportCandidate
    previewSource: ImportPreviewSource | null
    installScope: ImportScope
    installed: boolean
    selected: boolean
}): AssetDetailModel {
    const {
        candidate,
        installed,
        installScope,
        previewSource,
        selected,
    } = input
    const primitiveBadges = primitiveCountBadges(candidate.primitiveCounts)

    return {
        title: candidate.name,
        subtitle: `${candidate.kind} import candidate`,
        description: candidate.description || 'No description provided.',
        badges: uniqueBadges([
            candidate.kind,
            candidate.format,
            installed ? 'Installed' : selected ? 'Selected' : 'Not selected',
            `${scopeLabel(installScope)} install`,
            ...candidate.targets,
        ]),
        sections: [
            {
                title: 'Candidate Content',
                tab: 'content',
                rows: compactRows([
                    { label: 'Name', value: candidate.name },
                    { label: 'Description', value: candidate.description || 'No description provided.' },
                    { label: 'Source path', value: candidate.sourcePath, mono: true },
                ]),
            },
            {
                title: 'Import Item',
                tab: 'metadata',
                rows: compactRows([
                    { label: 'Package ID', value: candidate.packageId, mono: true },
                    { label: 'Candidate ID', value: candidate.id, mono: true },
                    { label: 'Kind', value: candidate.kind },
                    { label: 'Format', value: candidate.format },
                    { label: 'Source path', value: candidate.sourcePath, mono: true },
                    { label: 'Install scope', value: scopeLabel(installScope) },
                    { label: 'Install status', value: installed ? 'Installed' : 'Not installed' },
                    { label: 'Selection', value: selected ? 'Selected' : 'Not selected' },
                ]),
            },
            {
                title: 'Source',
                tab: 'metadata',
                rows: compactRows([
                    previewSource ? { label: 'Repository', value: previewSource.repo, mono: true } : null,
                    previewSource ? { label: 'Ref', value: previewSource.ref, mono: true } : null,
                    previewSource?.subpath ? { label: 'Subpath', value: previewSource.subpath, mono: true } : null,
                    previewSource?.href ? { label: 'URL', value: previewSource.href, mono: true } : null,
                    previewSource?.stars !== undefined ? { label: 'Stars', value: `${previewSource.stars}` } : null,
                ]),
            },
            {
                title: 'Primitives',
                tab: 'other',
                badges: primitiveBadges.length > 0 ? primitiveBadges : ['No primitive counts reported'],
            },
        ],
    }
}

export function buildRegistryListingDetailModel(listing: RegistryListing): AssetDetailModel {
    const targetSupport = targetBadges(listing.targets)
    const sourcePath = listing.source.path
        ? `${listing.source.repo}/${listing.source.path}`
        : listing.source.repo

    return {
        title: listing.name,
        subtitle: `${listing.kind} registry listing`,
        description: listing.description || listing.summary || 'No description provided.',
        badges: uniqueBadges([
            listing.kind,
            listing.importRecipe.format,
            listing.trust.level,
            listing.status,
            ...listing.tags,
        ]),
        sections: [
            {
                title: 'Listing Content',
                tab: 'content',
                rows: compactRows([
                    listing.summary ? { label: 'Summary', value: listing.summary } : null,
                    { label: 'Description', value: listing.description || listing.summary || 'No description provided.' },
                ]),
                badges: listing.tags.length > 0 ? listing.tags : ['No tags'],
            },
            {
                title: 'Registry Listing',
                tab: 'metadata',
                rows: compactRows([
                    { label: 'Listing ID', value: listing.id, mono: true },
                    { label: 'Slug', value: listing.slug, mono: true },
                    { label: 'Kind', value: listing.kind },
                    { label: 'Status', value: listing.status },
                    listing.license ? { label: 'License', value: listing.license } : null,
                    listing.downloads !== undefined ? { label: 'Downloads', value: `${listing.downloads}` } : null,
                    listing.sourceDownloads !== undefined ? { label: 'Source downloads', value: `${listing.sourceDownloads}` } : null,
                ]),
            },
            {
                title: 'Source',
                tab: 'metadata',
                rows: compactRows([
                    { label: 'Repository', value: listing.source.repo, mono: true },
                    { label: 'Ref', value: listing.source.ref, mono: true },
                    listing.source.path ? { label: 'Path', value: listing.source.path, mono: true } : null,
                    listing.source.resolvedCommitSha ? { label: 'Commit', value: listing.source.resolvedCommitSha, mono: true } : null,
                    { label: 'Source item', value: sourcePath, mono: true },
                    { label: 'Import format', value: listing.importRecipe.format },
                    { label: 'Adapter', value: listing.importRecipe.adapter, mono: true },
                ]),
                lists: listing.importRecipe.include?.length
                    ? [{ label: 'Include', values: listing.importRecipe.include, mono: true }]
                    : undefined,
            },
            {
                title: 'Trust And Targets',
                tab: 'other',
                rows: compactRows([
                    { label: 'Trust level', value: listing.trust.level },
                    { label: 'Verified source', value: listing.trust.verifiedSource ? 'Yes' : 'No' },
                    listing.trust.lastIndexedAt ? { label: 'Last indexed', value: listing.trust.lastIndexedAt } : null,
                    listing.trust.contentHash ? { label: 'Content hash', value: listing.trust.contentHash, mono: true } : null,
                    { label: 'Created', value: listing.createdAt },
                    { label: 'Updated', value: listing.updatedAt },
                ]),
                badges: targetSupport.length > 0 ? targetSupport : ['No target metadata'],
                notices: listing.trust.warnings?.map((warning) => ({ tone: 'warning' as const, text: warning })),
            },
        ],
    }
}

export function buildImportAssetDetailModel(request: ImportAssetDetailRequest): AssetDetailModel {
    if (request.kind === 'registry-listing') {
        return buildRegistryListingDetailModel(request.listing)
    }
    return buildImportCandidateDetailModel(request)
}
