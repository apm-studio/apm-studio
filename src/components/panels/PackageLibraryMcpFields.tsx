import { Plus, Trash2 } from 'lucide-react'
import type { McpEntryDraft, McpKVPair } from './mcp-catalog-utils'

function StringListField({
    label,
    items,
    addLabel,
    placeholder,
    onChange,
}: {
    label: string
    items: string[]
    addLabel: string
    placeholder?: string
    onChange: (items: string[]) => void
}) {
    return (
        <div className="package-mcp-list-field">
            <span className="package-mcp-list-field__label">{label}</span>
            {items.map((item, index) => (
                <div key={`${label}-${index}`} className="package-mcp-list-row">
                    <input
                        className="text-input"
                        value={item}
                        placeholder={placeholder}
                        onChange={(event) => {
                            const next = [...items]
                            next[index] = event.target.value
                            onChange(next)
                        }}
                    />
                    <button
                        className="icon-btn"
                        type="button"
                        title="Remove"
                        onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            ))}
            <button
                className="text-btn package-mcp-list-field__add"
                type="button"
                onClick={() => onChange([...items, ''])}
            >
                <Plus size={10} /> {addLabel}
            </button>
        </div>
    )
}

function KVListField({
    label,
    items,
    addLabel,
    keyPlaceholder,
    valuePlaceholder,
    onChange,
}: {
    label: string
    items: McpKVPair[]
    addLabel: string
    keyPlaceholder?: string
    valuePlaceholder?: string
    onChange: (items: McpKVPair[]) => void
}) {
    return (
        <div className="package-mcp-list-field">
            <span className="package-mcp-list-field__label">{label}</span>
            {items.map((item, index) => (
                <div key={`${label}-${index}`} className="package-mcp-list-row package-mcp-list-row--kv">
                    <input
                        className="text-input"
                        value={item.key}
                        placeholder={keyPlaceholder || 'Key'}
                        onChange={(event) => {
                            const next = [...items]
                            next[index] = { ...item, key: event.target.value }
                            onChange(next)
                        }}
                    />
                    <input
                        className="text-input"
                        value={item.value}
                        placeholder={valuePlaceholder || 'Value'}
                        onChange={(event) => {
                            const next = [...items]
                            next[index] = { ...item, value: event.target.value }
                            onChange(next)
                        }}
                    />
                    <button
                        className="icon-btn"
                        type="button"
                        title="Remove"
                        onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            ))}
            <button
                className="text-btn package-mcp-list-field__add"
                type="button"
                onClick={() => onChange([...items, { key: '', value: '' }])}
            >
                <Plus size={10} /> {addLabel}
            </button>
        </div>
    )
}

export function McpEntryBody({
    entry,
    onChange,
}: {
    entry: McpEntryDraft
    onChange: (entry: McpEntryDraft) => void
}) {
    const update = (updater: (draft: McpEntryDraft) => McpEntryDraft) => onChange(updater(entry))
    const isHttp = entry.transport === 'http'

    return (
        <div className="package-mcp-editor__body">
            <div className="package-mcp-tabs">
                <button
                    className={`package-mcp-tab${entry.transport === 'stdio' ? ' package-mcp-tab--active' : ''}`}
                    type="button"
                    onClick={() => update((draft) => ({ ...draft, transport: 'stdio' }))}
                >
                    STDIO
                </button>
                <button
                    className={`package-mcp-tab${isHttp ? ' package-mcp-tab--active' : ''}`}
                    type="button"
                    onClick={() => update((draft) => ({ ...draft, transport: 'http' }))}
                >
                    Streamable HTTP
                </button>
            </div>

            <div className="package-mcp-editor__grid">
                <label className="package-mcp-editor__field">
                    <span>Name</span>
                    <input
                        className="text-input"
                        value={entry.name}
                        placeholder="MCP server name"
                        onChange={(event) => update((draft) => ({ ...draft, name: event.target.value }))}
                    />
                </label>
                <label className="package-mcp-editor__field">
                    <span>Startup</span>
                    <select
                        className="select"
                        value={entry.enabled ? 'enabled' : 'disabled'}
                        onChange={(event) => update((draft) => ({ ...draft, enabled: event.target.value === 'enabled' }))}
                    >
                        <option value="enabled">Enabled</option>
                        <option value="disabled">Disabled</option>
                    </select>
                </label>
                <label className="package-mcp-editor__field">
                    <span>Timeout (ms)</span>
                    <input
                        className="text-input"
                        value={entry.timeoutText}
                        placeholder="5000"
                        onChange={(event) => update((draft) => ({ ...draft, timeoutText: event.target.value }))}
                    />
                </label>
            </div>

            {entry.transport === 'stdio' ? (
                <>
                    <div className="package-mcp-editor__grid">
                        <label className="package-mcp-editor__field package-mcp-editor__field--wide">
                            <span>Command</span>
                            <input
                                className="text-input"
                                value={entry.command}
                                placeholder="npx"
                                onChange={(event) => update((draft) => ({ ...draft, command: event.target.value }))}
                            />
                        </label>
                    </div>

                    <StringListField
                        label="Arguments"
                        items={entry.args}
                        addLabel="Add argument"
                        onChange={(args) => update((draft) => ({ ...draft, args }))}
                    />

                    <KVListField
                        label="Environment"
                        items={entry.env}
                        addLabel="Add variable"
                        keyPlaceholder="Key"
                        valuePlaceholder="Value"
                        onChange={(env) => update((draft) => ({ ...draft, env }))}
                    />
                </>
            ) : (
                <>
                    <div className="package-mcp-editor__grid">
                        <label className="package-mcp-editor__field package-mcp-editor__field--wide">
                            <span>URL</span>
                            <input
                                className="text-input"
                                value={entry.url}
                                placeholder="https://mcp.example.com/mcp"
                                onChange={(event) => update((draft) => ({ ...draft, url: event.target.value }))}
                            />
                        </label>
                    </div>

                    <KVListField
                        label="Headers"
                        items={entry.headers}
                        addLabel="Add header"
                        keyPlaceholder="Key"
                        valuePlaceholder="Value"
                        onChange={(headers) => update((draft) => ({ ...draft, headers }))}
                    />

                    <div className="package-mcp-editor__grid">
                        <label className="package-mcp-editor__field">
                            <span>OAuth</span>
                            <select
                                className="select"
                                value={entry.oauthEnabled ? 'enabled' : 'disabled'}
                                onChange={(event) => update((draft) => ({ ...draft, oauthEnabled: event.target.value === 'enabled' }))}
                            >
                                <option value="enabled">Auto / Configured</option>
                                <option value="disabled">Disabled</option>
                            </select>
                        </label>
                        <label className="package-mcp-editor__field">
                            <span>Client ID</span>
                            <input
                                className="text-input"
                                value={entry.oauthClientId}
                                placeholder="client id"
                                onChange={(event) => update((draft) => ({ ...draft, oauthClientId: event.target.value }))}
                            />
                        </label>
                        <label className="package-mcp-editor__field">
                            <span>Client Secret</span>
                            <input
                                className="text-input"
                                value={entry.oauthClientSecret}
                                placeholder="client secret"
                                onChange={(event) => update((draft) => ({ ...draft, oauthClientSecret: event.target.value }))}
                            />
                        </label>
                        <label className="package-mcp-editor__field">
                            <span>OAuth Scope</span>
                            <input
                                className="text-input"
                                value={entry.oauthScope}
                                placeholder="repo read:org"
                                onChange={(event) => update((draft) => ({ ...draft, oauthScope: event.target.value }))}
                            />
                        </label>
                    </div>
                </>
            )}
        </div>
    )
}
