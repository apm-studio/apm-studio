import { describe, expect, it } from 'vitest'
import {
    extractErrorMessage,
    readMessagePartUpdatedPayload,
    readSessionStatusPayload,
    readToolSuccessPayload,
} from './event-payloads'

describe('session event payload normalization', () => {
    it('normalizes message part updates from the OpenCode event protocol', () => {
        expect(readMessagePartUpdatedPayload({
            part: {
                id: 'part-1',
                type: 'tool',
                sessionID: 'session-1',
                messageID: 'message-1',
                callID: 'call-1',
                tool: 'bash',
                state: {
                    status: 'completed',
                    input: { command: 'npm test' },
                    output: 'ok',
                    metadata: { exitCode: 0 },
                    time: { start: 1, end: 2 },
                },
            },
        })).toEqual({
            sessionId: 'session-1',
            messageId: 'message-1',
            part: {
                id: 'part-1',
                type: 'tool',
                text: undefined,
                tool: 'bash',
                callID: 'call-1',
                state: {
                    status: 'completed',
                    title: undefined,
                    input: { command: 'npm test' },
                    metadata: { exitCode: 0 },
                    output: 'ok',
                    error: undefined,
                    time: { start: 1, end: 2 },
                },
                reason: undefined,
                cost: undefined,
                tokens: undefined,
                auto: undefined,
                overflow: undefined,
            },
        })
    })

    it('does not accept camelCase id aliases at the raw event boundary', () => {
        expect(readMessagePartUpdatedPayload({
            part: {
                id: 'part-1',
                type: 'tool',
                sessionId: 'session-1',
                messageId: 'message-1',
                callId: 'call-1',
            },
        })).toBeNull()
    })

    it('rejects unknown session status values', () => {
        expect(readSessionStatusPayload({
            sessionID: 'session-1',
            status: { type: 'paused' },
        })).toBeNull()
    })

    it('extracts tool success output and provider metadata', () => {
        expect(readToolSuccessPayload({
            sessionID: 'session-1',
            callID: 'call-1',
            content: [
                { text: 'hello' },
                { uri: 'file:///tmp/output.txt' },
                { ignored: true },
            ],
            provider: {
                metadata: { latency: 12 },
            },
        })).toEqual({
            sessionId: 'session-1',
            callId: 'call-1',
            patch: {
                status: 'completed',
                output: 'hello\nfile:///tmp/output.txt',
                metadata: { latency: 12 },
            },
        })
    })

    it('adds useful context to error messages without leaking raw casts', () => {
        expect(extractErrorMessage({
            name: 'ProviderError',
            data: {
                message: 'Rate limit reached',
                statusCode: 429,
                isRetryable: true,
            },
        })).toBe('Rate limit reached (ProviderError, HTTP 429, retryable)')
    })
})
