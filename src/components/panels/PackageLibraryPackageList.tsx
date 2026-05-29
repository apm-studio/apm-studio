import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Bot, Boxes, FileText, GripVertical, PackageOpen, Server, Zap } from 'lucide-react'
import type { ScopedApmPackageSummary } from './package-panel-types'
import {
    apmPackageKindLabel,
    apmPackagePrimitiveEntries,
    apmPackagePrimitiveSummary,
    apmPackageTitle,
} from './package-library-packages'
import { buildApmPackageDragPayload } from './package-library-utils'

type Props = {
    packages: ScopedApmPackageSummary[]
    loading: boolean
}

function packageIcon(kind: string) {
    if (kind === 'agent') return <Bot size={12} className="primitive-icon agent" />
    if (kind === 'skill') return <Zap size={12} className="primitive-icon skill" />
    if (kind === 'instruction') return <FileText size={12} className="primitive-icon instruction" />
    if (kind === 'mcp') return <Server size={12} className="primitive-icon mcp" />
    return <PackageOpen size={12} className="primitive-icon combo" />
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
            className={`primitive-card package-summary-card ${isDragging ? 'is-dragging' : ''}`}
            title={pkg.kind === 'agent' ? 'Drag to the canvas to add this agent package.' : 'Drag agent packages to the canvas. Use Primitives for Instructions, Skills, and MCP.'}
        >
            <div className="primitive-card__header">
                <GripVertical size={10} className="drag-handle" />
                {packageIcon(pkg.kind)}
                <span className="primitive-card__name" title={title}>{title}</span>
                {warnings.length > 0 ? (
                    <span className="primitive-sync-badge package-summary-card__warning" title={warnings.join('\n')}>
                        {warnings.length} warn
                    </span>
                ) : null}
                <span className={`source-badge ${pkg.scope}`}>{pkg.scope}</span>
            </div>
            <div className="primitive-card__author" title={`${kindLabel} · ${pkg.packageId}`}>
                {kindLabel} · {pkg.packageId}
            </div>
            <div className="primitive-card__desc" title={pkg.description || primitives}>
                {pkg.description || primitives}
            </div>
            <div className="package-summary-card__primitive-map" aria-label={`${title} primitives`}>
                {primitiveEntries.length > 0 ? primitiveEntries.map((entry) => (
                    <span key={entry.key} className={`package-summary-card__primitive-chip package-summary-card__primitive-chip--${entry.key}`}>
                        <span>{entry.label}</span>
                        <strong>{entry.count}</strong>
                    </span>
                )) : (
                    <span className="package-summary-card__primitive-chip package-summary-card__primitive-chip--empty">
                        No primitives
                    </span>
                )}
            </div>
            <div className="package-summary-card__path" title={packagePath}>
                <Boxes size={10} />
                <span>{packagePath}</span>
            </div>
        </div>
    )
}

export default function PackageLibraryPackageList({ packages, loading }: Props) {
    if (loading) {
        return (
            <div className="package-library-body">
                <div className="package-items-list">
                    <div className="empty-state">Loading...</div>
                </div>
            </div>
        )
    }

    return (
        <div className="package-library-body">
            <div className="package-items-list package-summary-list">
                {packages.length === 0 ? (
                    <div className="empty-state">No local APM packages found.</div>
                ) : packages.map((pkg) => (
                    <PackageRow key={`${pkg.scope}:${pkg.packageId}`} pkg={pkg} />
                ))}
            </div>
        </div>
    )
}
