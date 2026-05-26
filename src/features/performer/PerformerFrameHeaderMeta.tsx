type Props = {
    modelLabel: string | null
    modelTitle: string | null
    talLabel: string | null
    danceSummary: string | null
}

export default function PerformerFrameHeaderMeta({
    modelLabel,
    modelTitle,
    talLabel,
    danceSummary,
}: Props) {
    return (
        <div className="canvas-frame__badges">
            {talLabel ? <span className="canvas-frame__badge" title={`Persona: ${talLabel}`}>{talLabel}</span> : null}
            {danceSummary ? <span className="canvas-frame__badge" title={`Skill Pack: ${danceSummary}`}>{danceSummary}</span> : null}
            {modelLabel ? <span className="canvas-frame__badge" title={modelTitle || modelLabel}>{modelLabel}</span> : null}
        </div>
    )
}
