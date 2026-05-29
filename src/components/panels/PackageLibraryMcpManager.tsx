import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { McpServerSummary } from '../../../shared/opencode-contracts'
import Tip from '../../features/team/Tip'
import { McpEditableCard } from './PackageLibraryMcpCard'
import {
    cloneMcpDraftEntries,
    createMcpEntryDraft as createBlankMcpEntryDraft,
    type McpEntryDraft,
} from './mcp-catalog-utils'
import type { McpCatalogState } from './useMcpCatalog'

type Props = {
    liveMcps: McpServerSummary[]
    mcpEntries: McpEntryDraft[]
    mcpCatalogStatus: string | null
    mcpCatalogSaving: boolean
    runtimeReloadPending: boolean
    pendingMcpAuthName: string | null
    createMcpEntryDraft: McpCatalogState['createMcpEntryDraft']
    saveMcpEntry: McpCatalogState['saveMcpEntry']
    deleteMcpEntry: McpCatalogState['deleteMcpEntry']
    connectMcpServer: (name: string) => Promise<void>
    startMcpAuthFlow: (name: string) => Promise<void>
    clearMcpAuth: (name: string) => Promise<void>
}

function cloneEntry(entry: McpEntryDraft) {
    return cloneMcpDraftEntries([entry])[0]
}

function entriesMatch(left: McpEntryDraft, right: McpEntryDraft) {
    return JSON.stringify(left) === JSON.stringify(right)
}

export default function PackageLibraryMcpManager({
    liveMcps,
    mcpEntries,
    mcpCatalogStatus,
    mcpCatalogSaving,
    runtimeReloadPending,
    pendingMcpAuthName,
    createMcpEntryDraft,
    saveMcpEntry,
    deleteMcpEntry,
    connectMcpServer,
    startMcpAuthFlow,
    clearMcpAuth,
}: Props) {
    const [editorDraft, setEditorDraft] = useState<McpEntryDraft | null>(null)
    const savedEntriesByKey = useMemo(
        () => new Map(mcpEntries.map((entry) => [entry.key, entry])),
        [mcpEntries],
    )
    const activeSavedEntry = editorDraft ? savedEntriesByKey.get(editorDraft.key) || null : null
    const activeBaseline = editorDraft
        ? activeSavedEntry || createBlankMcpEntryDraft(editorDraft.key)
        : null
    const editorDirty = !!editorDraft && !!activeBaseline && !entriesMatch(editorDraft, activeBaseline)
    const renderedEntries = useMemo(() => {
        if (!editorDraft) {
            return mcpEntries
        }

        if (savedEntriesByKey.has(editorDraft.key)) {
            return mcpEntries.map((entry) => entry.key === editorDraft.key ? editorDraft : entry)
        }

        return [editorDraft, ...mcpEntries]
    }, [editorDraft, mcpEntries, savedEntriesByKey])
    const statusMessage = mcpCatalogSaving ? 'Saving MCP changes...' : mcpCatalogStatus
    const runtimePendingMessage = runtimeReloadPending
        ? 'Runtime reload pending. MCP changes apply after current sessions go idle.'
        : null

    const beginNewEntry = () => {
        if (editorDirty) {
            return
        }
        setEditorDraft(createMcpEntryDraft())
    }

    const beginEditEntry = (entry: McpEntryDraft) => {
        if (editorDirty && editorDraft?.key !== entry.key) {
            return
        }
        setEditorDraft(cloneEntry(entry))
    }

    const handleDiscard = () => {
        if (!editorDraft) {
            return
        }

        if (activeSavedEntry) {
            setEditorDraft(cloneEntry(activeSavedEntry))
            return
        }

        setEditorDraft(null)
    }

    const handleSave = async () => {
        if (!editorDraft) {
            return
        }
        await saveMcpEntry(editorDraft)
    }

    const handleDelete = async () => {
        if (!editorDraft) {
            return
        }

        if (!activeSavedEntry) {
            setEditorDraft(null)
            return
        }

        const confirmed = window.confirm(`Delete MCP server '${activeSavedEntry.name.trim() || 'Unnamed MCP'}'?`)
        if (!confirmed) {
            return
        }

        const deleted = await deleteMcpEntry(activeSavedEntry.key)
        if (deleted) {
            setEditorDraft(null)
        }
    }

    const handleCollapse = () => {
        if (editorDirty) {
            return
        }
        setEditorDraft(null)
    }

    return (
        <div className="package-mcp-manager">
            <div className="package-authoring-row">
                <button
                    className="btn"
                    type="button"
                    onClick={beginNewEntry}
                    disabled={editorDirty}
                    title={editorDirty ? 'Save or discard the open server first' : 'Create a new MCP server'}
                >
                    <Plus size={10} /> New Server
                </button>
                <div className="package-authoring-row__note package-authoring-row__note--compact">
                    Card actions run on saved config.
                    <Tip text="Each MCP card saves independently. Test, auth, and agent drag actions always use the saved server config." />
                </div>
            </div>

            {renderedEntries.length > 0 ? (
                <div className="package-mcp-editor-list">
                    {renderedEntries.map((entry) => {
                        const savedEntry = savedEntriesByKey.get(entry.key) || null
                        const lookupName = savedEntry?.name.trim() || entry.name.trim()
                        const live = lookupName
                            ? liveMcps.find((server) => server.name === lookupName) || null
                            : null
                        const isActive = editorDraft?.key === entry.key
                        const interactionLocked = !!editorDirty && editorDraft?.key !== entry.key

                        return (
                            <McpEditableCard
                                key={entry.key}
                                entry={entry}
                                savedEntry={savedEntry}
                                live={live}
                                isActive={isActive}
                                isDirty={isActive ? editorDirty : false}
                                interactionLocked={interactionLocked}
                                mcpCatalogSaving={mcpCatalogSaving}
                                pendingMcpAuthName={pendingMcpAuthName}
                                onEdit={() => beginEditEntry(savedEntry || entry)}
                                onChange={setEditorDraft}
                                onSave={handleSave}
                                onDiscard={handleDiscard}
                                onDelete={handleDelete}
                                onCollapse={handleCollapse}
                                connectMcpServer={connectMcpServer}
                                startMcpAuthFlow={startMcpAuthFlow}
                                clearMcpAuth={clearMcpAuth}
                            />
                        )
                    })}
                </div>
            ) : (
                <div className="package-authoring-hint">No MCP servers yet.</div>
            )}

            {statusMessage ? <div className="package-authoring-hint">{statusMessage}</div> : null}
            {runtimePendingMessage ? <div className="package-authoring-hint">{runtimePendingMessage}</div> : null}
        </div>
    )
}
