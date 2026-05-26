import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    Bot,
    CheckCircle,
    Compass,
    ExternalLink,
    Github,
    Loader2,
    PackagePlus,
    Search,
    Server,
    Sparkles,
    Zap,
} from 'lucide-react'
import { api } from '../../api'
import { queryKeys } from '../../hooks/queries'
import { showToast } from '../../lib/toast'
import { useStudioStore } from '../../store'
import type { RegistryPreset } from '../../../shared/registry-contracts'
import './ExplorePresetCatalog.css'

type PresetKind = 'agent' | 'skill' | 'mcp'
type PresetFilter = PresetKind | 'all'

type CuratedPreset = {
    id: string
    kind: PresetKind
    name: string
    summary: string
    source: string
    repo: string
    href: string
    tags: string[]
    targets: string[]
    artifact: string
    accent: 'blue' | 'green' | 'amber' | 'violet' | 'rose'
    importable?: boolean
}

const PRESET_FILTERS: Array<{ kind: PresetFilter; label: string; icon: ReactNode }> = [
    { kind: 'all', label: 'All', icon: <Compass size={12} /> },
    { kind: 'agent', label: 'Agents', icon: <Bot size={12} /> },
    { kind: 'skill', label: 'Skills', icon: <Zap size={12} /> },
    { kind: 'mcp', label: 'MCP', icon: <Server size={12} /> },
]

const CURATED_PRESETS: CuratedPreset[] = [
    {
        id: 'voltagent-claude-code-subagents',
        kind: 'agent',
        name: 'Claude Code Subagents',
        summary: 'Curated role agents for coding, review, security, docs, and product workflows.',
        source: 'VoltAgent',
        repo: 'VoltAgent/awesome-claude-code-subagents',
        href: 'https://github.com/VoltAgent/awesome-claude-code-subagents',
        tags: ['subagents', 'coding', 'review'],
        targets: ['Claude', 'Codex', 'OpenCode'],
        artifact: 'agent roster',
        accent: 'blue',
    },
    {
        id: 'voltagent-agent-skills',
        kind: 'skill',
        name: 'Agent Skills Index',
        summary: 'A broad source catalog for reusable coding assistant skills and task playbooks.',
        source: 'VoltAgent',
        repo: 'VoltAgent/awesome-agent-skills',
        href: 'https://github.com/VoltAgent/awesome-agent-skills',
        tags: ['skills', 'automation', 'github'],
        targets: ['Codex', 'Claude', 'Cursor'],
        artifact: 'skill index',
        accent: 'amber',
        importable: true,
    },
    {
        id: 'open-design-skills',
        kind: 'skill',
        name: 'Open Design Skills',
        summary: 'Design-focused skills, templates, and DESIGN.md systems for interface generation.',
        source: 'nexu-io',
        repo: 'nexu-io/open-design',
        href: 'https://github.com/nexu-io/open-design',
        tags: ['design', 'templates', 'ui'],
        targets: ['Codex', 'Claude', 'OpenCode'],
        artifact: 'design kit',
        accent: 'rose',
    },
    {
        id: 'modelcontextprotocol-servers',
        kind: 'mcp',
        name: 'Official MCP Servers',
        summary: 'Reference MCP server implementations and examples from the Model Context Protocol project.',
        source: 'Model Context Protocol',
        repo: 'modelcontextprotocol/servers',
        href: 'https://github.com/modelcontextprotocol/servers',
        tags: ['mcp', 'tools', 'servers'],
        targets: ['OpenCode', 'Codex', 'Claude'],
        artifact: 'server set',
        accent: 'green',
    },
    {
        id: 'awesome-mcp-servers',
        kind: 'mcp',
        name: 'Awesome MCP Servers',
        summary: 'Community-maintained index of MCP servers across cloud, databases, browsers, and devtools.',
        source: 'punkpeye',
        repo: 'punkpeye/awesome-mcp-servers',
        href: 'https://github.com/punkpeye/awesome-mcp-servers',
        tags: ['mcp', 'catalog', 'community'],
        targets: ['OpenCode', 'Codex', 'Claude'],
        artifact: 'tool map',
        accent: 'violet',
    },
]

