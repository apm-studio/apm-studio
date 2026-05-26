export const AGENT_ROSTER_TOS_URL = 'https://agentroster.dev/tos'

export function confirmRosterTerms(action: 'login' | 'publish') {
    const verb = action === 'login' ? 'signing in' : 'publishing'
    return window.confirm(
        `By ${verb}, you agree to the Agent Roster Terms of Service.\n\n${AGENT_ROSTER_TOS_URL}\n\nContinue?`,
    )
}
