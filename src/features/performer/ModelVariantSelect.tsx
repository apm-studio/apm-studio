import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useModels } from '../../hooks/queries'
import type { ModelConfig } from '../../types'
import { findRuntimeModel, findRuntimeModelVariant } from '../../../shared/model-variants'

type ModelVariantSelectProps = {
    model: ModelConfig | null
    value: string | null | undefined
    onChange: (value: string | null) => void
    className?: string
    compact?: boolean
    titlePrefix?: string
    disabled?: boolean
    popoverPlacement?: 'top' | 'bottom'
}

export default function ModelVariantSelect({
    model,
    value,
    onChange,
    className,
    compact = false,
    titlePrefix = 'Variant',
    disabled = false,
    popoverPlacement = 'bottom',
}: ModelVariantSelectProps) {
    const { data: models = [] } = useModels(!!model)
    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const popoverRef = useRef<HTMLDivElement | null>(null)
    const shouldRestoreFocusRef = useRef(false)
    const [open, setOpen] = useState(false)
    const [popoverRect, setPopoverRect] = useState<{ left: number; top: number; width: number } | null>(null)
    const selectedModel = useMemo(
        () => findRuntimeModel(models, model?.provider, model?.modelId),
        [models, model?.modelId, model?.provider],
    )
    const variants = selectedModel?.variants || []
    const selectedVariant = useMemo(
        () => findRuntimeModelVariant(models, model?.provider, model?.modelId, value || null),
        [models, model?.modelId, model?.provider, value],
    )

    useEffect(() => {
        if (value && !selectedVariant) {
            onChange(null)
        }
    }, [onChange, selectedVariant, value])

    useEffect(() => {
        if (!open) return

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node
            if (!wrapperRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
                shouldRestoreFocusRef.current = false
                setOpen(false)
            }
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                shouldRestoreFocusRef.current = true
                setOpen(false)
            }
        }

        document.addEventListener('mousedown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('mousedown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [open])

    useEffect(() => {
        if (!open) return

        const updatePopoverRect = () => {
            const trigger = triggerRef.current
            if (!trigger) return
            const rect = trigger.getBoundingClientRect()
            setPopoverRect({
                left: rect.left,
                top: popoverPlacement === 'top' ? rect.top - 6 : rect.bottom + 6,
                width: rect.width,
            })
        }

        updatePopoverRect()
        window.addEventListener('resize', updatePopoverRect)
        window.addEventListener('scroll', updatePopoverRect, true)
        return () => {
            window.removeEventListener('resize', updatePopoverRect)
            window.removeEventListener('scroll', updatePopoverRect, true)
        }
    }, [open, popoverPlacement])

    useEffect(() => {
        if (!open || !popoverRect) return

        const frame = window.requestAnimationFrame(() => {
            const options = Array.from(
                popoverRef.current?.querySelectorAll<HTMLButtonElement>('.model-variant-select__option') ?? [],
            )
            const selectedOption = options.find((option) => option.dataset.variantId === (value || '')) || options[0]
            selectedOption?.focus()
        })

        return () => window.cancelAnimationFrame(frame)
    }, [open, popoverRect, value])

    useEffect(() => {
        if (open || !shouldRestoreFocusRef.current) return
        shouldRestoreFocusRef.current = false
        triggerRef.current?.focus()
    }, [open])

    if (!model || variants.length === 0) {
        return null
    }

    const buttonTitle = value
        ? `${titlePrefix}: ${value}${selectedVariant?.summary ? ` · ${selectedVariant.summary}` : ''}`
        : `${titlePrefix}: default`
    const rootClassName = className
        ? `model-variant-select model-variant-select--${popoverPlacement} ${className}`
        : `model-variant-select model-variant-select--${popoverPlacement}`
    const handleTriggerClick = () => {
        shouldRestoreFocusRef.current = true
        if (!open) {
            setPopoverRect(null)
        }
        setOpen((current) => !current)
    }
    const closeWithFocusRestore = () => {
        shouldRestoreFocusRef.current = true
        setOpen(false)
    }

    return (
        <div className={rootClassName} ref={wrapperRef}>
            {!compact ? <span>Variant</span> : null}
            <button
                ref={triggerRef}
                type="button"
                className="model-variant-select__trigger"
                disabled={disabled}
                onClick={handleTriggerClick}
                title={buttonTitle}
                aria-expanded={open}
            >
                <span className="model-variant-select__trigger-label">{value || 'Default'}</span>
                <ChevronDown size={12} />
            </button>
            {open && popoverRect ? createPortal(
                <div
                    ref={popoverRef}
                    className="model-variant-select__popover model-variant-select__popover--floating"
                    style={{
                        left: popoverRect.left,
                        top: popoverRect.top,
                        width: popoverRect.width,
                        transform: popoverPlacement === 'top' ? 'translateY(-100%)' : undefined,
                    }}
                >
                    <div className="model-variant-select__options">
                        <button
                            type="button"
                            className={`model-variant-select__option ${!value ? 'is-selected' : ''}`}
                            data-variant-id=""
                            onClick={() => {
                                onChange(null)
                                closeWithFocusRestore()
                            }}
                            title={`${titlePrefix}: default`}
                        >
                            <span>Default</span>
                        </button>
                        {variants.map((variant) => (
                            <button
                                key={variant.id}
                                type="button"
                                className={`model-variant-select__option ${value === variant.id ? 'is-selected' : ''}`}
                                data-variant-id={variant.id}
                                onClick={() => {
                                    onChange(variant.id)
                                    closeWithFocusRestore()
                                }}
                                title={`${variant.id} · ${variant.summary}`}
                            >
                                <span>{variant.id}</span>
                            </button>
                        ))}
                    </div>
                </div>,
                document.body,
            ) : null}
        </div>
    )
}
