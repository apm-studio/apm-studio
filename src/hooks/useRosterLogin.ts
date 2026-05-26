import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { showToast } from '../lib/toast'
import { useRosterAuthUser, queryKeys } from './queries'

const LOGIN_POLL_INTERVAL_MS = 2_000
const LOGIN_POLL_TIMEOUT_MS = 180_000

export function useRosterLogin() {
    const queryClient = useQueryClient()
    const { data: authUser, refetch: refetchAuthUser } = useRosterAuthUser()
    const [startingLogin, setStartingLogin] = useState(false)
    const [awaitingLogin, setAwaitingLogin] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)
    const loginDeadlineRef = useRef<number | null>(null)

    useEffect(() => {
        if (!awaitingLogin || authUser?.authenticated) {
            return
        }

        const timer = window.setInterval(() => {
            if (loginDeadlineRef.current && Date.now() > loginDeadlineRef.current) {
                window.clearInterval(timer)
                loginDeadlineRef.current = null
                setAwaitingLogin(false)
                showToast('8PM Studio login timed out before authentication completed.', 'error', {
                    title: 'Login timed out',
                    dedupeKey: 'roster-login:timeout',
                })
                return
            }
            void refetchAuthUser()
        }, LOGIN_POLL_INTERVAL_MS)

        return () => window.clearInterval(timer)
    }, [authUser?.authenticated, awaitingLogin, refetchAuthUser])

    useEffect(() => {
        if (!awaitingLogin || !authUser?.authenticated) {
            return
        }

        loginDeadlineRef.current = null
        setAwaitingLogin(false)
        queryClient.invalidateQueries({ queryKey: queryKeys.rosterAuthUser })
        showToast(`Signed in as @${authUser.username || 'unknown'}.`, 'success', {
            title: '8PM Studio login complete',
            dedupeKey: 'roster-login:complete',
        })
    }, [authUser?.authenticated, authUser?.username, awaitingLogin, queryClient])

    const startLogin = async (acknowledgedTos = false) => {
        if (startingLogin || awaitingLogin) {
            return
        }

        const popup = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null

        try {
            setStartingLogin(true)
            const result = await api.roster.login(acknowledgedTos)

            if (result.alreadyAuthenticated) {
                popup?.close()
                await refetchAuthUser()
                return
            }

            if (result.started || result.alreadyRunning) {
                let openedInClient = false

                if (result.authUrl && !result.browserOpened) {
                    try {
                        if (popup && !popup.closed) {
                            popup.location.href = result.authUrl
                            openedInClient = true
                        } else {
                            const win = window.open(result.authUrl, '_blank')
                            openedInClient = !!win
                        }
                    } catch {
                        openedInClient = false
                    }
                } else {
                    popup?.close()
                }

                loginDeadlineRef.current = Date.now() + LOGIN_POLL_TIMEOUT_MS
                setAwaitingLogin(true)
                if (result.authUrl && !result.browserOpened && !openedInClient) {
                    showToast('Open the 8PM Studio login flow to continue authentication.', 'warning', {
                        title: '8PM Studio login started',
                        actionLabel: 'Open login',
                        onAction: () => {
                            window.open(result.authUrl, '_blank')
                        },
                        dedupeKey: 'roster-login:started',
                        durationMs: 8000,
                    })
                } else {
                    showToast('Complete 8PM Studio login in the browser to continue.', 'success', {
                        title: '8PM Studio login started',
                        dedupeKey: 'roster-login:started',
                    })
                }
                void refetchAuthUser()
                return
            }

            popup?.close()
        } catch (error: unknown) {
            popup?.close()
            showToast(error instanceof Error ? error.message : 'Failed to start 8PM Studio login.', 'error', {
                title: '8PM Studio login failed',
                dedupeKey: 'roster-login:failed',
            })
        } finally {
            setStartingLogin(false)
        }
    }

    const logout = async () => {
        if (loggingOut) {
            return
        }

        try {
            setLoggingOut(true)
            loginDeadlineRef.current = null
            setAwaitingLogin(false)
            await api.roster.logout()
            await queryClient.invalidateQueries({ queryKey: queryKeys.rosterAuthUser })
            await refetchAuthUser()
            showToast('Signed out from 8PM Studio.', 'success', {
                title: '8PM Studio logout complete',
                dedupeKey: 'roster-login:logout',
            })
        } catch (error: unknown) {
            showToast(error instanceof Error ? error.message : 'Failed to sign out from 8PM Studio.', 'error', {
                title: '8PM Studio logout failed',
                dedupeKey: 'roster-login:logout-failed',
            })
        } finally {
            setLoggingOut(false)
        }
    }

    return {
        authUser,
        startLogin,
        logout,
        isAuthenticating: startingLogin || awaitingLogin,
        isLoggingOut: loggingOut,
    }
}
