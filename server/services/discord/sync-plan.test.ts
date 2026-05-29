import { describe, expect, it } from 'vitest'
import {
    teamCategoryName,
    teamThreadChannelName,
    teamThreadMappingKey,
    archiveCategoryName,
    controlChannelName,
    entityCategoryName,
    isStudioEntityCategoryName,
    agentChannelName,
    agentCategoryName,
    agentThreadMappingKey,
    pruneStaleDiscordThreadMappings,
    sanitizeDiscordName,
    threadChannelName,
    unnamedThreadNameFor,
    workspaceCategoryName,
} from './sync-plan.js'

describe('discord sync plan helpers', () => {
    it('normalizes Discord channel names without losing useful labels', () => {
        expect(sanitizeDiscordName('Research Lead!!')).toBe('research-lead')
        expect(agentChannelName('Code Reviewer')).toBe('code-reviewer')
        expect(threadChannelName('First Thread', 'thread-123456')).toBe('first-thread')
        expect(threadChannelName(undefined, 'thread-123456')).toBe('new-thread-1')
        expect(teamThreadChannelName('Review Team', 'First Thread')).toBe('first-thread')
        expect(entityCategoryName('Review Team')).toBe('Review Team')
        expect(agentCategoryName('Code Reviewer')).toBe('👤 Code Reviewer')
        expect(teamCategoryName('Review Team')).toBe('👥 Review Team')
        expect(isStudioEntityCategoryName('👤 Code Reviewer')).toBe(true)
        expect(isStudioEntityCategoryName('👥 Review Team')).toBe(true)
        expect(isStudioEntityCategoryName('studio-workspace')).toBe(false)
    })

    it('names unnamed threads by stable creation order without leaking ids', () => {
        const threads = [
            { id: 'thread-newer', createdAt: 30 },
            { id: 'thread-named', name: 'Release notes', createdAt: 20 },
            { id: 'thread-older', createdAt: 10 },
        ]

        expect(unnamedThreadNameFor(threads, 'thread-older')).toBe('New thread (1)')
        expect(unnamedThreadNameFor(threads, 'thread-newer')).toBe('New thread (2)')
        expect(threadChannelName(unnamedThreadNameFor(threads, 'thread-newer'), 'thread-newer')).toBe('new-thread-2')
    })

    it('builds stable mapping keys', () => {
        expect(teamThreadMappingKey('team-1', 'thread-1')).toBe('team-1:thread-1')
        expect(agentThreadMappingKey('agent-1', 'session-1')).toBe('agent-1:session-1')
    })

    it('keeps workspace categories human-readable', () => {
        expect(workspaceCategoryName('/tmp/studio-workspace')).toBe('studio-workspace')
        expect(archiveCategoryName()).toBe('archived')
        expect(controlChannelName()).toBe('studio-control')
    })

    it('prunes Discord thread channel mappings that are no longer in Studio', () => {
        const mapping = {
            agentThreadChannels: {
                [agentThreadMappingKey('agent-1', 'session-live')]: 'channel-agent-live',
                [agentThreadMappingKey('agent-1', 'session-stale')]: 'channel-agent-stale',
                [agentThreadMappingKey('agent-deleted', 'session-old')]: 'channel-agent-deleted',
            },
            teamThreadChannels: {
                [teamThreadMappingKey('team-1', 'thread-live')]: 'channel-team-live',
                [teamThreadMappingKey('team-1', 'thread-stale')]: 'channel-team-stale',
                [teamThreadMappingKey('team-deleted', 'thread-old')]: 'channel-team-deleted',
            },
            backfilledMessageIds: {
                'channel-agent-live': ['message-1'],
                'channel-agent-stale': ['message-2'],
                'channel-team-stale': ['message-3'],
            },
        }

        const cleanup = pruneStaleDiscordThreadMappings({
            mapping,
            agentThreadIds: {
                'agent-1': ['session-live'],
            },
            teamThreadIds: {
                'team-1': ['thread-live'],
            },
        })

        expect(cleanup.staleChannelIds.sort()).toEqual([
            'channel-agent-deleted',
            'channel-agent-stale',
            'channel-team-deleted',
            'channel-team-stale',
        ])
        expect(mapping.agentThreadChannels).toEqual({
            [agentThreadMappingKey('agent-1', 'session-live')]: 'channel-agent-live',
        })
        expect(mapping.teamThreadChannels).toEqual({
            [teamThreadMappingKey('team-1', 'thread-live')]: 'channel-team-live',
        })
        expect(mapping.backfilledMessageIds).toEqual({
            'channel-agent-live': ['message-1'],
        })
    })

    it('keeps mapped threads when an active owner thread list could not be read', () => {
        const mapping = {
            agentThreadChannels: {
                [agentThreadMappingKey('agent-1', 'session-unknown')]: 'channel-agent-unknown',
                [agentThreadMappingKey('agent-deleted', 'session-old')]: 'channel-agent-deleted',
            },
            teamThreadChannels: {
                [teamThreadMappingKey('team-1', 'thread-unknown')]: 'channel-team-unknown',
                [teamThreadMappingKey('team-deleted', 'thread-old')]: 'channel-team-deleted',
            },
        }

        const cleanup = pruneStaleDiscordThreadMappings({
            mapping,
            agentThreadIds: {
                'agent-1': null,
            },
            teamThreadIds: {
                'team-1': undefined,
            },
        })

        expect(cleanup.staleChannelIds.sort()).toEqual([
            'channel-agent-deleted',
            'channel-team-deleted',
        ])
        expect(mapping.agentThreadChannels).toEqual({
            [agentThreadMappingKey('agent-1', 'session-unknown')]: 'channel-agent-unknown',
        })
        expect(mapping.teamThreadChannels).toEqual({
            [teamThreadMappingKey('team-1', 'thread-unknown')]: 'channel-team-unknown',
        })
    })
})
