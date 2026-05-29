import { describe, expect, it } from 'vitest'
import { mapSessionEventMessagePart } from './event-message-parts'

describe('session event message part normalization', () => {
    it('normalizes tool event parts to the Studio chat part contract', () => {
        expect(mapSessionEventMessagePart({
            id: 'tool-1',
            type: 'tool',
            tool: 'apply_patch',
            callID: 'call-1',
            state: {
                status: 'failed',
                title: 'Patch',
                input: { file: 'src/App.tsx' },
                metadata: { stdout: 'done' },
                output: 'ok',
                error: {
                    data: { message: 'Patch failed.' },
                },
                time: { start: 10, end: 20 },
            },
        })).toEqual({
            id: 'tool-1',
            type: 'tool',
            tool: {
                name: 'apply_patch',
                callId: 'call-1',
                status: 'error',
                title: 'Patch',
                input: { file: 'src/App.tsx' },
                metadata: { stdout: 'done' },
                output: 'ok',
                error: 'Patch failed.',
                time: { start: 10, end: 20 },
            },
        })
    })

    it('drops malformed object-only tool fields instead of casting them through', () => {
        expect(mapSessionEventMessagePart({
            id: 'tool-1',
            type: 'tool',
            callID: 'call-1',
            state: {
                status: 'completed',
                input: 'not-an-object',
                metadata: ['not-an-object'],
                output: { text: 'not-a-string' },
                time: { end: 20 },
            },
        })).toEqual({
            id: 'tool-1',
            type: 'tool',
            tool: {
                name: 'unknown',
                callId: 'call-1',
                status: 'completed',
                title: undefined,
                input: undefined,
                metadata: undefined,
                output: undefined,
                error: undefined,
                time: undefined,
            },
        })
    })

    it('drops tool event parts without a real call id', () => {
        expect(mapSessionEventMessagePart({
            id: 'tool-1',
            type: 'tool',
            tool: 'apply_patch',
            state: { status: 'completed' },
        })).toBeNull()
    })

    it('normalizes step-finish tokens only when all token counts are finite numbers', () => {
        expect(mapSessionEventMessagePart({
            id: 'step-1',
            type: 'step-finish',
            reason: 'complete',
            cost: 0.25,
            tokens: { input: 1, output: 2, reasoning: 3 },
        })).toEqual({
            id: 'step-1',
            type: 'step-finish',
            step: {
                reason: 'complete',
                cost: 0.25,
                tokens: { input: 1, output: 2, reasoning: 3 },
            },
        })

        expect(mapSessionEventMessagePart({
            id: 'step-2',
            type: 'step-finish',
            tokens: { input: 1, output: 2 },
        })).toEqual({
            id: 'step-2',
            type: 'step-finish',
            step: {
                reason: undefined,
                cost: undefined,
                tokens: undefined,
            },
        })
    })
})
