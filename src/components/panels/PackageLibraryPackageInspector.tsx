import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    CheckCircle2,
    Copy,
    FileText,
    Loader2,
    LockKeyhole,
    RefreshCw,
    Save,
    ShieldCheck,
    Trash2,
    X,
} from 'lucide-react'
import { parse } from 'yaml'
import type {
    ApmPackageManifest,
    ApmPackageReadResponse,
    ApmPackageScope,
    ApmAuditStatus,
    ApmPrimitiveFileListResponse,
    ApmPrimitiveFileReadResponse,
    ApmValidationResult,
} from '../../../shared/apm-contracts'
import { apmApi } from '../../api-clients/apm'
import { formatStudioApiErrorMessage } from '../../lib/api-errors'
import { showToast } from '../../lib/toast'
import type { ScopedApmPackageSummary } from './package-panel-types'
import {
    apmPackagePrimitiveEntries,
    apmPackagePrimitiveSummary,
    apmPackageTitle,
} from './package-library-packages'
import {
    auditStatusLabel,
    auditStatusMessage,
    auditStatusTone,
    canRegenerateLock,
    groupPrimitiveFiles,
    lockStatusLabel,
    lockStatusTone,
    primitiveFileStatus,
    type InspectorTone,
} from './package-inspector-model'

type BusyAction =
    | 'load'
    | 'validate'
    | 'save'
    | 'copy'
    | 'delete'
    | 'refresh'
    | 'regenerate-lock'
    | 'load-primitive'
    | 'audit'
    | null

type InspectorTab = 'overview' | 'manifest' | 'primitives'

type InspectorStatus = {
    tone: InspectorTone
    message: string
}

function oppositeScope(scope: ApmPackageScope): ApmPackageScope {
    return scope === 'user' ? 'workspace' : 'user'
}

function scopeLabel(scope: ApmPackageScope) {
    return scope === 'user' ? 'User' : 'Workspace'
}

function parseManifestYaml(manifestYaml: string): ApmPackageManifest {
    const parsed = parse(manifestYaml)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Manifest YAML must be an object.')
    }
    return parsed as ApmPackageManifest
}

function validationMessage(validation: ApmValidationResult) {
    if (!validation.valid) {
        return validation.errors.join(' ')
    }
    if (validation.warnings.length > 0) {
        return validation.warnings.join(' ')
    }
    return 'Manifest is valid.'
}

function formatBytes(value: number) {
    if (value < 1024) return `${value} B`
    return `${Math.round(value / 102.4) / 10} KB`
}

function packageRows(pkg: ScopedApmPackageSummary, loadedPackage: ApmPackageReadResponse | null) {
    return [
        ['Package ID', pkg.packageId],
        ['Kind', pkg.kind],
        ['Version', pkg.version || 'None'],
        ['Manifest', pkg.manifestPath || 'Unavailable'],
        ['Lock', pkg.lockPath || 'Unavailable'],
        ['Root', pkg.microsoftApm?.packageRoot || 'Unavailable'],
        ['Source', pkg.microsoftApm?.sourceDir || 'Unavailable'],
        ['Manifest hash', loadedPackage?.manifestHash || 'Not loaded'],
        ['Source tree hash', loadedPackage?.sourceTreeHash || 'Not available'],
    ]
}

