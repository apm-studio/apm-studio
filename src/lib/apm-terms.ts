export const APM_STUDIO_TOS_URL = 'https://apm.studio/tos'

export function confirmApmTerms(action: 'login') {
    const verb = action === 'login' ? 'signing in' : 'continuing'
    return window.confirm(
        `By ${verb}, you agree to the APM Studio Terms of Service.\n\n${APM_STUDIO_TOS_URL}\n\nContinue?`,
    )
}
