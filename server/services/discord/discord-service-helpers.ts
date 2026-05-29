import {
    PermissionFlagsBits,
    PermissionsBitField,
} from 'discord.js'
import type { ChatPermissionRequest, ChatQuestionRequest } from '../../../shared/chat-contracts.js'
import type { DiscordTeamSnapshot, DiscordWorkspaceSnapshot } from './studio-runtime.js'

export const REQUIRED_PERMISSIONS = [
    ['View channels', PermissionFlagsBits.ViewChannel],
    ['Manage channels', PermissionFlagsBits.ManageChannels],
    ['Send messages', PermissionFlagsBits.SendMessages],
    ['Read message history', PermissionFlagsBits.ReadMessageHistory],
] as const

export const MAX_DISCORD_PROMPT_CHARS = 1800
export const TEAM_THREAD_SYNC_POLL_MS = 1_500
export const TEAM_THREAD_SYNC_TIMEOUT_MS = 30 * 60_000
export const TEAM_THREAD_IDLE_CONFIRMATIONS = 80
export const PENDING_INTERACTION_TTL_MS = 24 * 60 * 60_000
export const DISCORD_SEND_RETRY_DELAYS_MS = [250, 1_000] as const
export const DISCORD_SYNC_OPERATION_TIMEOUT_MS = 8_000
export const DISCORD_SYNC_BEST_EFFORT_TIMEOUT_MS = 750

export function discordInviteUrl(applicationId: string) {
    const permissions = new PermissionsBitField([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
    ]).bitfield.toString()
    return `https://discord.com/oauth2/authorize?client_id=${applicationId}&permissions=${permissions}&scope=bot%20applications.commands`
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function timeoutError(label: string, timeoutMs: number) {
    return new Error(`Timed out while ${label} after ${timeoutMs}ms`)
}

export function chunkDiscordMessage(content: string) {
    const chunks: string[] = []
    let rest = content.trim() || 'Done.'
    while (rest.length > 0) {
        chunks.push(rest.slice(0, 1900))
        rest = rest.slice(1900)
    }
    return chunks
}

export function truncateDiscordText(value: string, max: number) {
    const compact = value.replace(/\s+/g, ' ').trim()
    return compact.length > max ? `${compact.slice(0, Math.max(0, max - 1))}…` : compact
}

function permissionTitle(request: ChatPermissionRequest) {
    const permission = request.permission || 'permission.required'
    const parts = permission.split('.')
    const raw = parts[parts.length - 1] || 'Permission'
    return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ')
}

export function formatPermissionPrompt(request: ChatPermissionRequest) {
    const lines = [
        `**Permission Required: ${truncateDiscordText(permissionTitle(request), 80)}**`,
        `Permission: \`${truncateDiscordText(request.permission || 'unknown', 120)}\``,
    ]
    if (request.patterns?.length) {
        lines.push(`Patterns: ${request.patterns.slice(0, 8).map((pattern) => `\`${truncateDiscordText(pattern, 80)}\``).join(', ')}`)
    }
    if (request.always?.length) {
        lines.push(`Allow Always will auto-approve: ${request.always.slice(0, 8).map((pattern) => `\`${truncateDiscordText(pattern, 80)}\``).join(', ')}`)
    }
    return lines.join('\n')
}

export function formatQuestionPrompt(request: ChatQuestionRequest) {
    const questions = request.questions || []
    const lines = ['**Studio Question**']
    questions.slice(0, 5).forEach((question, index) => {
        lines.push(`**${index + 1}. ${truncateDiscordText(question.header || 'Question', 80)}**`)
        lines.push(truncateDiscordText(question.question || '', 300))
        if (question.options?.length) {
            lines.push(`Options: ${question.options.slice(0, 8).map((option) => `\`${truncateDiscordText(option.label, 60)}\``).join(', ')}`)
        }
    })
    if (questions.length > 5) {
        lines.push(`This question flow has ${questions.length} questions. Discord can answer the first 5 here; use Studio for the full wizard.`)
    }
    return lines.join('\n')
}

export function workspaceSnapshotFromSaved(workspace: DiscordWorkspaceSnapshot): DiscordWorkspaceSnapshot {
    return {
        ...workspace,
        agents: workspace.agents || [],
        teams: workspace.teams || [],
    }
}

export function workspaceLabel(workingDir: string) {
    const normalized = workingDir.trim().replace(/[\\/]+$/, '')
    return normalized.split(/[/\\]/).pop() || workingDir || 'workspace'
}

export function participantDisplayName(team: DiscordTeamSnapshot, participantKey: string) {
    return team.participants[participantKey]?.displayName?.trim() || participantKey
}
