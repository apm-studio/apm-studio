// APM Studio — Hono API Server (Entry Point)

import { serve } from '@hono/node-server'
import { WebSocketServer } from 'ws'
import { createServerApp } from './app.js'
import { refreshAssistantProjectionOnServerStartup } from './services/studio-assistant/assistant-startup-service.js'

// Config
import { PORT, OPENCODE_URL, STUDIO_DIR, IS_PRODUCTION, getActiveProjectDir } from './lib/config.js'
import { ensureOpencodeSidecar, stopOpencodeSidecar } from './lib/opencode-sidecar.js'
import { discordIntegrationService } from './services/discord/discord-service.js'
import { terminalManager } from './services/terminal/service.js'

const app = createServerApp()
let server: ReturnType<typeof serve> | null = null
let shuttingDown = false

async function initializeStartupServices() {
    await ensureOpencodeSidecar().catch((err) => {
        console.warn(`OpenCode sidecar is not ready yet: ${err instanceof Error ? err.message : String(err)}`)
    })
    await refreshAssistantProjectionOnServerStartup().catch((err) => {
        console.warn(`APM Assistant projection refresh failed on startup: ${err instanceof Error ? err.message : String(err)}`)
    })
    await discordIntegrationService.initialize().catch((err) => {
        console.warn(`Discord integration startup failed: ${err instanceof Error ? err.message : String(err)}`)
    })
}

function closeServer() {
    return new Promise<void>((resolve) => {
        if (!server) {
            resolve()
            return
        }
        server.close(() => resolve())
    })
}

async function shutdown(signal: NodeJS.Signals) {
    if (shuttingDown) {
        return
    }
    shuttingDown = true

    console.log(`\n${signal} received. Shutting down APM Studio...`)
    await closeServer().catch(() => {})
    terminalManager.disposeAll()
    await stopOpencodeSidecar().catch((err) => {
        console.warn(`OpenCode sidecar shutdown failed: ${err instanceof Error ? err.message : String(err)}`)
    })
    process.exit(0)
}

process.once('SIGINT', () => {
    void shutdown('SIGINT')
})
process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
})

console.log(`\nAPM Studio Server${IS_PRODUCTION ? ' (production)' : ' (dev)'}`)
console.log(`   API:      http://localhost:${PORT}`)
console.log(`   OpenCode: ${OPENCODE_URL} (managed sidecar)`)
console.log(`   Project:  ${getActiveProjectDir()}`)
console.log(`   Data:     ${STUDIO_DIR}\n`)

server = serve({
    fetch: app.fetch,
    port: PORT,
    websocket: { server: new WebSocketServer({ noServer: true }) },
})
console.log('   Terminal: WebSocket on /ws/terminal (Hono-managed PTY)')

void initializeStartupServices()
