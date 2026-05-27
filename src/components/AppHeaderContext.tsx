import { createContext, useContext, useEffect } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'

export type AppHeaderConfig = {
    title?: ReactNode
    subtitle?: ReactNode
    actions?: ReactNode
}

export type AppHeaderSetter = Dispatch<SetStateAction<AppHeaderConfig | null>>

export const AppHeaderContext = createContext<AppHeaderSetter | null>(null)

export function useAppHeader(config: AppHeaderConfig | null) {
    const setHeader = useContext(AppHeaderContext)

    useEffect(() => {
        if (!setHeader) return
        setHeader(config)
        return () => setHeader(null)
    }, [config, setHeader])
}
