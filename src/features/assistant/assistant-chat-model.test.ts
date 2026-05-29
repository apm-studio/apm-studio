import { describe, expect, it } from 'vitest'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import {
    buildAssistantActionStatusView,
    groupAssistantModelsByProvider,
    resolveAssistantModelLabel,
    resolveAssistantStatusLabel,
} from './assistant-chat-model'

function model(provider: string, providerName: string, id: string, name: string): RuntimeModelCatalogEntry {
    return {
        provider,
        providerName,
        id,
        name,
        connected: true,
        context: 1,
        output: 1,
        toolCall: true,
        reasoning: false,
        attachment: false,
        temperature: true,
        modalities: { input: ['text'], output: ['text'] },
        variants: [],
    }
}

describe('assistant chat model', () => {
    it('groups connected models by provider display name', () => {
        expect(groupAssistantModelsByProvider([
            model('openai', 'OpenAI', 'gpt-5', 'GPT-5'),
            model('openai', 'OpenAI', 'gpt-5-mini', 'GPT-5 mini'),
            model('anthropic', 'Anthropic', 'claude', 'Claude'),
        ])).toEqual({
            OpenAI: [
                expect.objectContaining({ id: 'gpt-5' }),
                expect.objectContaining({ id: 'gpt-5-mini' }),
            ],
            Anthropic: [
                expect.objectContaining({ id: 'claude' }),
            ],
        })
    })

    it('resolves current model label with catalog fallback', () => {
        expect(resolveAssistantModelLabel(
            { provider: 'openai', modelId: 'gpt-5' },
            model('openai', 'OpenAI', 'gpt-5', 'GPT-5'),
        )).toBe('GPT-5')
        expect(resolveAssistantModelLabel(
            { provider: 'openai', modelId: 'custom' },
            null,
        )).toBe('custom')
        expect(resolveAssistantModelLabel(null, null)).toBeNull()
    })

    it('maps session state to compact status labels', () => {
        expect(resolveAssistantStatusLabel({
            isLoading: true,
            activityKind: 'idle',
            sessionId: null,
        })).toBe('Thinking')
        expect(resolveAssistantStatusLabel({
            isLoading: false,
            activityKind: 'interactive',
            sessionId: 'session-1',
        })).toBe('Needs input')
        expect(resolveAssistantStatusLabel({
            isLoading: false,
            activityKind: 'idle',
            sessionId: 'session-1',
            sessionStatusType: 'error',
        })).toBe('Needs attention')
    })

    it('builds assistant action apply summaries', () => {
        expect(buildAssistantActionStatusView({ applied: 1, failed: 0 })).toEqual({
            toneClass: 'assistant-action-status--success',
            label: 'Applied 1 change',
        })
        expect(buildAssistantActionStatusView({ applied: 2, failed: 1 })).toEqual({
            toneClass: 'assistant-action-status--warning',
            label: 'Applied 2, failed 1',
        })
        expect(buildAssistantActionStatusView({ applied: 0, failed: 2 })).toEqual({
            toneClass: 'assistant-action-status--error',
            label: 'No changes applied (2 failed)',
        })
    })
})
