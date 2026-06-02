import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileSearch, X } from 'lucide-react'
import {
    ASSET_DETAIL_TABS,
    type AssetDetailModel,
    type AssetDetailNoticeTone,
    type AssetDetailSection,
    type AssetDetailTabId,
} from './asset-detail-types'
import './AssetDetailsModal.css'

const DEFAULT_DETAIL_TAB: AssetDetailTabId = 'metadata'

function noticeClass(tone: AssetDetailNoticeTone | undefined) {
    if (tone === 'danger') return 'alert--danger'
    if (tone === 'warning') return 'alert--muted'
    return 'alert--muted'
}

function sectionTab(section: AssetDetailSection): AssetDetailTabId {
    return section.tab || DEFAULT_DETAIL_TAB
}

function renderDetailSection(section: AssetDetailSection) {
    return (
        <section key={`${sectionTab(section)}:${section.title}`} className="asset-details-modal__section">
            <h3 className="section-title">{section.title}</h3>

            {section.notices?.map((notice) => (
                <div key={notice.text} className={`alert ${noticeClass(notice.tone)} asset-details-modal__notice`}>
                    {notice.text}
                </div>
            ))}

            {section.badges?.length ? (
                <div className="asset-details-modal__badges">
                    {section.badges.map((badge) => (
                        <span key={badge} className="badge badge--subtle">{badge}</span>
                    ))}
                </div>
            ) : null}

            {section.rows?.length ? (
                <dl className="asset-details-modal__rows">
                    {section.rows.map((row) => (
                        <div key={`${row.label}:${row.value}`} className="asset-details-modal__row">
                            <dt>{row.label}</dt>
                            <dd className={row.mono ? 'is-mono' : undefined}>{row.value}</dd>
                        </div>
                    ))}
                </dl>
            ) : null}

            {section.lists?.map((list) => (
                <div key={list.label} className="asset-details-modal__list">
                    <div className="asset-details-modal__list-label">{list.label}</div>
                    <ul>
                        {list.values.map((value) => (
                            <li key={value} className={list.mono ? 'is-mono' : undefined}>{value}</li>
                        ))}
                    </ul>
                </div>
            ))}

            {section.codeBlocks?.map((block) => (
                <div key={block.label} className="asset-details-modal__code">
                    <div className="asset-details-modal__list-label">{block.label}</div>
                    <pre>{block.value}</pre>
                </div>
            ))}
        </section>
    )
}

export function AssetDetailsModal({
    model,
    onClose,
}: {
    model: AssetDetailModel
    onClose: () => void
}) {
    const tabGroups = useMemo(() => ASSET_DETAIL_TABS
        .map((tab) => ({
            ...tab,
            sections: model.sections.filter((section) => sectionTab(section) === tab.id),
        }))
        .filter((tab) => tab.sections.length > 0), [model.sections])
    const firstTabId = tabGroups[0]?.id || DEFAULT_DETAIL_TAB
    const [selectedTab, setSelectedTab] = useState<AssetDetailTabId>(firstTabId)
    const activeTab = tabGroups.some((tab) => tab.id === selectedTab) ? selectedTab : firstTabId
    const activeTabGroup = tabGroups.find((tab) => tab.id === activeTab) || tabGroups[0]

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <section
                className="modal-dialog asset-details-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${model.title} details`}
                onClick={(event) => event.stopPropagation()}
            >
                <header className="modal-dialog__header asset-details-modal__header">
                    <div className="asset-details-modal__title">
                        <FileSearch size={15} />
                        <div>
                            <h2>{model.title}</h2>
                            {model.subtitle ? <p>{model.subtitle}</p> : null}
                        </div>
                    </div>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
                        <X size={14} />
                    </button>
                </header>

                <div className="modal-dialog__body asset-details-modal__body">
                    {model.description ? (
                        <p className="asset-details-modal__description">{model.description}</p>
                    ) : null}

                    {model.badges?.length ? (
                        <div className="asset-details-modal__badges" aria-label="Detail badges">
                            {model.badges.map((badge) => (
                                <span key={badge} className="badge badge--subtle">{badge}</span>
                            ))}
                        </div>
                    ) : null}

                    {tabGroups.length > 1 ? (
                        <div className="asset-details-modal__tabs" role="tablist" aria-label="Detail sections">
                            {tabGroups.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={`tab asset-details-modal__tab ${tab.id === activeTab ? 'active' : ''}`.trim()}
                                    role="tab"
                                    aria-selected={tab.id === activeTab}
                                    aria-controls={`asset-details-${tab.id}-panel`}
                                    id={`asset-details-${tab.id}-tab`}
                                    onClick={() => setSelectedTab(tab.id)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {activeTabGroup ? (
                        <div
                            className="asset-details-modal__tab-panel"
                            role="tabpanel"
                            id={`asset-details-${activeTabGroup.id}-panel`}
                            aria-labelledby={tabGroups.length > 1 ? `asset-details-${activeTabGroup.id}-tab` : undefined}
                        >
                            <div className="asset-details-modal__sections">
                                {activeTabGroup.sections.map(renderDetailSection)}
                            </div>
                        </div>
                    ) : null}
                </div>
            </section>
        </div>,
        document.body,
    )
}
