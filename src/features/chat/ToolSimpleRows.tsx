import { TextShimmer } from '../../components/chat/TextShimmer'
import { BasicTool, ToolErrorCard } from './ToolGroupPrimitives'
import type { ToolRowProps } from './ToolRowTypes'
import { extractFilePath, formatToolDuration } from './tool-group-utils'

export function SearchToolRow({ tool, pending }: ToolRowProps) {
    const query = tool.input?.query ? String(tool.input.query) : ''
    const url = tool.input?.url ? String(tool.input.url) : tool.input?.Url ? String(tool.input.Url) : ''
    const isWebFetch = tool.name === 'webfetch' || tool.name === 'read_url_content'

    return (
        <BasicTool
            badge={isWebFetch ? 'FETCH' : 'WEB'}
            trigger={
                <div className="search-trigger">
                    <span className="search-trigger__title">
                        <TextShimmer text={isWebFetch ? 'Web Fetch' : 'Web Search'} active={pending} />
                    </span>
                    {!pending && (url || query) && (
                        url ? (
                            <a
                                className="search-trigger__link"
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {url}
                            </a>
                        ) : (
                            <span className="search-trigger__query">{query}</span>
                        )
                    )}
                    {!pending && url && (
                        <span className="search-trigger__ext">Open</span>
                    )}
                </div>
            }
            status={tool.status}
            hideDetails
        />
    )
}

export function CodeSearchToolRow({ tool, pending }: ToolRowProps) {
    const query = tool.input?.query ? String(tool.input.query) : ''
    return (
        <BasicTool
            badge="CODE"
            title="Code Search"
            subtitle={!pending ? query : undefined}
            status={tool.status}
            hideDetails
        />
    )
}

export function TaskToolRow({ tool, pending }: ToolRowProps) {
    const subagentType = tool.input?.subagent_type ? String(tool.input.subagent_type) : ''
    const agentLabel = subagentType ? subagentType[0].toUpperCase() + subagentType.slice(1) : 'Agent'
    const desc = tool.input?.description ? String(tool.input.description) : tool.input?.Task ? String(tool.input.Task) : tool.title || ''

    return (
        <BasicTool
            badge="TASK"
            trigger={
                <div className="agent-trigger">
                    <span className="agent-trigger__title">
                        <TextShimmer text={agentLabel} active={pending} />
                    </span>
                    {!pending && desc && (
                        <span className="agent-trigger__desc">{desc}</span>
                    )}
                </div>
            }
            status={tool.status}
            hideDetails
        />
    )
}

export function SkillToolRow({ tool, pending }: ToolRowProps) {
    const skillName = tool.input?.name ? String(tool.input.name) : tool.title || 'Skill'
    return (
        <BasicTool
            badge="SKILL"
            trigger={
                <div className="skill-trigger">
                    <span className="skill-trigger__title">
                        <TextShimmer text={skillName} active={pending} />
                    </span>
                </div>
            }
            status={tool.status}
            hideDetails
        />
    )
}

export function GenericToolRow({ tool, pending, isError }: ToolRowProps) {
    const displayTitle = tool.title || tool.name
    return (
        <BasicTool
            badge="TOOL"
            title={displayTitle}
            subtitle={!pending ? extractFilePath(tool.input) || undefined : undefined}
            status={tool.status}
            duration={formatToolDuration(tool.time)}
        >
            {tool.input && Object.keys(tool.input).length > 0 ? (
                <div className="tool-content-generic">
                    <span className="tool-section-label">Input</span>
                    <pre className="tool-pre">{JSON.stringify(tool.input, null, 2)}</pre>
                </div>
            ) : null}
            {tool.output ? (
                <div className="tool-content-generic">
                    <span className="tool-section-label">Output</span>
                    <pre className="tool-pre">{tool.output.length > 500 ? `${tool.output.slice(0, 500)}…` : tool.output}</pre>
                </div>
            ) : null}
            {isError && tool.error ? (
                <ToolErrorCard error={tool.error} toolName={tool.name} />
            ) : null}
        </BasicTool>
    )
}
