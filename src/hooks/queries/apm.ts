import { useQuery } from '@tanstack/react-query'
import { apmApi } from '../../api-clients/apm'
import { useStudioStore } from '../../store'
import type { ApmPackageScope, ApmPackageSummary } from '../../../shared/apm-contracts'
import { queryKeys } from './keys'

export function useApmPackages(enabled = true, scope: ApmPackageScope = 'workspace') {
    const workingDir = useStudioStore((state) => state.workingDir)
    return useQuery<ApmPackageSummary[]>({
        queryKey: queryKeys.apmPackages(workingDir, scope),
        queryFn: async () => (await apmApi.packages(scope)).packages,
        enabled,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
    })
}
