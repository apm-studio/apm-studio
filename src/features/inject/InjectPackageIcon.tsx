import { Bot, FileText, PackageOpen, Server, Zap } from 'lucide-react'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import type { ApmSyncUnit } from '../../../shared/apm-sync-contracts'

interface InjectPackageIconProps {
    pkg: ApmPackageSummary
    syncUnit: ApmSyncUnit
    size?: number
}

export function InjectPackageIcon({ pkg, syncUnit, size = 12 }: InjectPackageIconProps) {
    if (syncUnit === 'agents' || pkg.kind === 'agent') return <Bot size={size} className="primitive-icon agent" />
    if (syncUnit === 'instructions' || pkg.kind === 'instruction') return <FileText size={size} className="primitive-icon instruction" />
    if (syncUnit === 'skills' || pkg.kind === 'skill') return <Zap size={size} className="primitive-icon skill" />
    if (syncUnit === 'mcp' || pkg.kind === 'mcp') return <Server size={size} className="primitive-icon mcp" />
    return <PackageOpen size={size} className="primitive-icon combo" />
}
