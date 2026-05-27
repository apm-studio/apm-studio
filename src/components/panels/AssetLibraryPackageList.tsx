import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Bot, Boxes, FileText, GripVertical, PackageOpen, Server, Zap } from 'lucide-react'
import type { ScopedApmPackageSummary } from './asset-panel-types'
import {
    apmPackageKindLabel,
    apmPackagePrimitiveEntries,
    apmPackagePrimitiveSummary,
    apmPackageTitle,
} from './asset-library-packages'
import { buildApmPackageDragPayload } from './asset-library-utils'

type Props = {
    packages: ScopedApmPackageSummary[]
    loading: boolean
}

function packageIcon(kind: string) {
    if (kind === 'agent') return <Bot size={12} className="asset-icon performer" />
    if (kind === 'skill') return <Zap size={12} className="asset-icon dance" />
    if (kind === 'instruction') return <FileText size={12} className="asset-icon tal" />
    if (kind === 'mcp') return <Server size={12} className="asset-icon mcp" />
    return <PackageOpen size={12} className="asset-icon combo" />
}

function PackageRow({ pkg }: { pkg: ScopedApmPackageSummary }) {
    const warnings = pkg.microsoftApm?.warnings || []
    const title = apmPackageTitle(pkg)
    const primitives = apmPackagePrimitiveSummary(pkg)
    const primitiveEntries = apmPackagePrimitiveEntries(pkg)
    const kindLabel = apmPackageKindLabel(pkg.kind)
    const packagePath = pkg.microsoftApm?.packageRoot || pkg.manifestPath || 'package root unavailable'
    const dragPayload = useMemo(() => buildApmPackageDragPayload(pkg), [pkg])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `apm-package-${pkg.scope}-${pkg.packageId}`,
        data: dragPayload,
    })

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`asset-card asset-package-card ${isDragging ? 'is-dragging' : ''}`}
            title={pkg.kind === 'agent' ? 'Drag to the canvas to add this agent package.' : 'Drag agent packages to the canvas. Use Primitives for Instructions, Skills, and MCP.'}
        >
            <div className="asset-card__header">
                <GripVertical size={10} className="drag-handle" />
                {packageIcon(pkg.kind)}
                <span className="asset-card__name" title={title}>{title}</span>
                {warnings.length > 0 ? (
                    <span className="asset-sync-badge asset-package-card__warning" title={warnings.join('\n')}>
                        {warnings.length} warn
                    </span>
                ) : null}
                <span className={`source-badge ${pkg.scope}`}>{pkg.scope === 'stage' ? 'workspace' : 'global'}</span>
            </div>
            <div className="asset-card__author" title={`${kindLabel} · ${pkg.packageId}`}>
                {kindLabel} · {pkg.packageId}
            </div>
            <div className="asset-card__desc" title={pkg.description || primitives}>
                {pkg.description || primitives}
            </div>
            <div className="asset-package-card__primitive-map" aria-label={`${title} primitives`}>
                {primitiveEntries.length > 0 ? primitiveEntries.map((entry) => (
                    <span key={entry.key} className={`asset-package-card__primitive-chip asset-package-card__primitive-chip--${entry.key}`}>
                        <span>{entry.label}</span>
                        <strong>{entry.count}</strong>
                    </span>
                )) : (
                    <span className="asset-package-card__primitive-chip asset-package-card__primitive-chip--empty">
                        No primitives
                    </span>
                )}
            </div>
            <div className="asset-package-card__path" title={packagePath}>
                <Boxes size={10} />
                <span>{packagePath}</span>
            </div>
        </div>
    )
}

export default function AssetLibraryPackageList({ packages, loading }: Props) {
    if (loading) {
        return (
            <div className="asset-library-body">
                <div className="assets-list">
                    <div className="empty-state">Loading...</div>
                </div>
            </div>
        )
    }

    return (
        <div className="asset-library-body">
            <div className="assets-list asset-package-list">
                {packages.length === 0 ? (
                    <div className="empty-state">No local APM packages found.</div>
                ) : packages.map((pkg) => (
                    <PackageRow key={`${pkg.scope}:${pkg.packageId}`} pkg={pkg} />
                ))}
            </div>
        </div>
    )
}
