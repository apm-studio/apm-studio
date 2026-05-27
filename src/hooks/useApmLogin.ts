import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { showToast } from '../lib/toast'
import { useApmAuthUser, queryKeys } from './queries'

const LOGIN_POLL_INTERVAL_MS = 2_000
const LOGIN_POLL_TIMEOUT_MS = 180_000

export function useApmLogin() {
    const queryClient = useQueryClient()
    const { data: authUser, refetch: refetchAuthUser } = useApmAuthUser()
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
                showToast('APM Studio login timed out before authentication completed.', 'error', {
                    title: 'Login timed out',
                    dedupeKey: 'apm-login:timeout',
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
        queryClient.invalidateQueries({ queryKey: queryKeys.apmAuthUser })
        showToast(`Signed in as @${authUser.username || 'unknown'}.`, 'success', {
            title: 'APM Studio login complete',
            dedupeKey: 'apm-login:complete',
        })
    }, [authUser?.authenticated, authUser?.username, awaitingLogin, queryClient])

    const startLogin = async (acknowledgedTos = false) => {
        if (startingLogin || awaitingLogin) {
            return
        }

        const popup = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null

        try {
            setStartingLogin(true)
            const result = await api.apmAssets.login(acknowledgedTos)

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
                    showToast('Open the APM Studio login flow to continue authentication.', 'warning', {
                        title: 'APM Studio login started',
                        actionLabel: 'Open login',
                        onAction: () => {
                            window.open(result.authUrl, '_blank')
                        },
                        dedupeKey: 'apm-login:started',
                        durationMs: 8000,
                    })
                } else {
                    showToast('Complete APM Studio login in the browser to continue.', 'success', {
                        title: 'APM Studio login started',
                        dedupeKey: 'apm-login:started',
                    })
                }
                void refetchAuthUser()
                return
            }

            popup?.close()
        } catch (error: unknown) {
            popup?.close()
            showToast(error instanceof Error ? error.message : 'Failed to start APM Studio login.', 'error', {
                title: 'APM Studio login failed',
                dedupeKey: 'apm-login:failed',
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
            await api.apmAssets.logout()
            await queryClient.invalidateQueries({ queryKey: queryKeys.apmAuthUser })
            await refetchAuthUser()
            showToast('Signed out from APM Studio.', 'success', {
                title: 'APM Studio logout complete',
                dedupeKey: 'apm-login:logout',
            })
        } catch (error: unknown) {
            showToast(error instanceof Error ? error.message : 'Failed to sign out from APM Studio.', 'error', {
                title: 'APM Studio logout failed',
                dedupeKey: 'apm-login:logout-failed',
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
