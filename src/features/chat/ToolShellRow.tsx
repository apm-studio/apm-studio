import { useCallback, useState } from 'react'

import { TextShimmer } from '../../components/chat/TextShimmer'
import { useUISettings } from '../../store/settings/slice'
import { BasicTool, ToolErrorCard } from './ToolGroupPrimitives'
import type { ToolRowProps } from './ToolRowTypes'
import {
    extractShellCommand,
    extractToolMetadata,
    formatToolDuration,
    readToolString,
} from './tool-group-utils'

export function ShellToolRow({ tool, pending, isError }: ToolRowProps) {
    const shellToolPartsExpanded = useUISettings((state) => state.shellToolPartsExpanded)
    const [copied, setCopied] = useState(false)
    const handleCopy = useCallback(async (text: string) => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [])

    const cmd = extractShellCommand(tool.input)
    const metadata = extractToolMetadata(tool)
    const desc = readToolString(tool.input, 'description') || readToolString(metadata, 'description') || undefined
    const output = tool.output || readToolString(metadata, 'output', 'stdout')
    const combined = `$ ${cmd}${output ? '\n\n' + output : ''}`
    const summary = desc || cmd || 'Running command'

    return (
        <BasicTool
            badge="SHELL"
            trigger={
                <div className="shell-trigger">
                    <span className="shell-trigger__title">
                        <TextShimmer text={summary} active={pending} />
                    </span>
                    {!pending && desc && cmd && desc !== cmd && (
                        <span className="shell-trigger__desc">{cmd}</span>
                    )}
                </div>
            }
            status={tool.status}
            duration={formatToolDuration(tool.time)}
            defaultOpen={shellToolPartsExpanded}
        >
            <div className="tool-content-terminal" data-scrollable>
                <button
                    className="tool-copy-btn"
                    onClick={(e) => { e.stopPropagation(); void handleCopy(combined) }}
                    title={copied ? 'Copied!' : 'Copy'}
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>
                <pre className="tool-pre"><code>{combined}</code></pre>
            </div>
            {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
        </BasicTool>
    )
}
