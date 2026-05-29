import { restartOpencodeSidecar } from '../../lib/opencode-sidecar.js'
import type { OpenCodeRestartResponse } from '../../../shared/opencode-contracts.js'

export async function restartManagedOpenCode(): Promise<OpenCodeRestartResponse> {
    await restartOpencodeSidecar()
    return {
        ok: true as const,
        managed: true,
        mode: 'managed' as const,
    }
}