export default function PackageLibraryPackageInspector({
    pkg,
    onClose,
    onDeleted,
}: {
    pkg: ScopedApmPackageSummary
    onClose: () => void
    onDeleted: () => void
}) {
    const queryClient = useQueryClient()
    const [busyAction, setBusyAction] = useState<BusyAction>('load')
    const [activeTab, setActiveTab] = useState<InspectorTab>('overview')
    const [loadedPackage, setLoadedPackage] = useState<ApmPackageReadResponse | null>(null)
    const [primitiveList, setPrimitiveList] = useState<ApmPrimitiveFileListResponse | null>(null)
    const [selectedPrimitivePath, setSelectedPrimitivePath] = useState<string | null>(null)
    const [loadedPrimitive, setLoadedPrimitive] = useState<ApmPrimitiveFileReadResponse | null>(null)
    const [apmAudit, setApmAudit] = useState<ApmAuditStatus | null>(null)
    const [manifestYaml, setManifestYaml] = useState('')
    const [status, setStatus] = useState<InspectorStatus | null>(null)
    const [deletePending, setDeletePending] = useState(false)
    const title = apmPackageTitle(pkg)
    const destinationScope = oppositeScope(pkg.scope)
    const dirty = loadedPackage ? manifestYaml !== loadedPackage.manifestYaml : false
    const primitiveEntries = useMemo(() => apmPackagePrimitiveEntries(pkg), [pkg])
    const primitiveSummary = apmPackagePrimitiveSummary(pkg)
    const selectedPrimitiveSummary = primitiveList?.files.find((file) => file.path === selectedPrimitivePath) || null
    const primitiveGroups = useMemo(() => groupPrimitiveFiles(primitiveList?.files || []), [primitiveList])
    const lockTone = lockStatusTone(loadedPackage?.lockStatus)
    const auditTone = auditStatusTone(apmAudit)
    const failedAuditChecks = useMemo(
        () => (apmAudit?.checks || []).filter((check) => !check.passed),
        [apmAudit],
    )
    const showAuditDetails = Boolean(apmAudit?.command || failedAuditChecks.length > 0 || apmAudit?.drift.length)

    const invalidatePackages = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: ['apm-packages'] })
    }, [queryClient])

    const loadPackage = useCallback(async (action: BusyAction = 'load') => {
        try {
            setBusyAction(action)
            setStatus(null)
            setDeletePending(false)
            setLoadedPrimitive(null)
            const packagePromise = action === 'refresh'
                ? apmApi.syncPackageSource(pkg.packageId, pkg.scope)
                : apmApi.readPackage(pkg.packageId, pkg.scope)
            const [packageResponse, primitivesResponse] = await Promise.all([
                packagePromise,
                apmApi.listPackagePrimitives(pkg.packageId, pkg.scope),
            ])
            setLoadedPackage(packageResponse)
            setManifestYaml(packageResponse.manifestYaml)
            setPrimitiveList(primitivesResponse)
            setSelectedPrimitivePath((current) => {
                if (current && primitivesResponse.files.some((file) => file.path === current)) return current
                return primitivesResponse.files[0]?.path || null
            })
            const sourceSynced = 'synced' in packageResponse && packageResponse.synced === true
            setStatus({
                tone: sourceSynced ? 'success' : 'info',
                message: action === 'refresh'
                    ? (sourceSynced ? 'External Agent source changes synced into apm.yml.' : 'Package refreshed from disk.')
                    : 'Package loaded.',
            })
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setBusyAction(null)
        }
    }, [pkg.packageId, pkg.scope])

    useEffect(() => {
        void loadPackage('load')
    }, [loadPackage])

    const loadPrimitive = useCallback(async (filePath: string) => {
        try {
            setBusyAction('load-primitive')
            const response = await apmApi.readPackagePrimitive(pkg.packageId, filePath, pkg.scope)
            setLoadedPrimitive(response)
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setBusyAction(null)
        }
    }, [pkg.packageId, pkg.scope])

    useEffect(() => {
        if (!selectedPrimitivePath) {
            setLoadedPrimitive(null)
            return
        }
        void loadPrimitive(selectedPrimitivePath)
    }, [loadPrimitive, selectedPrimitivePath])

    const validateManifest = async () => {
        try {
            setBusyAction('validate')
            const manifest = parseManifestYaml(manifestYaml)
            const validation = await apmApi.validate(manifest)
            setStatus({
                tone: validation.valid ? 'success' : 'error',
                message: validationMessage(validation),
            })
            return validation.valid ? manifest : null
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
            return null
        } finally {
            setBusyAction(null)
        }
    }

    const saveManifest = async () => {
        const manifest = await validateManifest()
        if (!manifest) return
        try {
            setBusyAction('save')
            const saved = await apmApi.writePackage(pkg.packageId, {
                manifest,
                baseManifestHash: loadedPackage?.manifestHash,
            }, pkg.scope)
            setLoadedPackage(saved)
            setManifestYaml(saved.manifestYaml)
            await invalidatePackages()
            setStatus({ tone: 'success', message: 'Package saved and lock regenerated.' })
            showToast(`Saved ${title}.`, 'success', { title: 'APM package updated' })
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setBusyAction(null)
        }
    }

    const regenerateLock = async () => {
        try {
            setBusyAction('regenerate-lock')
            const saved = await apmApi.regeneratePackageLock(pkg.packageId, loadedPackage?.manifestHash, pkg.scope)
            setLoadedPackage(saved)
            setManifestYaml(saved.manifestYaml)
            await invalidatePackages()
            setStatus({ tone: 'success', message: 'Lock regenerated from current manifest.' })
            showToast(`Regenerated lock for ${title}.`, 'success', { title: 'APM lock updated' })
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setBusyAction(null)
        }
    }

    const runAudit = async () => {
        try {
            setBusyAction('audit')
            const response = await apmApi.audit()
            setApmAudit(response.audit)
            setStatus({
                tone: auditStatusTone(response.audit),
                message: auditStatusMessage(response.audit),
            })
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setBusyAction(null)
        }
    }

    const copyPackage = async () => {
        try {
            setBusyAction('copy')
            await apmApi.copyPackage({
                packageId: pkg.packageId,
                fromScope: pkg.scope,
                toScope: destinationScope,
            })
            await invalidatePackages()
            setStatus({ tone: 'success', message: `Copied to ${scopeLabel(destinationScope)}.` })
            showToast(`Copied ${title} to ${scopeLabel(destinationScope)}.`, 'success', { title: 'APM package copied' })
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setBusyAction(null)
        }
    }

    const deletePackage = async () => {
        if (!deletePending) {
            setDeletePending(true)
            setStatus({ tone: 'info', message: 'Click Delete again to remove this package from this scope.' })
            return
        }

        try {
            setBusyAction('delete')
            await apmApi.deletePackage(pkg.packageId, pkg.scope)
            await invalidatePackages()
            showToast(`Deleted ${title} from ${scopeLabel(pkg.scope)}.`, 'success', { title: 'APM package deleted' })
            onDeleted()
        } catch (error) {
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setBusyAction(null)
        }
    }

    const selectPrimitive = (filePath: string) => {
        setSelectedPrimitivePath(filePath)
    }

    return (
        <aside className="package-inspector" aria-label={`${title} package inspector`}>
            <div className="package-inspector__header">
                <div className="package-inspector__title-block">
                    <span className="section-title">Package</span>
                    <strong title={title}>{title}</strong>
                    <span className={`source-badge ${pkg.scope}`}>{scopeLabel(pkg.scope)}</span>
                </div>
                <button type="button" className="icon-btn" onClick={onClose} title="Close package inspector">
                    <X size={13} />
                </button>
            </div>

            <div className="package-inspector__summary">
                <span>{primitiveSummary}</span>
            </div>

            <div className="package-inspector__tabs" role="tablist" aria-label="Package inspector sections">
                {([
                    ['overview', 'Overview'],
                    ['manifest', 'Manifest'],
                    ['primitives', 'Primitives'],
                ] as const).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        className={`tab ${activeTab === key ? 'active' : ''}`}
                        onClick={() => setActiveTab(key)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="package-inspector__actions">
                <button type="button" className="btn btn--sm" onClick={() => void loadPackage('refresh')} disabled={!!busyAction}>
                    {busyAction === 'refresh' || busyAction === 'load' ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
                    Refresh
                </button>
                {activeTab === 'manifest' ? (
                    <>
                        <button type="button" className="btn btn--sm" onClick={() => void validateManifest()} disabled={!!busyAction || !manifestYaml.trim()}>
                            {busyAction === 'validate' ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />}
                            Validate
                        </button>
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => void saveManifest()} disabled={!!busyAction || !dirty || !manifestYaml.trim()}>
                            {busyAction === 'save' ? <Loader2 size={12} className="spin" /> : <Save size={12} />}
                            Save
                        </button>
                    </>
                ) : null}
                {canRegenerateLock(loadedPackage?.lockStatus) ? (
                    <button type="button" className="btn btn--sm" onClick={() => void regenerateLock()} disabled={!!busyAction || dirty}>
                        {busyAction === 'regenerate-lock' ? <Loader2 size={12} className="spin" /> : <LockKeyhole size={12} />}
                        Regenerate lock
                    </button>
                ) : null}
                {activeTab === 'overview' ? (
                    <button type="button" className="btn btn--sm" onClick={() => void runAudit()} disabled={!!busyAction}>
                        {busyAction === 'audit' ? <Loader2 size={12} className="spin" /> : <ShieldCheck size={12} />}
                        APM audit
                    </button>
                ) : null}
                <button type="button" className="btn btn--sm" onClick={() => void copyPackage()} disabled={!!busyAction}>
                    {busyAction === 'copy' ? <Loader2 size={12} className="spin" /> : <Copy size={12} />}
                    Copy to {scopeLabel(destinationScope)}
                </button>
                <button type="button" className={`btn btn--sm ${deletePending ? 'btn--danger' : ''}`} onClick={() => void deletePackage()} disabled={!!busyAction}>
                    {busyAction === 'delete' ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                    {deletePending ? 'Delete' : 'Remove'}
                </button>
            </div>

            <div className="package-inspector__body">
                {activeTab === 'overview' ? (
                    <div className="package-inspector__overview">
                        <div className={`alert package-inspector__lock package-inspector__status--${lockTone}`}>
                            <LockKeyhole size={12} />
                            <span>{lockStatusLabel(loadedPackage?.lockStatus)}</span>
                            {loadedPackage?.lockStatus?.message ? <small>{loadedPackage.lockStatus.message}</small> : null}
                        </div>

                        <div className={`alert package-inspector__lock package-inspector__status--${auditTone}`}>
                            <ShieldCheck size={12} />
                            <span>{auditStatusLabel(apmAudit)}</span>
                            <small>{auditStatusMessage(apmAudit)}</small>
                        </div>

                        {primitiveEntries.length > 0 ? (
                            <div className="package-summary-card__primitive-map package-inspector__chips">
                                {primitiveEntries.map((entry) => (
                                    <span key={entry.key} className={`package-summary-card__primitive-chip package-summary-card__primitive-chip--${entry.key}`}>
                                        <span>{entry.label}</span>
                                        <strong>{entry.count}</strong>
                                    </span>
                                ))}
                            </div>
                        ) : null}

                        {showAuditDetails ? (
                            <details className="package-inspector__details">
                                <summary>Audit details</summary>
                                {apmAudit?.command ? (
                                    <div className="package-inspector__meta-grid">
                                        <div className="list-row package-inspector__meta-row">
                                            <span>Command</span>
                                            <strong title={apmAudit.command}>{apmAudit.command}</strong>
                                        </div>
                                        <div className="list-row package-inspector__meta-row">
                                            <span>Runner</span>
                                            <strong>{apmAudit.runner || 'APM CLI'}</strong>
                                        </div>
                                        <div className="list-row package-inspector__meta-row">
                                            <span>Checked</span>
                                            <strong>{apmAudit.checkedAt}</strong>
                                        </div>
                                    </div>
                                ) : null}

                                {failedAuditChecks.length > 0 ? (
                                    <div className="package-inspector__meta-grid">
                                        {failedAuditChecks.slice(0, 4).map((check) => (
                                            <div className="list-row package-inspector__meta-row" key={check.name}>
                                                <span>{check.name}</span>
                                                <strong title={[check.message, ...check.details].filter(Boolean).join(' ')}>
                                                    {check.details[0] || check.message || 'Failed'}
                                                </strong>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                {apmAudit?.drift.length ? (
                                    <div className="package-inspector__meta-grid">
                                        {apmAudit.drift.slice(0, 4).map((finding) => (
                                            <div className="list-row package-inspector__meta-row" key={`${finding.kind}:${finding.path}`}>
                                                <span>{finding.kind}</span>
                                                <strong title={finding.path}>{finding.path}</strong>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </details>
                        ) : null}

                        <details className="package-inspector__details">
                            <summary>Package metadata</summary>
                            <div className="package-inspector__meta-grid">
                                {packageRows(pkg, loadedPackage).map(([label, value]) => (
                                    <div className="list-row package-inspector__meta-row" key={label}>
                                        <span>{label}</span>
                                        <strong title={value}>{value}</strong>
                                    </div>
                                ))}
                            </div>
                        </details>

                        {pkg.microsoftApm?.warnings?.length ? (
                            <div className="alert alert--muted package-inspector__warning-list">
                                {pkg.microsoftApm.warnings.map((warning) => <span key={warning}>{warning}</span>)}
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {activeTab === 'manifest' ? (
                    <div className="package-inspector__manifest">
                        <label className="package-inspector__editor">
                            <span className="section-title">apm.yml</span>
                            <textarea
                                className="input package-inspector__textarea"
                                value={manifestYaml}
                                onChange={(event) => {
                                    setManifestYaml(event.target.value)
                                    setDeletePending(false)
                                }}
                                spellCheck={false}
                                disabled={busyAction === 'load'}
                            />
                        </label>
                        <label className="package-inspector__editor package-inspector__editor--lock">
                            <span className="section-title">Read-only apm.lock.yaml</span>
                            <textarea
                                className="input package-inspector__textarea"
                                value={loadedPackage?.lockYaml || ''}
                                placeholder="Lock file is missing or unavailable."
                                readOnly
                                spellCheck={false}
                            />
                        </label>
                    </div>
                ) : null}

                {activeTab === 'primitives' ? (
                    <div className="package-inspector__primitive-pane">
                        <div className="package-inspector__primitive-list" aria-label="Primitive source files">
                            {primitiveGroups.length === 0 ? (
                                <div className="empty-state compact">No supported primitive source files found.</div>
                            ) : primitiveGroups.map((group) => (
                                <div className="package-inspector__primitive-group" key={group.kind}>
                                    <span className="section-title">{group.label}</span>
                                    {group.files.map((file) => (
                                        <button
                                            key={file.path}
                                            type="button"
                                            className={`list-row package-inspector__primitive-row ${selectedPrimitivePath === file.path ? 'active' : ''}`}
                                            onClick={() => selectPrimitive(file.path)}
                                            title={file.path}
                                        >
                                            <FileText size={12} />
                                            <span>{file.label}</span>
                                            <small>{formatBytes(file.size)}</small>
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="package-inspector__primitive-editor">
                            <div className="package-inspector__primitive-editor-header">
                                <span className="section-title" title={loadedPrimitive?.path || selectedPrimitivePath || undefined}>
                                    {loadedPrimitive?.path || selectedPrimitivePath || 'Primitive'}
                                </span>
                                {selectedPrimitiveSummary ? (
                                    <span className="badge badge--subtle">Read-only</span>
                                ) : null}
                            </div>
                            <div className="alert alert--muted package-inspector__primitive-note">
                                {primitiveFileStatus(loadedPrimitive || selectedPrimitiveSummary)}
                            </div>
                            <textarea
                                className="input package-inspector__textarea"
                                value={loadedPrimitive?.content || ''}
                                readOnly
                                spellCheck={false}
                                disabled={busyAction === 'load-primitive'}
                                placeholder={busyAction === 'load-primitive' ? 'Loading primitive source...' : 'Select a primitive source file.'}
                            />
                        </div>
                    </div>
                ) : null}
            </div>

            {status ? (
                <div className={`alert package-inspector__status package-inspector__status--${status.tone}`}>
                    {status.message}
                </div>
            ) : null}
        </aside>
    )
}
