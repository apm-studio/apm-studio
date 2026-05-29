type Props = {
    modelLabel: string | null
    modelTitle: string | null
    instructionLabel: string | null
    skillSummary: string | null
}

export default function AgentFrameHeaderMeta({
    modelLabel,
    modelTitle,
    instructionLabel,
    skillSummary,
}: Props) {
    return (
        <div className="canvas-frame__badges">
            {instructionLabel ? <span className="canvas-frame__badge" title={`Instruction: ${instructionLabel}`}>{instructionLabel}</span> : null}
            {skillSummary ? <span className="canvas-frame__badge" title={`Skill: ${skillSummary}`}>{skillSummary}</span> : null}
            {modelLabel ? <span className="canvas-frame__badge" title={modelTitle || modelLabel}>{modelLabel}</span> : null}
        </div>
    )
}
