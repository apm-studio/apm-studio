import { DiffChanges } from '../../components/chat/DiffChanges'
import { DiffBlock, SyntaxBlock } from '../../components/chat/SyntaxBlock'
import {
    BasicTool,
    EditWriteTrigger,
    ToolErrorCard,
    ToolFileAccordion,
} from './ToolGroupPrimitives'
import type { ToolRowProps } from './ToolRowTypes'
import { useUISettings } from '../../store/settings/slice'
import {
    type ApplyPatchMetadataFile,
    countDiffLines,
    extractApplyPatchFiles,
    extractFileContent,
    extractFilePath,
    extractNewContent,
    extractOldContent,
    extractPatchText,
    extractToolMetadata,
    formatToolDuration,
    getDirectory,
    getFilename,
    mergeApplyPatchFiles,
    parsePatchFiles,
    readToolString,
} from './tool-group-utils'

export function EditToolRow({ tool, pending, isError }: ToolRowProps) {
    const editToolPartsExpanded = useUISettings((state) => state.editToolPartsExpanded)
    const metadata = extractToolMetadata(tool)
    const filePath = extractFilePath(tool.input)
    const filename = getFilename(filePath)
    const directory = getDirectory(filePath)
    const oldContent = extractOldContent(tool.input)
    const newContent = extractNewContent(tool.input)
    const diff = oldContent || newContent ? countDiffLines(oldContent, newContent) : null
    const metadataDiff = readToolString(metadata, 'diff')

    return (
        <BasicTool
            badge="EDIT"
            trigger={
                <EditWriteTrigger
                    label="Edit"
                    pending={pending}
                    filename={filename}
                    directory={directory}
                    diffChanges={diff}
                />
            }
            status={tool.status}
            duration={formatToolDuration(tool.time)}
            defaultOpen={editToolPartsExpanded}
        >
            {filePath && metadataDiff && (
                <SyntaxBlock code={metadataDiff} language="diff" lineNumbers={false} maxHeight={400} />
            )}
            {filePath && !metadataDiff && (oldContent || newContent) && (
                <DiffBlock
                    before={oldContent}
                    after={newContent}
                    filename={filename}
                />
            )}
            {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
        </BasicTool>
    )
}

export function WriteToolRow({ tool, pending, isError }: ToolRowProps) {
    const editToolPartsExpanded = useUISettings((state) => state.editToolPartsExpanded)
    const filePath = extractFilePath(tool.input)
    const filename = getFilename(filePath)
    const directory = getDirectory(filePath)
    const content = extractFileContent(tool.input)

    return (
        <BasicTool
            badge="WRITE"
            trigger={
                <EditWriteTrigger
                    label="Write"
                    pending={pending}
                    filename={filename}
                    directory={directory}
                />
            }
            status={tool.status}
            duration={formatToolDuration(tool.time)}
            defaultOpen={editToolPartsExpanded}
        >
            {filePath && (
                content ? (
                    <SyntaxBlock
                        code={content.length > 3000 ? content.slice(0, 3000) + '\n\n… (truncated)' : content}
                        filename={filename}
                        maxHeight={400}
                    />
                ) : tool.output ? (
                    <pre className="tool-pre tool-pre--panel">{tool.output}</pre>
                ) : null
            )}
            {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
        </BasicTool>
    )
}

export function PatchToolRow({ tool, pending, isError }: ToolRowProps) {
    const editToolPartsExpanded = useUISettings((state) => state.editToolPartsExpanded)
    const patchText = extractPatchText(tool.input)
    const metadata = extractToolMetadata(tool)
    const metadataFiles = extractApplyPatchFiles(tool)
    const parsedPatchFiles = parsePatchFiles(patchText)
    const patchFiles: ApplyPatchMetadataFile[] = mergeApplyPatchFiles(metadataFiles, parsedPatchFiles)
    const metadataDiff = readToolString(metadata, 'diff')

    if (patchFiles.length <= 1) {
        const singlePath = patchFiles[0]?.relativePath || patchFiles[0]?.filePath || extractFilePath(tool.input)
        const singleFilename = singlePath ? getFilename(singlePath) : 'patch'
        const singleDir = singlePath ? getDirectory(singlePath) : ''
        const singleFile = patchFiles[0]
        const singleChanges = typeof singleFile?.additions === 'number' || typeof singleFile?.deletions === 'number'
            ? {
                additions: typeof singleFile?.additions === 'number' ? singleFile.additions : 0,
                deletions: typeof singleFile?.deletions === 'number' ? singleFile.deletions : 0,
            }
            : null
        const singleLabel = singlePath ? 'Patch' : (pending ? 'Preparing patch' : '1 file changed')

        return (
            <BasicTool
                badge="PATCH"
                trigger={
                    <EditWriteTrigger
                        label={singleLabel}
                        pending={pending}
                        filename={singlePath ? singleFilename : ''}
                        directory={singleDir}
                        diffChanges={singleChanges}
                    />
                }
                status={tool.status}
                duration={formatToolDuration(tool.time)}
                defaultOpen={editToolPartsExpanded}
            >
                {singleFile?.diff ? (
                    <DiffBlock before="" after="" rawDiff={singleFile.diff} filename={singleFilename} maxHeight={500} />
                ) : patchText ? (
                    <DiffBlock before="" after="" rawDiff={patchText} filename={singleFilename} maxHeight={500} />
                ) : metadataDiff ? (
                    <DiffBlock before="" after="" rawDiff={metadataDiff} filename={singleFilename} maxHeight={500} />
                ) : singleFile?.before !== undefined || singleFile?.after !== undefined ? (
                    <DiffBlock before={singleFile?.before || ''} after={singleFile?.after || ''} filename={singleFilename} />
                ) : (
                    <pre className="tool-pre tool-pre--panel">Diff preview unavailable.</pre>
                )}
                {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
            </BasicTool>
        )
    }

    return (
        <BasicTool
            badge="PATCH"
            title={!pending ? `${patchFiles.length} files changed` : 'Preparing files'}
            status={tool.status}
            duration={formatToolDuration(tool.time)}
            defaultOpen={editToolPartsExpanded}
        >
            {patchFiles.map((file, idx) => {
                const displayPath = file.relativePath || file.filePath || `patch-${idx + 1}`
                const changeType = file.type || 'update'
                const changes = typeof file.additions === 'number' || typeof file.deletions === 'number'
                    ? {
                        additions: typeof file.additions === 'number' ? file.additions : 0,
                        deletions: typeof file.deletions === 'number' ? file.deletions : 0,
                    }
                    : null

                return (
                    <ToolFileAccordion
                        key={`${displayPath}:${idx}`}
                        path={displayPath}
                        defaultOpen={changeType !== 'delete'}
                        badge={
                            changeType === 'add' ? <span className="patch-badge patch-badge--add">created</span>
                            : changeType === 'delete' ? <span className="patch-badge patch-badge--del">deleted</span>
                            : changeType === 'move' ? <span className="patch-badge patch-badge--move">moved</span>
                            : changes ? <DiffChanges changes={changes} /> : null
                        }
                    >
                        {file.diff ? (
                            <DiffBlock before="" after="" rawDiff={file.diff} filename={getFilename(displayPath)} maxHeight={400} />
                        ) : file.before !== undefined || file.after !== undefined ? (
                            <DiffBlock before={file.before || ''} after={file.after || ''} filename={getFilename(displayPath)} />
                        ) : (
                            <pre className="tool-pre tool-pre--panel">Diff preview unavailable.</pre>
                        )}
                    </ToolFileAccordion>
                )
            })}
            {isError && tool.error && <ToolErrorCard error={tool.error} toolName={tool.name} />}
        </BasicTool>
    )
}
