import type { KeyboardEventHandler, RefObject } from 'react'
import { ChevronUp, Send, Square } from 'lucide-react'
import type { RuntimeModelCatalogEntry } from '../../../shared/model-variants'
import { DropdownMenu } from '../../components/shared/DropdownMenu'
import type { AssistantModelSelection } from '../../store/assistant/types'
import { resizeTextarea } from '../../lib/textarea-autosize'

type AssistantComposerProps = {
    textareaRef: RefObject<HTMLTextAreaElement | null>
    input: string
    isLoading: boolean
    canAbort: boolean
    assistantModel: AssistantModelSelection | null
    currentModelLabel: string | null
    groupedModels: Record<string, RuntimeModelCatalogEntry[]>
    onInputChange: (value: string) => void
    onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
    onSend: () => void
    onAbort: () => void
    onModelChange: (model: AssistantModelSelection) => void
}

export default function AssistantComposer({
    textareaRef,
    input,
    isLoading,
    canAbort,
    assistantModel,
    currentModelLabel,
    groupedModels,
    onInputChange,
    onKeyDown,
    onSend,
    onAbort,
    onModelChange,
}: AssistantComposerProps) {
    return (
        <div className="assistant-footer">
            <div className="assistant-input-wrapper">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(event) => {
                        onInputChange(event.target.value)
                        resizeTextarea(event.target, 150)
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={isLoading ? 'Assistant is working...' : 'Ask the assistant...'}
                    className="assistant-input"
                    rows={1}
                    disabled={isLoading || !assistantModel}
                />
                {canAbort ? (
                    <button
                        className="assistant-submit"
                        onClick={onAbort}
                        title="Abort generation"
                    >
                        <Square size={14} fill="currentColor" />
                    </button>
                ) : (
                    <button
                        className="assistant-submit"
                        onClick={onSend}
                        disabled={!input.trim() || !assistantModel}
                        title="Send message"
                    >
                        <Send size={14} />
                    </button>
                )}
            </div>

            <div className="assistant-footer__model-row">
                <DropdownMenu
                    trigger={
                        <button className="assistant-model-pill" title="Change model">
                            <span className="assistant-model-pill__label">{currentModelLabel || 'Select model'}</span>
                            <ChevronUp size={10} />
                        </button>
                    }
                >
                    {Object.entries(groupedModels).map(([providerName, providerModels]) => (
                        <DropdownMenu.Group key={providerName} label={providerName}>
                            {providerModels.map((model) => (
                                <DropdownMenu.Item
                                    key={`${model.provider}:${model.id}`}
                                    active={assistantModel?.provider === model.provider && assistantModel?.modelId === model.id}
                                    onClick={() => onModelChange({ provider: model.provider, modelId: model.id })}
                                >
                                    {model.name}
                                </DropdownMenu.Item>
                            ))}
                        </DropdownMenu.Group>
                    ))}
                </DropdownMenu>
            </div>
        </div>
    )
}
