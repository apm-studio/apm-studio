export const EIGHTPM_STUDIO_TOS_URL = 'https://8pm.studio/tos'

export function confirmRosterTerms(action: 'login') {
    const verb = action === 'login' ? 'signing in' : 'continuing'
    return window.confirm(
        `By ${verb}, you agree to the 8PM Studio Terms of Service.\n\n${EIGHTPM_STUDIO_TOS_URL}\n\nContinue?`,
    )
}
