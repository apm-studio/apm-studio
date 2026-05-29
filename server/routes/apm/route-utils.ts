import type { Context } from 'hono'

import { normalizeApmPackageScope } from '../../../shared/apm-contracts.js'
import { getApmUserScopeCwd } from '../../lib/apm-studio-paths.js'
import { requestWorkingDir } from '../route-errors.js'

export function errorMessage(error: unknown, fallback = 'APM package operation failed.') {
    return error instanceof Error && error.message ? error.message : fallback
}

export function requestApmPackageWorkingDir(c: Context, scope?: string) {
    return normalizeApmPackageScope(scope) === 'user' ? getApmUserScopeCwd() : requestWorkingDir(c)
}
