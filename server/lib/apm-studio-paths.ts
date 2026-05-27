import os from 'os'
import path from 'path'

export const APM_STUDIO_STORE_DIR = '.apm-studio'

export function getApmStudioDir(cwd = process.cwd()) {
    return path.join(cwd, APM_STUDIO_STORE_DIR)
}

export function getGlobalStudioCwd() {
    const rawInput = process.env.APM_STUDIO_HOME?.trim()
        || os.homedir()
    const normalized = path.resolve(rawInput)
    return path.basename(normalized) === APM_STUDIO_STORE_DIR
        ? path.dirname(normalized)
        : normalized
}
