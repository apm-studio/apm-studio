import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { createServerApp } from './app.js'

const fixtureDirs: string[] = []

async function createClientFixture() {
    const clientDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apm-studio-client-'))
    fixtureDirs.push(clientDir)

    await fs.writeFile(path.join(clientDir, 'index.html'), '<!doctype html><div id="root"></div>', 'utf-8')
    await fs.writeFile(path.join(clientDir, 'apm-studio-icon.png'), 'logo', 'utf-8')

    return clientDir
}

describe('production client serving', () => {
    afterEach(async () => {
        await Promise.all(fixtureDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
    })

    it('serves root public assets before the SPA fallback', async () => {
        const clientDir = await createClientFixture()
        const app = createServerApp({ clientDir, production: true })

        const response = await app.request('/apm-studio-icon.png')

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('image/png')
        expect(await response.text()).toBe('logo')
    })

    it('keeps client routes on the SPA fallback', async () => {
        const clientDir = await createClientFixture()
        const app = createServerApp({ clientDir, production: true })

        const response = await app.request('/workspace/example')

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('text/html')
        expect(await response.text()).toContain('<div id="root"></div>')
    })

    it('keeps API routes ahead of static client routes', async () => {
        const clientDir = await createClientFixture()
        const app = createServerApp({ clientDir, production: true })

        const response = await app.request('/api/health')

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('application/json')
        await expect(response.json()).resolves.toMatchObject({ ok: true })
    })
})
