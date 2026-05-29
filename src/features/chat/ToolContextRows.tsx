import { BasicTool } from './ToolGroupPrimitives'
import type { ToolRowProps } from './ToolRowTypes'
import { extractFilePath, formatToolDuration, getFilename } from './tool-group-utils'

export function CompactContextToolRow({ tool, isError }: ToolRowProps) {
    const label = tool.title || tool.name
    const path = extractFilePath(tool.input) || (tool.input?.pattern ? String(tool.input.pattern) : '')
    return (
        <div className="context-tool-item">
            <span className="context-tool-badge">CTX</span>
            <span className="context-tool-name">{label}</span>
            {path && <span className="context-tool-path">{getFilename(path) || path}</span>}
            {isError && <span className="context-tool-error">ERROR</span>}
        </div>
    )
}

export function StandaloneContextToolRow({ tool, pending }: ToolRowProps) {
    const filePath = extractFilePath(tool.input)
    const pattern = tool.input?.pattern ? String(tool.input.pattern) : ''
    const args: string[] = []
    if (tool.input?.offset) args.push(`offset=${tool.input.offset}`)
    if (tool.input?.limit) args.push(`limit=${tool.input.limit}`)
    if (pattern) args.push(`pattern=${pattern}`)

    return (
        <BasicTool
            badge="CTX"
            title={tool.title || tool.name}
            subtitle={!pending ? (filePath ? getFilename(filePath) : pattern) + (args.length ? ` (${args.join(', ')})` : '') : undefined}
            status={tool.status}
            duration={formatToolDuration(tool.time)}
            hideDetails
        />
    )
}
