export const AGENT_ROASTER_TOS_URL = 'https://agentroaster.dev/tos'

export function confirmDotTerms(action: 'login' | 'publish') {
    const verb = action === 'login' ? 'signing in' : 'publishing'
    return window.confirm(
        `By ${verb}, you agree to the Agent Roaster Terms of Service.\n\n${AGENT_ROASTER_TOS_URL}\n\nContinue?`,
    )
}
