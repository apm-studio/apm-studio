export type AssetDetailNoticeTone = 'muted' | 'warning' | 'danger'
export type AssetDetailTabId = 'content' | 'metadata' | 'other'

export type AssetDetailTabDefinition = {
    id: AssetDetailTabId
    label: string
}

export const ASSET_DETAIL_TABS: AssetDetailTabDefinition[] = [
    { id: 'content', label: 'Content' },
    { id: 'metadata', label: 'Metadata' },
    { id: 'other', label: 'Other' },
]

export type AssetDetailRow = {
    label: string
    value: string
    mono?: boolean
}

export type AssetDetailList = {
    label: string
    values: string[]
    mono?: boolean
}

export type AssetDetailNotice = {
    tone?: AssetDetailNoticeTone
    text: string
}

export type AssetDetailCodeBlock = {
    label: string
    value: string
}

export type AssetDetailSection = {
    title: string
    tab?: AssetDetailTabId
    rows?: AssetDetailRow[]
    badges?: string[]
    lists?: AssetDetailList[]
    notices?: AssetDetailNotice[]
    codeBlocks?: AssetDetailCodeBlock[]
}

export type AssetDetailModel = {
    title: string
    subtitle?: string
    description?: string
    badges?: string[]
    sections: AssetDetailSection[]
}