function filterCount(kind: PresetFilter) {
    if (kind === 'all') {
        return CURATED_PRESETS.length
    }
    return CURATED_PRESETS.filter((preset) => preset.kind === kind).length
}

function kindLabel(kind: PresetKind) {
    if (kind === 'agent') return 'Agent'
    if (kind === 'skill') return 'Skill'
    return 'MCP'
}

function openExternal(href: string) {
    window.open(href, '_blank', 'noopener,noreferrer')
}

export default function ExplorePresetCatalog() {
    const [activeKind, setActiveKind] = useState<PresetFilter>('all')
    const [query, setQuery] = useState('')
    const [registryPresets, setRegistryPresets] = useState<RegistryPreset[]>([])
    const [registryLoading, setRegistryLoading] = useState(false)
    const [registryError, setRegistryError] = useState<string | null>(null)
    const [importingId, setImportingId] = useState<string | null>(null)
    const queryClient = useQueryClient()
    const workingDir = useStudioStore((state) => state.workingDir)
    const setWorkspaceMode = useStudioStore((state) => state.setWorkspaceMode)

    useEffect(() => {
        let mounted = true
        setRegistryLoading(true)
        setRegistryError(null)
        api.explore.presets()
            .then((response) => {
                if (!mounted) return
                setRegistryPresets(response.presets.filter((preset) => preset.status === 'active').slice(0, 4))
            })
            .catch((error) => {
                if (!mounted) return
                setRegistryError(error instanceof Error ? error.message : 'Unable to load registry presets.')
            })
            .finally(() => {
                if (mounted) {
                    setRegistryLoading(false)
                }
            })

        return () => {
            mounted = false
        }
    }, [workingDir])

    const filteredPresets = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase()
        return CURATED_PRESETS.filter((preset) => {
            if (activeKind !== 'all' && preset.kind !== activeKind) return false
            if (!normalizedQuery) return true
            return [
                preset.name,
                preset.summary,
                preset.repo,
                preset.source,
                preset.artifact,
                ...preset.tags,
                ...preset.targets,
            ].some((value) => value.toLowerCase().includes(normalizedQuery))
        })
    }, [activeKind, query])

    const handleImportSkill = async (preset: CuratedPreset) => {
        if (!preset.importable || importingId) return
        if (!workingDir) {
            showToast('Select a workspace before importing a preset.', 'error', {
                title: 'No workspace selected',
                dedupeKey: 'explore:preset:no-workspace',
            })
            return
        }
        setImportingId(preset.id)
        try {
            const result = await api.roster.addFromGitHub(preset.repo, 'stage')
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.assets(workingDir) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.assetInventory(workingDir) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.rosterStatus(workingDir) }),
            ])
            showToast(`Imported ${result.installed.length} skill(s) from ${preset.repo}.`, 'success', {
                title: 'Preset imported',
                actionLabel: 'Go to Design',
                onAction: () => setWorkspaceMode('canvas'),
            })
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Unable to import preset.', 'error', {
                title: 'Import failed',
                dedupeKey: `explore:preset:${preset.id}`,
            })
        } finally {
            setImportingId(null)
        }
    }

    return (
        <main className="explore-page">
            <header className="explore-page__hero">
                <div className="explore-page__hero-top">
                    <div className="explore-page__title-block">
                        <span className="section-title">Explore</span>
                        <h1>What package do you want to build?</h1>
                        <p>Community sources for agents, skills, and MCP servers.</p>
                    </div>
                    <div className="explore-page__source-pills" aria-label="Explore source status">
                        <span>GitHub sources</span>
                        <span>APM packages</span>
                        <span>Codex ready</span>
                    </div>
                </div>
                <label className="explore-page__search">
                    <Search size={13} />
                    <input
                        className="input"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search presets, repos, tags"
                    />
                </label>
                <div className="explore-page__filter-strip" aria-label="Preset kind">
                    {PRESET_FILTERS.map((item) => (
                        <button
                            key={item.kind}
                            type="button"
                            className={`explore-filter-chip ${activeKind === item.kind ? 'is-active' : ''}`}
                            onClick={() => setActiveKind(item.kind)}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                            <strong>{filterCount(item.kind)}</strong>
                        </button>
                    ))}
                </div>
            </header>

            <section className="explore-page__registry-strip" aria-label="8PM registry presets">
                <div className="explore-page__registry-copy">
                    <Sparkles size={14} />
                    <div>
                        <span className="section-title">Community</span>
                        <h2>Browse registry</h2>
                        <p>{registryLoading ? 'Loading registry presets...' : registryError ? 'Local curated sources are available below.' : `${registryPresets.length} registry preset${registryPresets.length === 1 ? '' : 's'} ready`}</p>
                    </div>
                </div>
                <div className="explore-page__registry-list">
                    {registryPresets.map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            className="explore-registry-pill"
                            onClick={() => setQuery(preset.slug || preset.title)}
                            title={preset.summary}
                        >
                            {preset.title}
                        </button>
                    ))}
                    {!registryLoading && registryPresets.length === 0 ? (
                        <span className="explore-page__registry-empty">{registryError || 'No registry presets returned.'}</span>
                    ) : null}
                </div>
            </section>

            <section className="explore-page__catalog" aria-label={`${activeKind} presets`}>
                {filteredPresets.map((preset) => (
                    <article key={preset.id} className={`surface-card explore-preset-card explore-preset-card--${preset.accent}`}>
                        <div className="explore-preset-card__preview" aria-hidden="true">
                            <div className="explore-preset-card__preview-head">
                                <span />
                                <span />
                                <span />
                            </div>
                            <div className="explore-preset-card__preview-body">
                                <div className="explore-preset-card__preview-kicker">{kindLabel(preset.kind)}</div>
                                <div className="explore-preset-card__preview-title">{preset.artifact}</div>
                                <div className="explore-preset-card__preview-lines">
                                    <span />
                                    <span />
                                    <span />
                                </div>
                            </div>
                        </div>
                        <div className="explore-preset-card__content">
                            <div className="explore-preset-card__source">
                                <Github size={13} />
                                <span>{preset.repo}</span>
                                <strong>{kindLabel(preset.kind)}</strong>
                            </div>
                            <h2>{preset.name}</h2>
                            <p>{preset.summary}</p>
                            <div className="explore-preset-card__tags">
                                {preset.tags.map((tag) => (
                                    <span key={tag} className="badge badge--subtle">{tag}</span>
                                ))}
                            </div>
                            <div className="explore-preset-card__footer">
                                <div className="explore-preset-card__targets">
                                    {preset.targets.map((target) => (
                                        <span key={target}>{target}</span>
                                    ))}
                                </div>
                                {preset.importable ? (
                                    <button
                                        type="button"
                                        className="btn btn--primary"
                                        onClick={() => void handleImportSkill(preset)}
                                        disabled={!!importingId}
                                    >
                                        {importingId === preset.id ? <Loader2 size={12} className="spin" /> : <PackagePlus size={12} />}
                                        Import
                                    </button>
                                ) : (
                                    <span className="explore-preset-card__readiness">
                                        <CheckCircle size={12} />
                                        Source
                                    </span>
                                )}
                                <button type="button" className="btn" onClick={() => openExternal(preset.href)}>
                                    <ExternalLink size={12} />
                                    Open
                                </button>
                            </div>
                        </div>
                    </article>
                ))}
                {filteredPresets.length === 0 ? (
                    <div className="explore-page__empty">
                        <Compass size={18} />
                        <span>No presets match this filter.</span>
                    </div>
                ) : null}
            </section>
        </main>
    )
}
