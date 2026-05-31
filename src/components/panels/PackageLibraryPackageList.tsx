import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Bot, Boxes, FileText, GripVertical, Zap } from 'lucide-react'
import type { ScopedApmPackageSummary } from './package-panel-types'
import {
    apmPackagePrimitiveEntries,
    apmPackagePrimitiveSummary,
    apmPackageTitle,
} from './package-library-packages'
import { buildApmPackageDragPayload } from './package-library-utils'
import type { PackagePrimitiveSection } from './package-library-utils'

type PackageCardSection = Exclude<PackagePrimitiveSection, 'mcp'>

type Props = {
    primitiveSection: PackageCardSection
    packages: ScopedApmPackageSummary[]
    loading: boolean
}

function packageIcon(section: PackageCardSection) {
    if (section === 'agents') return <Bot size={12} className="primitive-icon agent" />
    if (section === 'skills') return <Zap size={12} className="primitive-icon skill" />
    return <FileText size={12} className="primitive-icon instruction" />
}

function packageCardLabel(section: PackageCardSection) {
    if (section === 'agents') return 'Studio Agent'
    if (section === 'skills') return 'Skill'
    return 'Instruction'
}

function packageDragTitle(section: PackageCardSection) {
    if (section === 'agents') return 'Drag to the canvas to add this Studio Agent.'
    if (section === 'skills') return 'Drag onto a Studio Agent Skills slot.'
    return 'Drag onto a Studio Agent Instruction slot.'
}

function packageKindForSection(section: PackageCardSection) {
    if (section === 'agents') return 'agent'
    if (section === 'skills') return 'skill'
    return 'instruction'
}

function packageEmptyMessage(section: PackageCardSection) {
    if (section === 'agents') return 'No Studio Agent packages found.'
    if (section === 'skills') return 'No Skill packages found.'
    return 'No Instruction packages found.'
}

function PackageRow({
    pkg,
    primitiveSection,
}: {
    pkg: ScopedApmPackageSummary
    primitiveSection: PackageCardSection
}) {
    const warnings = pkg.microsoftApm?.warnings || []
    const title = apmPackageTitle(pkg)
    const primitives = apmPackagePrimitiveSummary(pkg)
    const primitiveEntries = apmPackagePrimitiveEntries(pkg)
    const cardLabel = packageCardLabel(primitiveSection)
    const packagePath = pkg.microsoftApm?.packageRoot || pkg.manifestPath || 'package root unavailable'
    const dragPayload = useMemo(() => ({
        ...buildApmPackageDragPayload(pkg),
        packageKind: packageKindForSection(primitiveSection),
    }), [pkg, primitiveSection])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `apm-package-${primitiveSection}-${pkg.scope}-${pkg.packageId}`,
        data: dragPayload,
    })

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`primitive-card package-summary-card ${isDragging ? 'is-dragging' : ''}`}
            title={packageDragTitle(primitiveSection)}
        >
            <div className="primitive-card__header">
                <GripVertical size={10} className="drag-handle" />
                {packageIcon(primitiveSection)}
                <span className="primitive-card__name" title={title}>{title}</span>
                {warnings.length > 0 ? (
                    <span className="primitive-sync-badge package-summary-card__warning" title={warnings.join('\n')}>
                        {warnings.length} warn
                    </span>
                ) : null}
                <span className={`source-badge ${pkg.scope}`}>{pkg.scope}</span>
            </div>
            <div className="primitive-card__author" title={`${cardLabel} · ${pkg.packageId}`}>
                {cardLabel} · {pkg.packageId}
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

export default function PackageLibraryPackageList({ primitiveSection, packages, loading }: Props) {
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
                    <div className="empty-state">{packageEmptyMessage(primitiveSection)}</div>
                ) : packages.map((pkg) => (
                    <PackageRow
                        key={`${primitiveSection}:${pkg.scope}:${pkg.packageId}`}
                        pkg={pkg}
                        primitiveSection={primitiveSection}
                    />
                ))}
            </div>
        </div>
    )
}
