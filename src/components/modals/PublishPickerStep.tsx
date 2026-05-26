import { FileText, Wand2, Zap } from 'lucide-react'
import { EIGHTPM_STUDIO_TOS_URL } from '../../lib/roster-terms'
import { PickerSection } from './publish-modal-utils'
import type { PickerItem } from './publish-modal-utils'

type Props = {
    pickerItems: PickerItem[]
    authUser: { authenticated?: boolean } | null | undefined
    isAuthenticating: boolean
    onPick: (item: PickerItem) => void
    onStartLogin: () => void
}

export default function PublishPickerStep({
    pickerItems,
    authUser,
    isAuthenticating,
    onPick,
    onStartLogin,
}: Props) {
    const talItems = pickerItems.filter((item) => item.kind === 'tal')
    const performerItems = pickerItems.filter((item) => item.kind === 'performer')
    const actItems = pickerItems.filter((item) => item.kind === 'act')

    return (
        <div className="publish-modal__body">
            {pickerItems.length === 0 ? (
                <div className="publish-modal__empty">
                    No savable Instruction, Agent, or Team assets. Export Skill drafts, upload them to GitHub, and import them from Packages.
                </div>
            ) : (
                <>
                    {talItems.length > 0 && (
                        <PickerSection title="Instructions" items={talItems} onPick={onPick} icon={<FileText size={12} />} />
                    )}
                    {performerItems.length > 0 && (
                        <PickerSection title="Agents" items={performerItems} onPick={onPick} icon={<Wand2 size={12} />} />
                    )}
                    {actItems.length > 0 && (
                        <PickerSection title="Teams" items={actItems} onPick={onPick} icon={<Zap size={12} />} />
                    )}
                </>
            )}

            {!authUser?.authenticated && (
                <div className="publish-modal__auth-callout">
                    <div>
                        <strong>8PM Studio sign-in required</strong>
                        <p>
                            Save Local uses your 8PM Studio namespace.
                            By signing in, you agree to the 8PM Studio Terms of Service:
                            {' '}
                            <a href={EIGHTPM_STUDIO_TOS_URL} target="_blank" rel="noreferrer">{EIGHTPM_STUDIO_TOS_URL}</a>
                        </p>
                    </div>
                    <button
                        className="publish-modal__action publish-modal__action--auth"
                        onClick={onStartLogin}
                        disabled={isAuthenticating}
                    >
                        {isAuthenticating ? 'Signing in…' : 'Sign in'}
                    </button>
                </div>
            )}
        </div>
    )
}
