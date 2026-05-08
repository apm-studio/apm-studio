import fs from 'fs/promises'
import os from 'os'
import path from 'path'

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error
}

function authStoreCandidates() {
    const home = os.homedir()
    const candidates = [
        process.env.OPENCODE_AUTH_PATH,
        process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, 'opencode', 'auth.json') : null,
        path.join(home, '.local', 'share', 'opencode', 'auth.json'),
        path.join(home, 'Library', 'Application Support', 'opencode', 'auth.json'),
        path.join(home, 'AppData', 'Local', 'opencode', 'auth.json'),
    ]

    return candidates.filter((candidate): candidate is string => Boolean(candidate))
}

async function resolveAuthStorePath() {
    for (const candidate of authStoreCandidates()) {
        try {
            await fs.access(candidate)
            return candidate
        } catch {
            continue
        }
    }

    return authStoreCandidates()[0]
}

async function readStoredAuthStore(): Promise<Record<string, unknown>> {
    const authPath = await resolveAuthStorePath()
    if (!authPath) {
        return {}
    }

    try {
        const raw = await fs.readFile(authPath, 'utf-8')
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {}
    } catch (error: unknown) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
            return {}
        }
        throw error
    }
}

export async function readStoredProviderAuthType(providerId: string): Promise<'api' | 'oauth' | 'wellknown' | null> {
    const store = await readStoredAuthStore()
    const normalized = providerId.replace(/\/+$/, '')
    const auth = store[providerId] || store[normalized] || store[`${normalized}/`]
    if (!auth || typeof auth !== 'object') {
        return null
    }
    const type = (auth as Record<string, unknown>).type
    return type === 'api' || type === 'oauth' || type === 'wellknown' ? type : null
}

export async function clearStoredProviderAuth(providerId: string) {
    const authPath = await resolveAuthStorePath()
    if (!authPath) {
        return false
    }

    const current = await readStoredAuthStore()

    const normalized = providerId.replace(/\/+$/, '')
    delete current[providerId]
    delete current[normalized]
    delete current[`${normalized}/`]

    await fs.mkdir(path.dirname(authPath), { recursive: true })
    await fs.writeFile(authPath, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 })
    return true
}
