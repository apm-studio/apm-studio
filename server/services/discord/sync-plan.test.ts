import { describe, expect, it } from 'vitest'
import {
    actCategoryName,
    actThreadChannelName,
    actThreadMappingKey,
    archiveCategoryName,
    controlChannelName,
    entityCategoryName,
    isStudioEntityCategoryName,
    performerChannelName,
    performerCategoryName,
    performerThreadMappingKey,
    pruneStaleDiscordThreadMappings,
    sanitizeDiscordName,
    threadChannelName,
    unnamedThreadNameFor,
    workspaceCategoryName,
} from './sync-plan.js'

describe('discord sync plan helpers', () => {
    it('normalizes Discord channel names without losing useful labels', () => {
        expect(sanitizeDiscordName('Research Lead!!')).toBe('research-lead')
        expect(performerChannelName('Code Reviewer')).toBe('code-reviewer')
        expect(threadChannelName('First Thread', 'thread-123456')).toBe('first-thread')
        expect(threadChannelName(undefined, 'thread-123456')).toBe('new-thread-1')
        expect(actThreadChannelName('Review Act', 'First Thread')).toBe('first-thread')
        expect(entityCategoryName('Review Act')).toBe('Review Act')
        expect(performerCategoryName('Code Reviewer')).toBe('👤 Code Reviewer')
        expect(actCategoryName('Review Act')).toBe('👥 Review Act')
        expect(isStudioEntityCategoryName('👤 Code Reviewer')).toBe(true)
        expect(isStudioEntityCategoryName('👥 Review Act')).toBe(true)
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
        expect(actThreadMappingKey('act-1', 'thread-1')).toBe('act-1:thread-1')
        expect(performerThreadMappingKey('performer-1', 'session-1')).toBe('performer-1:session-1')
    })

    it('keeps workspace categories human-readable', () => {
        expect(workspaceCategoryName('/tmp/dance-workspace')).toBe('dance-workspace')
        expect(archiveCategoryName()).toBe('archived')
        expect(controlChannelName()).toBe('studio-control')
    })

    it('prunes Discord thread channel mappings that are no longer in Studio', () => {
        const mapping = {
            performerThreadChannels: {
                [performerThreadMappingKey('performer-1', 'session-live')]: 'channel-performer-live',
                [performerThreadMappingKey('performer-1', 'session-stale')]: 'channel-performer-stale',
                [performerThreadMappingKey('performer-deleted', 'session-old')]: 'channel-performer-deleted',
            },
            actThreadChannels: {
                [actThreadMappingKey('act-1', 'thread-live')]: 'channel-act-live',
                [actThreadMappingKey('act-1', 'thread-stale')]: 'channel-act-stale',
                [actThreadMappingKey('act-deleted', 'thread-old')]: 'channel-act-deleted',
            },
            backfilledMessageIds: {
                'channel-performer-live': ['message-1'],
                'channel-performer-stale': ['message-2'],
                'channel-act-stale': ['message-3'],
            },
        }

        const cleanup = pruneStaleDiscordThreadMappings({
            mapping,
            performerThreadIds: {
                'performer-1': ['session-live'],
            },
            actThreadIds: {
                'act-1': ['thread-live'],
            },
        })

        expect(cleanup.staleChannelIds.sort()).toEqual([
            'channel-act-deleted',
            'channel-act-stale',
            'channel-performer-deleted',
            'channel-performer-stale',
        ])
        expect(mapping.performerThreadChannels).toEqual({
            [performerThreadMappingKey('performer-1', 'session-live')]: 'channel-performer-live',
        })
        expect(mapping.actThreadChannels).toEqual({
            [actThreadMappingKey('act-1', 'thread-live')]: 'channel-act-live',
        })
        expect(mapping.backfilledMessageIds).toEqual({
            'channel-performer-live': ['message-1'],
        })
    })

    it('keeps mapped threads when an active owner thread list could not be read', () => {
        const mapping = {
            performerThreadChannels: {
                [performerThreadMappingKey('performer-1', 'session-unknown')]: 'channel-performer-unknown',
                [performerThreadMappingKey('performer-deleted', 'session-old')]: 'channel-performer-deleted',
            },
            actThreadChannels: {
                [actThreadMappingKey('act-1', 'thread-unknown')]: 'channel-act-unknown',
                [actThreadMappingKey('act-deleted', 'thread-old')]: 'channel-act-deleted',
            },
        }

        const cleanup = pruneStaleDiscordThreadMappings({
            mapping,
            performerThreadIds: {
                'performer-1': null,
            },
            actThreadIds: {
                'act-1': undefined,
            },
        })

        expect(cleanup.staleChannelIds.sort()).toEqual([
            'channel-act-deleted',
            'channel-performer-deleted',
        ])
        expect(mapping.performerThreadChannels).toEqual({
            [performerThreadMappingKey('performer-1', 'session-unknown')]: 'channel-performer-unknown',
        })
        expect(mapping.actThreadChannels).toEqual({
            [actThreadMappingKey('act-1', 'thread-unknown')]: 'channel-act-unknown',
        })
    })
})
