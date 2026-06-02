import { Bot, FileText, PackageOpen, Server, Zap } from 'lucide-react'
import type { ApmPackageSummary } from '../../../shared/apm-contracts'
import type { ApmSyncUnit } from '../../../shared/apm-sync-contracts'

interface TargetExportPackageIconProps {
    pkg: ApmPackageSummary
    syncUnit: ApmSyncUnit
    size?: number
}

export function TargetExportPackageIcon({ pkg, syncUnit, size = 12 }: TargetExportPackageIconProps) {
    if (syncUnit === 'agents') return <Bot size={size} className="primitive-icon agent" />
    if (syncUnit === 'instructions') return <FileText size={size} className="primitive-icon instruction" />
    if (syncUnit === 'skills') return <Zap size={size} className="primitive-icon skill" />
    if (syncUnit === 'prompts') return <FileText size={size} className="primitive-icon instruction" />
    if (syncUnit === 'commands') return <FileText size={size} className="primitive-icon instruction" />
    if (syncUnit === 'hooks') return <Zap size={size} className="primitive-icon skill" />
    if (syncUnit === 'mcp') return <Server size={size} className="primitive-icon mcp" />
    if (pkg.kind === 'agent') return <Bot size={size} className="primitive-icon agent" />
    if (pkg.kind === 'instruction') return <FileText size={size} className="primitive-icon instruction" />
    if (pkg.kind === 'skill') return <Zap size={size} className="primitive-icon skill" />
    if (pkg.kind === 'prompt' || pkg.kind === 'command') return <FileText size={size} className="primitive-icon instruction" />
    if (pkg.kind === 'hook') return <Zap size={size} className="primitive-icon skill" />
    if (pkg.kind === 'mcp') return <Server size={size} className="primitive-icon mcp" />
    return <PackageOpen size={size} className="primitive-icon combo" />
}
