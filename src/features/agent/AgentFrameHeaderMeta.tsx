type Props = {
    modelLabel: string | null
    modelTitle: string | null
    skillSummary: string | null
}

export default function AgentFrameHeaderMeta({
    modelLabel,
    modelTitle,
    skillSummary,
}: Props) {
    return (
        <div className="canvas-frame__badges">
            {skillSummary ? <span className="canvas-frame__badge" title={`Skill: ${skillSummary}`}>{skillSummary}</span> : null}
            {modelLabel ? <span className="canvas-frame__badge" title={modelTitle || modelLabel}>{modelLabel}</span> : null}
        </div>
    )
}
