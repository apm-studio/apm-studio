import path from 'path'

export const EIGHT_PM_STORE_DIR = '.8pm-studio'
export const PACKAGE_DIR = 'packages'
export const MANIFEST_FILE = 'apm.yml'
export const LOCK_FILE = 'apm.lock.yaml'
export const APM_VERSION = '8pm-studio-native-v1'

export function sanitizePackageId(value: string) {
    const sanitized = value
        .trim()
        .replace(/\\/g, '-')
        .replace(/\//g, '-')
        .replace(/\.\./g, '-')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
    return sanitized || 'package'
}

export function toPosixPath(value: string) {
    return value.replace(/\\/g, '/')
}

export function eightPmDir(workingDir: string) {
    return path.join(workingDir, EIGHT_PM_STORE_DIR)
}

export function packageRoot(workingDir: string) {
    return path.join(eightPmDir(workingDir), PACKAGE_DIR)
}

export function packageDir(workingDir: string, packageId: string) {
    return path.join(packageRoot(workingDir), sanitizePackageId(packageId))
}

export function manifestPath(workingDir: string, packageId: string) {
    return path.join(packageDir(workingDir, packageId), MANIFEST_FILE)
}

export function lockPath(workingDir: string, packageId: string) {
    return path.join(packageDir(workingDir, packageId), LOCK_FILE)
}

export function localWorkspacePath(workingDir: string) {
    return path.join(eightPmDir(workingDir), 'workspace.json')
}
