import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Bot, FileText, GripVertical, Server, Zap } from 'lucide-react'
import type { ScopedApmPackageSummary } from './package-panel-types'
import {
    apmPackagePrimitiveEntries,
    apmPackagePrimitiveSummary,
    apmPackageTitle,
} from './package-library-packages'
import { buildApmPackageDragPayload } from './package-library-utils'
import type { PackagePrimitiveSection } from './package-library-utils'

type PackageCardSection = PackagePrimitiveSection

type Props = {
    primitiveSection: PackageCardSection
    packages: ScopedApmPackageSummary[]
    loading: boolean
    selectedPackageKey?: string | null
    onSelectPackage?: (pkg: ScopedApmPackageSummary) => void
}

function packageIcon(section: PackageCardSection) {
    if (section === 'agents') return <Bot size={12} className="primitive-icon agent" />
    if (section === 'skills') return <Zap size={12} className="primitive-icon skill" />
    if (section === 'hooks') return <Zap size={12} className="primitive-icon skill" />
    if (section === 'mcp') return <Server size={12} className="primitive-icon mcp" />
    return <FileText size={12} className="primitive-icon instruction" />
}

function packageCardLabel(section: PackageCardSection) {
    if (section === 'agents') return 'Agent'
    if (section === 'skills') return 'Skill'
    if (section === 'prompts') return 'Prompt'
    if (section === 'commands') return 'Command'
    if (section === 'hooks') return 'Hook'
    if (section === 'mcp') return 'MCP'
    return 'Instruction'
}

function packageDragTitle(section: PackageCardSection) {
    if (section === 'agents') return 'Drag to the canvas to add this Agent package.'
    if (section === 'skills') return 'Drag onto an Agent Skills card.'
    if (section === 'prompts') return 'Prompt packages are synced from Export.'
    if (section === 'commands') return 'Command packages are synced from Export.'
    if (section === 'hooks') return 'Hook packages are synced from Export.'
    if (section === 'mcp') return 'Drag onto an Agent MCP card.'
    return 'Instruction packages are standalone project/file rules.'
}

function packageKindForSection(section: PackageCardSection) {
    if (section === 'agents') return 'agent'
    if (section === 'skills') return 'skill'
    if (section === 'prompts') return 'prompt'
    if (section === 'commands') return 'command'
    if (section === 'hooks') return 'hook'
    if (section === 'mcp') return 'mcp'
    return 'instruction'
}

function usefulPackageDescription(pkg: ScopedApmPackageSummary, title: string, fallback: string) {
    const description = pkg.description?.trim()
    if (!description) return null
    if (description === `${title} ${pkg.kind} package for APM Studio.`) return null
    if (description === fallback) return null
    return description
}

function packageEmptyMessage(section: PackageCardSection) {
    if (section === 'agents') return 'No Agent packages found.'
    if (section === 'skills') return 'No Skill packages found.'
    if (section === 'prompts') return 'No Prompt packages found.'
    if (section === 'commands') return 'No Command packages found.'
    if (section === 'hooks') return 'No Hook packages found.'
    if (section === 'mcp') return 'No MCP packages found.'
    return 'No Instruction packages found.'
}

function PackageRow({
    onSelectPackage,
    pkg,
    primitiveSection,
    selected,
}: {
    onSelectPackage?: (pkg: ScopedApmPackageSummary) => void
    pkg: ScopedApmPackageSummary
    primitiveSection: PackageCardSection
    selected: boolean
}) {
    const warnings = pkg.microsoftApm?.warnings || []
    const title = apmPackageTitle(pkg)
    const primitives = apmPackagePrimitiveSummary(pkg)
    const primitiveEntries = apmPackagePrimitiveEntries(pkg)
    const cardLabel = packageCardLabel(primitiveSection)
    const packagePath = pkg.microsoftApm?.packageRoot || pkg.manifestPath || 'package root unavailable'
    const description = usefulPackageDescription(pkg, title, primitives)
    const dragDisabled = primitiveSection !== 'agents' && primitiveSection !== 'skills' && primitiveSection !== 'mcp'
    const dragPayload = useMemo(() => ({
        ...buildApmPackageDragPayload(pkg),
        packageKind: packageKindForSection(primitiveSection),
    }), [pkg, primitiveSection])
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `apm-package-${primitiveSection}-${pkg.scope}-${pkg.packageId}`,
        data: dragPayload,
        disabled: dragDisabled,
    })
    const selectPackage = () => onSelectPackage?.(pkg)

    return (
        <div
            ref={setNodeRef}
            className={`package-card package-summary-card ${isDragging ? 'is-dragging' : ''} ${selected ? 'is-selected' : ''} ${dragDisabled ? 'is-static' : ''}`}
            title={`${packageDragTitle(primitiveSection)} ${pkg.packageId} · ${packagePath}`}
            role="button"
            tabIndex={0}
            onClick={selectPackage}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectPackage()
                }
            }}
        >
            <div className="package-card__header">
                <span
                    className={`package-card__drag-handle ${dragDisabled ? 'is-disabled' : ''}`}
                    title={dragDisabled ? undefined : packageDragTitle(primitiveSection)}
                    {...(!dragDisabled ? attributes : {})}
                    {...(!dragDisabled ? listeners : {})}
                    onClick={(event) => event.stopPropagation()}
                >
                    <GripVertical size={10} className="drag-handle" />
                </span>
                {packageIcon(primitiveSection)}
                <span className="package-card__name" title={title}>{title}</span>
                {warnings.length > 0 ? (
                    <span className="primitive-sync-badge package-summary-card__warning" title={warnings.join('\n')}>
                        {warnings.length} warn
                    </span>
                ) : null}
                <span className={`source-badge ${pkg.scope}`}>{pkg.scope}</span>
            </div>
            <div className="package-card__author" title={pkg.packageId}>
                {cardLabel}
            </div>
            {description ? (
                <div className="package-card__desc" title={description}>
                    {description}
                </div>
            ) : null}
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
        </div>
    )
}

export default function PackageLibraryPackageList({
    primitiveSection,
    packages,
    loading,
    selectedPackageKey,
    onSelectPackage,
}: Props) {
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
                        onSelectPackage={onSelectPackage}
                        pkg={pkg}
                        primitiveSection={primitiveSection}
                        selected={`${pkg.scope}:${pkg.packageId}` === selectedPackageKey}
                    />
                ))}
            </div>
        </div>
    )
}
