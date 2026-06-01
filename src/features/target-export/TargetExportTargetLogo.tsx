import type { ApmSyncTargetId } from '../../../shared/apm-sync-contracts'

import claudeLogoSvg from '@lobehub/icons-static-svg/icons/claude-color.svg?raw'
import codexLogoSvg from '@lobehub/icons-static-svg/icons/codex-color.svg?raw'
import copilotLogoSvg from '@lobehub/icons-static-svg/icons/githubcopilot.svg?raw'
import cursorLogoSvg from '@lobehub/icons-static-svg/icons/cursor.svg?raw'
import geminiLogoSvg from '@lobehub/icons-static-svg/icons/gemini-color.svg?raw'
import opencodeLogoSvg from '@lobehub/icons-static-svg/icons/opencode.svg?raw'
import windsurfLogoSvg from '@lobehub/icons-static-svg/icons/windsurf.svg?raw'

const TARGET_LOGOS: Record<ApmSyncTargetId, string | null> = {
    codex: codexLogoSvg,
    claude: claudeLogoSvg,
    opencode: opencodeLogoSvg,
    cursor: cursorLogoSvg,
    windsurf: windsurfLogoSvg,
    copilot: copilotLogoSvg,
    gemini: geminiLogoSvg,
    'agent-skills': null,
}

interface TargetExportTargetLogoProps {
    targetId: ApmSyncTargetId
    label: string
}

export function TargetExportTargetLogo({ targetId, label }: TargetExportTargetLogoProps) {
    const logoSvg = TARGET_LOGOS[targetId]
    if (!logoSvg) {
        return (
            <span
                className={`target-export-target-logo target-export-target-logo--${targetId}`}
                aria-hidden="true"
                title={`${label} logo`}
            >
                AS
            </span>
        )
    }

    return (
        <span
            className={`target-export-target-logo target-export-target-logo--${targetId}`}
            aria-hidden="true"
            title={`${label} logo`}
            dangerouslySetInnerHTML={{ __html: logoSvg }}
        />
    )
}
