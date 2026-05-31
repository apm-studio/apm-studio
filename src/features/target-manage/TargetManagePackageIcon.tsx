import { Bot, FileText, PackageOpen, Server, Zap } from 'lucide-react'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import type { ApmSyncUnit } from '../../../shared/apm-sync-contracts'

interface TargetManagePackageIconProps {
    pkg: ApmPackageSummary
    syncUnit: ApmSyncUnit
    size?: number
}

export function TargetManagePackageIcon({ pkg, syncUnit, size = 12 }: TargetManagePackageIconProps) {
    if (syncUnit === 'agents' || pkg.kind === 'agent') return <Bot size={size} className="primitive-icon agent" />
    if (syncUnit === 'instructions' || pkg.kind === 'instruction') return <FileText size={size} className="primitive-icon instruction" />
    if (syncUnit === 'skills' || pkg.kind === 'skill') return <Zap size={size} className="primitive-icon skill" />
    if (syncUnit === 'prompts' || pkg.kind === 'prompt') return <FileText size={size} className="primitive-icon instruction" />
    if (syncUnit === 'commands' || pkg.kind === 'command') return <FileText size={size} className="primitive-icon instruction" />
    if (syncUnit === 'hooks' || pkg.kind === 'hook') return <Zap size={size} className="primitive-icon skill" />
    if (syncUnit === 'mcp' || pkg.kind === 'mcp') return <Server size={size} className="primitive-icon mcp" />
    return <PackageOpen size={size} className="primitive-icon combo" />
}
