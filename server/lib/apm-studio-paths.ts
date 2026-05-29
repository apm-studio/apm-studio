import os from 'os'
import path from 'path'
import fs from 'fs/promises'

const APM_STUDIO_STORE_DIR = '.apm-studio'
const APM_USER_SCOPE_DIR = '.apm'

export function getApmStudioDir(cwd = process.cwd()) {
    return path.join(cwd, APM_STUDIO_STORE_DIR)
}

export async function ensureApmStudioDir(cwd: string) {
    const studioDir = getApmStudioDir(cwd)
    await fs.mkdir(studioDir, { recursive: true })
    return studioDir
}

export function getApmUserScopeCwd() {
    const rawInput = process.env.APM_STUDIO_USER_APM_HOME?.trim()
        || path.join(os.homedir(), APM_USER_SCOPE_DIR)
    return path.resolve(rawInput)
}
